"""Lecteur NFC — modules PN532 en I2C (adafruit-circuitpython-pn532).

Câblage de référence (bench test) : module(s) PN532 en mode I2C sur le bus
matériel du CM4 (SDA=GPIO2/pin3, SCL=GPIO3/pin5, VCC=3.3V, GND). Les cavaliers
``SW1=ON / SW2=OFF`` fixent l'adresse à ``0x24``. Un 2ᵉ module (adresse
``0x25``) peut couvrir les casiers 5-8 sur le même bus.

La lib ``adafruit_pn532`` + ``adafruit_blinka`` (``board`` / ``busio``) n'existe
que sur le Pi ; sur macOS/CI l'import échoue → le lecteur passe en mode dormant
(``nfc_ok=False``) sans jamais crasher l'agent, exactement comme le lecteur QR.

Robustesse I2C : le bus PN532 peut renvoyer des erreurs transitoires (glitch,
carte retirée en cours de lecture). ``read_card`` les avale (log warning) et
retourne ``None`` plutôt que de faire remonter l'exception dans la boucle.

Lecture non bloquante : ``read_passive_target(timeout=0.1)`` rend la main au
bout de 100 ms ; la boucle ``run`` la déporte dans un thread
(``asyncio.to_thread``) pour ne pas figer l'event loop.
"""
from __future__ import annotations

import asyncio
import time
from collections.abc import Callable
from typing import Any

import structlog

log = structlog.get_logger(__name__)

# Timeout de lecture passive : 100 ms (cf. spec). Au-delà → pas de carte.
NFC_READ_TIMEOUT_S = 0.1
# Intervalle de polling de la boucle async entre deux tentatives de lecture.
NFC_POLL_INTERVAL_S = 0.2
# Fenêtre anti-rebond : on ne redéclenche pas le même UID sous cette durée
# (une carte posée reste lue en continu tant qu'elle est présente).
NFC_DEDUP_WINDOW_S = 1.0

# Adresses I2C par défaut. 0x24 = casiers 1-4 ; 0x25 = casiers 5-8 (optionnel).
PRIMARY_ADDRESS = 0x24
SECONDARY_ADDRESS = 0x25

CardCallback = Callable[[bytes], None]

try:
    import board
    import busio  # noqa: F401 — importé pour vérifier la présence de Blinka
    from adafruit_pn532.i2c import PN532_I2C

    _NFC_LIBS_AVAILABLE = True
except (ImportError, NotImplementedError, RuntimeError):
    board = None
    PN532_I2C = None
    _NFC_LIBS_AVAILABLE = False


class NFCUnavailableError(RuntimeError):
    """Levée quand aucun module PN532 n'a pu être initialisé."""


def _default_on_card(uid: bytes) -> None:
    log.info("nfc_card_read", uid=uid.hex())


class NFCReader:
    """Lit les UID des cartes NFC sur un ou deux modules PN532 I2C."""

    def __init__(
        self,
        *,
        addresses: tuple[int, ...] = (PRIMARY_ADDRESS,),
        on_card: CardCallback | None = None,
    ) -> None:
        self._addresses = tuple(addresses)
        self._on_card = on_card or _default_on_card
        self._readers: list[tuple[int, Any]] = []
        self._nfc_ok = False
        self._recent: dict[str, float] = {}

    @property
    def nfc_ok(self) -> bool:
        """État NFC pour le heartbeat (True si ≥1 module initialisé et actif)."""
        return self._nfc_ok

    # ─── Init matériel ──────────────────────────────────────────────────────

    def _init_readers(self) -> None:
        """Initialise les modules PN532 sur le bus I2C. Lève NFCUnavailableError."""
        if not _NFC_LIBS_AVAILABLE:
            raise NFCUnavailableError("adafruit_pn532 / blinka indisponible")
        try:
            i2c = board.I2C()
        except Exception as exc:  # noqa: BLE001 — bus I2C non activé, etc.
            raise NFCUnavailableError(f"bus I2C indisponible: {exc}") from exc

        for addr in self._addresses:
            try:
                pn = PN532_I2C(i2c, address=addr, debug=False)
                pn.SAM_configuration()
                self._readers.append((addr, pn))
                log.info("nfc_module_ready", addr=hex(addr))
            except Exception as exc:  # noqa: BLE001 — module absent à cette adresse
                log.warning("nfc_init_failed", addr=hex(addr), err=str(exc))

        if not self._readers:
            raise NFCUnavailableError("aucun module PN532 initialisé")

    # ─── Lecture ────────────────────────────────────────────────────────────

    def read_card(self) -> bytes | None:
        """Retourne l'UID (bytes) de la première carte détectée, sinon None.

        Une erreur I2C transitoire sur un module est loguée puis ignorée (on
        tente le module suivant) — la boucle ne doit jamais crasher là-dessus.
        """
        for addr, pn in self._readers:
            try:
                uid = pn.read_passive_target(timeout=NFC_READ_TIMEOUT_S)
            except Exception as exc:  # noqa: BLE001 — glitch I2C, carte retirée…
                log.warning("nfc_read_i2c_error", addr=hex(addr), err=str(exc))
                continue
            if uid:
                return bytes(uid)
        return None

    async def run(self, poll_interval_s: float = NFC_POLL_INTERVAL_S) -> None:
        try:
            self._init_readers()
        except NFCUnavailableError as exc:
            log.warning("nfc_unavailable_idle_mode", err=str(exc))
            self._nfc_ok = False
            await asyncio.Event().wait()
            return

        self._nfc_ok = True
        log.info("nfc_reader_started", modules=len(self._readers))
        try:
            while True:
                uid = await asyncio.to_thread(self.read_card)
                if uid is not None:
                    self._dispatch(uid)
                await asyncio.sleep(poll_interval_s)
        finally:
            self._nfc_ok = False

    def _dispatch(self, uid: bytes) -> None:
        """Anti-rebond puis appel du callback (isolé de toute exception)."""
        key = uid.hex()
        now = time.monotonic()
        last = self._recent.get(key)
        if last is not None and now - last < NFC_DEDUP_WINDOW_S:
            return
        self._recent[key] = now
        cutoff = now - 10 * NFC_DEDUP_WINDOW_S
        self._recent = {k: v for k, v in self._recent.items() if v > cutoff}
        try:
            self._on_card(uid)
        except Exception as exc:  # noqa: BLE001
            log.warning("nfc_on_card_raised", err=str(exc))
