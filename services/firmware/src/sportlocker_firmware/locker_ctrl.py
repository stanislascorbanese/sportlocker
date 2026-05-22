"""Contrôleur casiers : orchestre JWT verify + anti-replay + GPIO + MQTT.

Sécurité :
  - Vérification JWT déléguée à ``jwt_verify`` (HS256 strict, claims requis,
    contrôle distributeur).
  - Anti-replay déléguée à ``NonceStore`` (SQLite WAL, rétention 24 h).
  - GPIO fail-secure : pin HIGH au repos, pulse LOW à l'ouverture, retour HIGH.
  - Tous les events MQTT publiés sont enveloppés avec une signature
    HMAC-SHA256 du payload canonique → permet au backend de détecter un
    message forgé si le canal MQTT venait à fuir.

Tolérance offline :
  - JWT autoritatif (signé) : si MQTT est down, on ouvre quand même et on
    persiste l'event dans ``pending_events`` pour rejeu au retour réseau.
  - Cache local de réservations : si aucune réservation cachée et qu'on est
    offline, on refuse l'ouverture (le QR pourrait avoir été révoqué).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import sqlite3
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import Any

import structlog

from .jwt_verify import InvalidTokenError, TokenErrorReason, verify
from .mqtt_client import MQTTClient
from .nonce_store import NonceStore

log = structlog.get_logger(__name__)

GPIO_PULSE_SECONDS = 0.5
# Watchdog défensif sur l'opération GPIO. Le pulse réel prend ~0.5s ;
# 5s laisse une marge confortable mais protège du driver qui resterait
# bloqué (filesystem GPIO inaccessible, etc.) et évite que le thread
# paho callback ne fige indéfiniment.
GPIO_PULSE_TIMEOUT_S = 5.0
GPIO_PULSE_MAX_RETRIES = 1

# Tolérance d'horloge pour le check ``slot_start_at`` du JWT (cf. PR 0010).
# L'horloge du Raspberry Pi peut dériver de ~60s entre 2 synchronisations
# NTP, l'horloge du smartphone qui a signé le QR aussi. On accepte qu'un
# user scanne jusqu'à 60s avant le début théorique de son créneau pour
# éviter les refus à cause de skew.
SLOT_START_CLOCK_TOLERANCE_S = 60

try:
    import RPi.GPIO as GPIO

    _GPIO_AVAILABLE = True
except (ImportError, RuntimeError):
    GPIO = None
    _GPIO_AVAILABLE = False


class UnlockOutcome(StrEnum):
    SUCCESS = "success"
    INVALID_TOKEN = "invalid_token"
    REPLAY = "replay"
    EXPIRED = "expired"
    UNKNOWN_LOCKER = "unknown_locker"
    LOCKER_MISMATCH = "locker_mismatch"
    HARDWARE_FAULT = "hardware_fault"
    CACHE_MISS_OFFLINE = "cache_miss_offline"
    INTERNAL_ERROR = "internal_error"
    # PR 0010 — modèle slots : le user scanne avant le début de son créneau.
    SLOT_NOT_YET_OPEN = "slot_not_yet_open"


@dataclass(frozen=True)
class UnlockResult:
    outcome: UnlockOutcome
    reservation_id: str | None = None
    locker_id: str | None = None
    detail: str | None = None

    @property
    def ok(self) -> bool:
        return self.outcome is UnlockOutcome.SUCCESS


_TOKEN_REASON_TO_OUTCOME: dict[TokenErrorReason, UnlockOutcome] = {
    TokenErrorReason.EXPIRED: UnlockOutcome.EXPIRED,
    TokenErrorReason.BAD_SIGNATURE: UnlockOutcome.INVALID_TOKEN,
    TokenErrorReason.MISSING_CLAIMS: UnlockOutcome.INVALID_TOKEN,
    TokenErrorReason.DEVICE_MISMATCH: UnlockOutcome.INVALID_TOKEN,
    TokenErrorReason.MALFORMED: UnlockOutcome.INVALID_TOKEN,
}


class LockerController:
    def __init__(
        self,
        *,
        mqtt: MQTTClient,
        device_id: str,
        device_secret: str,
        gpio_mapping: dict[str, int],
        db_path: str = "/var/lib/sportlocker/agent.db",
        nonce_store: NonceStore | None = None,
    ) -> None:
        self._mqtt = mqtt
        self._device_id = device_id
        self._device_secret = device_secret
        self._gpio_mapping = dict(gpio_mapping)
        self._db_path = db_path
        self._db_lock = threading.Lock()

        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(db_path, check_same_thread=False, isolation_level=None)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._setup_db()

        self._nonces = nonce_store or NonceStore(db_path)
        self._setup_gpio()

        log.info(
            "locker_controller_ready",
            device_id=device_id,
            gpio_available=_GPIO_AVAILABLE,
            mapped_lockers=len(self._gpio_mapping),
            db_path=db_path,
        )

    # ─── Schéma SQLite (réservations + events en attente) ─────────────────

    def _setup_db(self) -> None:
        with self._db_lock:
            self._db.executescript(
                """
                CREATE TABLE IF NOT EXISTS reservation_cache (
                    reservation_id TEXT PRIMARY KEY,
                    locker_id TEXT NOT NULL,
                    item_id TEXT,
                    expires_at INTEGER NOT NULL,
                    cached_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS pending_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    topic TEXT NOT NULL,
                    envelope_json TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                );
                """
            )

    # ─── GPIO ──────────────────────────────────────────────────────────────

    def _setup_gpio(self) -> None:
        if not _GPIO_AVAILABLE:
            log.warning("gpio_unavailable_dev_mode")
            return
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        for pin in self._gpio_mapping.values():
            GPIO.setup(pin, GPIO.OUT, initial=GPIO.HIGH)

    def _pulse_open(
        self,
        locker_id: str,
        *,
        retries: int = GPIO_PULSE_MAX_RETRIES,
        timeout_s: float = GPIO_PULSE_TIMEOUT_S,
    ) -> bool:
        """Pulse LOW puis HIGH le GPIO du casier.

        - ``timeout_s`` : si le pulse n'aboutit pas dans ce délai (driver GPIO
          bloqué, fs en lecture seule…), on abandonne et on force HIGH pour
          rester fail-secure.
        - ``retries`` : on retente une fois en cas d'échec — ouvrir un casier
          déjà ouvert est idempotent (la serrure reste relâchée le temps du
          pulse, le citoyen retire la porte).
        """
        pin = self._gpio_mapping.get(locker_id)
        if pin is None:
            log.error("gpio_pin_not_mapped", locker_id=locker_id)
            return False

        attempts = retries + 1
        last_err: str | None = None
        for attempt in range(1, attempts + 1):
            try:
                self._run_pulse_with_timeout(pin, timeout_s)
                log.info(
                    "gpio_pulse_ok",
                    locker_id=locker_id, pin=pin, attempt=attempt,
                    simulated=not _GPIO_AVAILABLE,
                )
                return True
            except Exception as exc:  # noqa: BLE001
                last_err = str(exc)
                log.warning(
                    "gpio_pulse_attempt_failed",
                    locker_id=locker_id, pin=pin, attempt=attempt,
                    err=last_err,
                )
                # Force le retour HIGH au cas où on serait coincé en LOW —
                # idempotent et fail-secure.
                self._force_high_safe(pin)

        log.error(
            "gpio_pulse_exhausted",
            locker_id=locker_id, pin=pin, attempts=attempts, err=last_err,
        )
        return False

    def _run_pulse_with_timeout(self, pin: int, timeout_s: float) -> None:
        """Exécute le pulse dans un thread daemon avec watchdog.

        Lève ``TimeoutError`` si le pulse dépasse ``timeout_s`` — le thread
        daemon survit mais ne bloquera pas la coroutine.
        """
        if not _GPIO_AVAILABLE:
            log.info("gpio_pulse_simulated", pin=pin)
            time.sleep(min(GPIO_PULSE_SECONDS, timeout_s))
            return

        done = threading.Event()
        err_box: list[BaseException] = []

        def _run() -> None:
            try:
                GPIO.output(pin, GPIO.LOW)
                time.sleep(GPIO_PULSE_SECONDS)
                GPIO.output(pin, GPIO.HIGH)
            except BaseException as exc:  # noqa: BLE001
                err_box.append(exc)
            finally:
                done.set()

        worker = threading.Thread(
            target=_run, daemon=True, name=f"gpio-pulse-{pin}",
        )
        worker.start()
        if not done.wait(timeout=timeout_s):
            raise TimeoutError(
                f"gpio pulse exceeded {timeout_s}s on pin {pin}"
            )
        if err_box:
            raise err_box[0]

    def _force_high_safe(self, pin: int) -> None:
        """Best-effort GPIO HIGH (fail-secure). Swallow toute erreur."""
        if not _GPIO_AVAILABLE:
            return
        try:
            GPIO.output(pin, GPIO.HIGH)
        except Exception as exc:  # noqa: BLE001
            log.warning("gpio_force_high_failed", pin=pin, err=str(exc))

    # ─── Cache réservations ────────────────────────────────────────────────

    def upsert_reservation(
        self,
        reservation_id: str,
        locker_id: str,
        expires_at: int,
        item_id: str | None = None,
    ) -> None:
        with self._db_lock:
            self._db.execute(
                "INSERT OR REPLACE INTO reservation_cache"
                " (reservation_id, locker_id, item_id, expires_at, cached_at)"
                " VALUES (?, ?, ?, ?, ?)",
                (reservation_id, locker_id, item_id, expires_at, int(time.time())),
            )

    def remove_reservation(self, reservation_id: str) -> None:
        with self._db_lock:
            self._db.execute(
                "DELETE FROM reservation_cache WHERE reservation_id = ?",
                (reservation_id,),
            )

    def _lookup_reservation(self, reservation_id: str) -> dict[str, Any] | None:
        with self._db_lock:
            row = self._db.execute(
                "SELECT locker_id, item_id, expires_at FROM reservation_cache"
                " WHERE reservation_id = ?",
                (reservation_id,),
            ).fetchone()
        if not row:
            return None
        return {"locker_id": row[0], "item_id": row[1], "expires_at": int(row[2])}

    # ─── Publication MQTT signée + file locale ─────────────────────────────

    def _sign(self, payload: dict[str, Any]) -> str:
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        return hmac.new(
            self._device_secret.encode("utf-8"), canonical, hashlib.sha256
        ).hexdigest()

    def _publish_signed(self, topic: str, payload: dict[str, Any]) -> bool:
        envelope = {"data": payload, "sig": self._sign(payload)}
        try:
            self._mqtt.publish(topic, envelope, qos=1)
            return True
        except Exception as exc:  # noqa: BLE001
            log.warning("mqtt_publish_failed_queueing", topic=topic, err=str(exc))
            try:
                with self._db_lock:
                    self._db.execute(
                        "INSERT INTO pending_events(topic, envelope_json, created_at)"
                        " VALUES (?, ?, ?)",
                        (topic, json.dumps(envelope), int(time.time())),
                    )
            except sqlite3.Error as inner:
                log.error("pending_event_persist_failed", err=str(inner))
            return False

    def flush_pending_events(self, max_batch: int = 100) -> int:
        with self._db_lock:
            rows = self._db.execute(
                "SELECT id, topic, envelope_json FROM pending_events ORDER BY id LIMIT ?",
                (max_batch,),
            ).fetchall()

        published = 0
        for row_id, topic, envelope_json in rows:
            try:
                self._mqtt.publish(topic, json.loads(envelope_json), qos=1)
                with self._db_lock:
                    self._db.execute("DELETE FROM pending_events WHERE id = ?", (row_id,))
                published += 1
            except Exception as exc:  # noqa: BLE001
                log.warning("pending_flush_aborted", id=row_id, err=str(exc))
                break

        if published:
            log.info("pending_events_flushed", count=published)
        return published

    # ─── API publique ──────────────────────────────────────────────────────

    def handle_unlock(self, qr_data: str) -> UnlockResult:
        """Vérifie un QR, ouvre le casier et publie l'event MQTT signé.

        Ne lève jamais : tout chemin retourne un ``UnlockResult``.
        """
        bound = log.bind(token_preview=(qr_data[:12] + "...") if qr_data else "")
        try:
            return self._handle_unlock_inner(qr_data, bound)
        except Exception as exc:  # noqa: BLE001
            bound.exception("unlock_internal_error", err=str(exc))
            return UnlockResult(UnlockOutcome.INTERNAL_ERROR, detail=str(exc))

    def _handle_unlock_inner(
        self, qr_data: str, bound: structlog.types.FilteringBoundLogger
    ) -> UnlockResult:
        # 1. JWT
        try:
            claims = verify(
                qr_data,
                device_secret=self._device_secret,
                expected_device_id=self._device_id,
            )
        except InvalidTokenError as err:
            bound.warning("jwt_invalid", reason=err.reason.value, detail=err.detail)
            return UnlockResult(
                _TOKEN_REASON_TO_OUTCOME.get(err.reason, UnlockOutcome.INVALID_TOKEN),
                detail=err.reason.value,
            )

        bound = bound.bind(
            jti=claims.jti,
            reservation_id=claims.reservation_id,
            locker_id=claims.locker_id,
        )

        # 2. Modèle slots : refuse l'ouverture avant le début du créneau.
        # On check AVANT l'anti-replay pour ne pas consommer le nonce —
        # le user pourra re-scanner le même QR à l'heure dite.
        if claims.slot_start_at is not None:
            now_ts = int(time.time())
            if now_ts + SLOT_START_CLOCK_TOLERANCE_S < claims.slot_start_at:
                wait_s = claims.slot_start_at - now_ts
                bound.warning(
                    "slot_not_yet_open",
                    slot_start_at=claims.slot_start_at, wait_seconds=wait_s,
                )
                return UnlockResult(
                    UnlockOutcome.SLOT_NOT_YET_OPEN,
                    reservation_id=claims.reservation_id,
                    locker_id=claims.locker_id,
                    detail=f"wait_{wait_s}s",
                )

        # 3. Anti-replay
        if self._nonces.seen(claims.jti):
            bound.warning("replay_blocked")
            return UnlockResult(
                UnlockOutcome.REPLAY,
                reservation_id=claims.reservation_id,
                locker_id=claims.locker_id,
            )
        if not self._nonces.register(claims.jti):
            bound.warning("replay_blocked_race")
            return UnlockResult(
                UnlockOutcome.REPLAY,
                reservation_id=claims.reservation_id,
                locker_id=claims.locker_id,
            )

        # 4. Cohérence du mapping GPIO
        if claims.locker_id not in self._gpio_mapping:
            bound.error("locker_not_mapped")
            return UnlockResult(
                UnlockOutcome.UNKNOWN_LOCKER,
                reservation_id=claims.reservation_id,
                locker_id=claims.locker_id,
            )

        # 5. Cache réservation → mode dégradé
        cached = self._lookup_reservation(claims.reservation_id)
        online = self._mqtt.is_connected

        if cached is None:
            if online:
                bound.info("reservation_not_cached_online", action="trust_jwt")
            else:
                bound.warning("reservation_not_cached_offline_denied")
                return UnlockResult(
                    UnlockOutcome.CACHE_MISS_OFFLINE,
                    reservation_id=claims.reservation_id,
                    locker_id=claims.locker_id,
                )
        else:
            if cached["locker_id"] != claims.locker_id:
                bound.error("locker_mismatch_with_cache", cached_locker=cached["locker_id"])
                return UnlockResult(
                    UnlockOutcome.LOCKER_MISMATCH,
                    reservation_id=claims.reservation_id,
                    locker_id=claims.locker_id,
                )
            if cached["expires_at"] < int(time.time()):
                bound.warning("reservation_expired_in_cache", expires_at=cached["expires_at"])
                return UnlockResult(
                    UnlockOutcome.EXPIRED,
                    reservation_id=claims.reservation_id,
                    locker_id=claims.locker_id,
                )

        # 6. Ouverture physique
        if not self._pulse_open(claims.locker_id):
            bound.error("gpio_pulse_failed")
            return UnlockResult(
                UnlockOutcome.HARDWARE_FAULT,
                reservation_id=claims.reservation_id,
                locker_id=claims.locker_id,
            )

        # 7. Event MQTT signé (avec fallback file locale)
        published = self._publish_signed(
            "event",
            {
                "type": "door_unlocked",
                "deviceId": self._device_id,
                "reservationId": claims.reservation_id,
                "lockerId": claims.locker_id,
                "jti": claims.jti,
                "openedAt": int(time.time()),
                "mode": "online" if online else "offline",
            },
        )

        # 8. Purge périodique des nonces > 24 h
        self._nonces.purge_expired()

        bound.info("unlock_success", mqtt_published=published)
        return UnlockResult(
            UnlockOutcome.SUCCESS,
            reservation_id=claims.reservation_id,
            locker_id=claims.locker_id,
        )

    # ─── Cleanup ──────────────────────────────────────────────────────────

    def close(self) -> None:
        if _GPIO_AVAILABLE:
            with self._mute():
                GPIO.cleanup()
        with self._mute():
            self._nonces.close()
        with self._mute():
            with self._db_lock:
                self._db.close()

    @contextmanager
    def _mute(self) -> Iterator[None]:
        try:
            yield
        except Exception as exc:  # noqa: BLE001
            log.warning("cleanup_ignored_error", err=str(exc))
