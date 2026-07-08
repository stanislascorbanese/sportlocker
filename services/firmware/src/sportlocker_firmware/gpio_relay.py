"""Couche GPIO bas-niveau — banc de relais casiers (fail-secure).

Isole toute la logique matérielle (RPi.GPIO, pulse LOW temporisé, watchdog de
sécurité, retour HIGH fail-secure, suivi d'état par casier) *hors* du chemin de
sécurité JWT du ``LockerController`` — qui se contente désormais de composer
cette classe. Ça donne un point unique testable pour piloter les vraies GPIO du
Raspberry Pi CM4 sans polluer l'orchestration sécurité.

Câblage de référence (bench test CM4 IO Board, carte relais 8CH active-LOW avec
optocoupleurs PC817, jumper JD-VCC) :

    locker_1 → BCM17 / pin11 (IN1)      locker_3 → BCM22 / pin15 (IN3)
    locker_2 → BCM27 / pin13 (IN2)      locker_4 → BCM23 / pin16 (IN4)

Fail-secure (cf. ``BENCH_TEST.md`` §0) :
  - broche **HIGH** au repos → relais OFF → solénoïde hors tension → **verrouillé**
  - pulse **LOW** ~0.5 s     → relais ON  → solénoïde alimenté    → **déverrouillé**
  - retour HIGH **systématique** (même sur erreur/timeout) → jamais fail-open.

Le watchdog ``timeout_s`` protège du driver GPIO qui resterait bloqué
(``/dev/gpiomem`` inaccessible, fs en lecture seule) : au-delà du délai on
abandonne le pulse et on force HIGH. Le pulse tourne dans un thread daemon pour
ne jamais figer l'appelant (callback paho, coroutine asyncio).
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Any

import structlog

log = structlog.get_logger(__name__)

# Durée du pulse LOW par défaut (déverrouillage). ~0.5 s suffit à armer le
# solénoïde ; ne jamais le laisser alimenté en continu (échauffement).
GPIO_PULSE_SECONDS = 0.5
DEFAULT_PULSE_MS = 500

# Watchdog défensif : le pulse réel prend ~0.5 s ; 5 s laisse une marge
# confortable mais protège d'un driver bloqué.
GPIO_PULSE_TIMEOUT_S = 5.0
GPIO_PULSE_MAX_RETRIES = 1

# Mapping physique de référence pour le banc de test (casier → pin BCM).
# En prod, le mapping réel (UUID casier → pin) vient de ``calibration.json``.
BENCH_GPIO_MAPPING: dict[str, int] = {
    "locker_1": 17,
    "locker_2": 27,
    "locker_3": 22,
    "locker_4": 23,
}

STATE_HIGH = "HIGH"
STATE_LOW = "LOW"
STATE_UNKNOWN = "unknown"

try:
    import RPi.GPIO as GPIO

    _GPIO_AVAILABLE = True
except (ImportError, RuntimeError):
    GPIO = None
    _GPIO_AVAILABLE = False


@dataclass(frozen=True)
class LockerStatus:
    """Snapshot de l'état GPIO d'un casier (exposé au heartbeat / diagnostic)."""

    locker_id: str
    pin: int | None
    gpio_state: str
    last_open_at: int | None
    error: str | None

    def as_dict(self) -> dict[str, Any]:
        return {
            "locker_id": self.locker_id,
            "pin": self.pin,
            "gpio_state": self.gpio_state,
            "last_open_at": self.last_open_at,
            "error": self.error,
        }


class RelayController:
    """Pilote le banc de relais : ouverture temporisée + suivi d'état.

    ``gpio_mapping`` associe un identifiant de casier (UUID en prod, label
    ``locker_N`` sur le banc) à un numéro de pin BCM.
    """

    def __init__(self, gpio_mapping: dict[str, int]) -> None:
        self._mapping: dict[str, int] = dict(gpio_mapping)
        # Reflète si RPi.GPIO est réellement présent (Pi) ou simulé (dev/CI).
        self.gpio_available: bool = _GPIO_AVAILABLE
        self._lock = threading.Lock()
        # État affiché : toutes les broches sont HIGH (verrouillé) au repos.
        self._state: dict[str, str] = {lid: STATE_HIGH for lid in self._mapping}
        self._last_open_at: dict[str, int] = {}
        self._error: dict[str, str] = {}
        self._setup()

    # ─── Setup / cleanup ────────────────────────────────────────────────────

    def _setup(self) -> None:
        if not _GPIO_AVAILABLE:
            log.warning("gpio_unavailable_mock_mode", mapped=len(self._mapping))
            return
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        for pin in self._mapping.values():
            GPIO.setup(pin, GPIO.OUT, initial=GPIO.HIGH)
        log.info("gpio_relay_ready", mapped=len(self._mapping))

    def cleanup(self) -> None:
        """Best-effort ``GPIO.cleanup()`` (appelé au SIGTERM via le controller)."""
        if not _GPIO_AVAILABLE:
            return
        try:
            GPIO.cleanup()
        except Exception as exc:  # noqa: BLE001
            log.warning("gpio_cleanup_failed", err=str(exc))

    # ─── API publique ───────────────────────────────────────────────────────

    def _resolve(self, locker_id: str | int) -> str:
        """Normalise un identifiant casier en clé de mapping.

        Un ``int`` (câblage physique, ``IN{n}``) est mappé sur ``locker_{n}``
        pour coller au banc de test ; un ``str`` (UUID prod) est pris tel quel.
        """
        if isinstance(locker_id, int):
            return f"locker_{locker_id}"
        return locker_id

    def open_locker(
        self,
        locker_id: str | int,
        duration_ms: int = DEFAULT_PULSE_MS,
        *,
        retries: int = GPIO_PULSE_MAX_RETRIES,
        timeout_s: float = GPIO_PULSE_TIMEOUT_S,
    ) -> bool:
        """Pulse LOW pendant ``duration_ms`` sur la broche du casier puis HIGH.

        Active-LOW : LOW = relais fermé = solénoïde alimenté = déverrouillé.
        Retourne ``True`` si le pulse a abouti, ``False`` sinon (broche non
        mappée ou toutes les tentatives épuisées). Ne lève jamais.
        """
        key = self._resolve(locker_id)
        pin = self._mapping.get(key)
        if pin is None:
            with self._lock:
                self._error[key] = "unmapped"
            log.error("gpio_pin_not_mapped", locker_id=key)
            return False

        pulse_seconds = max(0.0, duration_ms / 1000.0)
        attempts = retries + 1
        last_err: str | None = None
        for attempt in range(1, attempts + 1):
            try:
                with self._lock:
                    self._state[key] = STATE_LOW
                self._run_pulse_with_timeout(pin, timeout_s, pulse_seconds)
                with self._lock:
                    self._state[key] = STATE_HIGH
                    self._last_open_at[key] = int(time.time())
                    self._error.pop(key, None)
                log.info(
                    "gpio_pulse_ok",
                    locker_id=key, pin=pin, attempt=attempt,
                    duration_ms=duration_ms, simulated=not _GPIO_AVAILABLE,
                )
                return True
            except Exception as exc:  # noqa: BLE001
                last_err = str(exc)
                log.warning(
                    "gpio_pulse_attempt_failed",
                    locker_id=key, pin=pin, attempt=attempt, err=last_err,
                )
                # Force le retour HIGH — idempotent et fail-secure.
                self._force_high_safe(pin)
                with self._lock:
                    self._state[key] = STATE_HIGH
                    self._error[key] = last_err

        log.error(
            "gpio_pulse_exhausted",
            locker_id=key, pin=pin, attempts=attempts, err=last_err,
        )
        return False

    def get_locker_status(self, locker_id: str | int) -> dict[str, Any]:
        """État courant d'un casier : gpio_state, last_open_at, pin, error."""
        key = self._resolve(locker_id)
        with self._lock:
            return LockerStatus(
                locker_id=key,
                pin=self._mapping.get(key),
                gpio_state=self._state.get(key, STATE_UNKNOWN),
                last_open_at=self._last_open_at.get(key),
                error=self._error.get(key),
            ).as_dict()

    def get_gpio_states(self) -> dict[str, str]:
        """Vue ``{locker_id: "HIGH"|"LOW"}`` — consommée par le heartbeat."""
        with self._lock:
            return dict(self._state)

    # ─── Pulse bas-niveau (watchdog) ────────────────────────────────────────

    def _run_pulse_with_timeout(
        self, pin: int, timeout_s: float, pulse_seconds: float,
    ) -> None:
        """Exécute le pulse dans un thread daemon avec watchdog.

        Lève ``TimeoutError`` si le pulse dépasse ``timeout_s`` (le thread
        daemon survit mais ne bloquera pas l'appelant), ou remonte l'exception
        levée par ``GPIO.output`` dans le thread.
        """
        if not _GPIO_AVAILABLE:
            log.info("gpio_pulse_simulated", pin=pin)
            time.sleep(min(pulse_seconds, timeout_s))
            return

        done = threading.Event()
        err_box: list[BaseException] = []

        def _run() -> None:
            try:
                GPIO.output(pin, GPIO.LOW)
                time.sleep(pulse_seconds)
                GPIO.output(pin, GPIO.HIGH)
            except BaseException as exc:  # noqa: BLE001
                err_box.append(exc)
            finally:
                done.set()

        worker = threading.Thread(target=_run, daemon=True, name=f"gpio-pulse-{pin}")
        worker.start()
        if not done.wait(timeout=timeout_s):
            raise TimeoutError(f"gpio pulse exceeded {timeout_s}s on pin {pin}")
        if err_box:
            raise err_box[0]

    def _force_high_safe(self, pin: int) -> None:
        """Best-effort GPIO HIGH (fail-secure). Avale toute erreur."""
        if not _GPIO_AVAILABLE:
            return
        try:
            GPIO.output(pin, GPIO.HIGH)
        except Exception as exc:  # noqa: BLE001
            log.warning("gpio_force_high_failed", pin=pin, err=str(exc))
