"""Lecteur QR — caméra Pi (CSI) via picamera2, décodage pyzbar.

Cible la **Raspberry Pi Camera v3 (IMX708)** branchée sur le port CSI de la
CM4 IO Board. On utilise ``picamera2`` (pile libcamera, la seule supportée sur
Bookworm pour la v3) et **pas** la lib ``picamera`` legacy (incompatible IMX708
et abandonnée). 640×480 suffit très largement à lire un QR ; la capture tourne
dans un thread (``asyncio.to_thread``) pour ne jamais bloquer la boucle
asyncio (mqtt, heartbeat, cmd/open continuent de tourner).

Cette classe se limite à la lecture optique : elle délègue toute la
vérification JWT, l'anti-replay, l'ouverture GPIO et la publication MQTT à
``LockerController.handle_unlock`` qui centralise la sécurité.

Un cache mémoire ``_recent_decoded`` évite d'envoyer plusieurs fois le même QR
au controller pendant la fenêtre d'1 seconde où la caméra le voit en continu.
"""
from __future__ import annotations

import asyncio
import time
from contextlib import suppress
from typing import Any

import structlog
from pyzbar import pyzbar

from .locker_ctrl import LockerController
from .mqtt_client import MQTTClient

log = structlog.get_logger(__name__)

DEDUP_WINDOW_SECONDS = 1.0
CAPTURE_SIZE = (640, 480)
# ~30 fps : on cède la main entre deux captures pour ne pas monopoliser le CPU.
FRAME_INTERVAL_S = 1.0 / 30.0

try:
    from picamera2 import Picamera2
except (ImportError, RuntimeError):  # dev macOS / CI / container sans libcamera
    Picamera2 = None


class CameraNotFoundError(RuntimeError):
    """Levée quand la caméra Pi est absente ou n'a pas pu être initialisée."""


class QRReader:
    def __init__(
        self,
        *,
        mqtt: MQTTClient | None,
        controller: LockerController,
        device_secret: str,
    ) -> None:
        # mqtt et device_secret sont conservés pour compatibilité de signature
        # (cf. agent.py et tests historiques), mais le controller s'occupe
        # désormais de la vérification JWT et de la publication MQTT signée.
        del mqtt, device_secret
        self._controller = controller
        self._recent_decoded: dict[str, float] = {}
        self._camera_ok = False

    @property
    def camera_ok(self) -> bool:
        """État caméra pour le heartbeat (True tant que la capture tourne)."""
        return self._camera_ok

    async def run(self) -> None:
        try:
            camera = self._open_camera()
        except CameraNotFoundError as exc:
            # Pas de caméra (dev local, container sans CSI, CI…). On dort
            # indéfiniment au lieu de boucler à vide : les autres tâches asyncio
            # continuent et l'injection de QR peut se faire via MQTT cmd/open.
            log.warning("qr_camera_unavailable_idle_mode", err=str(exc))
            self._camera_ok = False
            await asyncio.Event().wait()
            return

        self._camera_ok = True
        log.info("qr_camera_started", size=CAPTURE_SIZE)
        try:
            while True:
                # Capture bloquante déportée dans un thread → boucle non bloquée.
                frame = await asyncio.to_thread(camera.capture_array)
                for code in pyzbar.decode(frame):
                    self._on_qr_seen(code.data.decode("utf-8"))
                await asyncio.sleep(FRAME_INTERVAL_S)
        finally:
            self._camera_ok = False
            with suppress(Exception):
                camera.stop()
            with suppress(Exception):
                camera.close()

    @staticmethod
    def _open_camera() -> Any:
        """Initialise et démarre picamera2 en 640×480. Lève CameraNotFoundError."""
        if Picamera2 is None:
            raise CameraNotFoundError("picamera2 indisponible (libcamera absent)")
        try:
            camera = Picamera2()
            config = camera.create_preview_configuration(
                main={"size": CAPTURE_SIZE, "format": "RGB888"},
            )
            camera.configure(config)
            camera.start()
            return camera
        except Exception as exc:  # noqa: BLE001 — matériel/driver imprévisible
            raise CameraNotFoundError(str(exc)) from exc

    def _on_qr_seen(self, qr_data: str) -> None:
        now = time.monotonic()
        last = self._recent_decoded.get(qr_data)
        if last is not None and now - last < DEDUP_WINDOW_SECONDS:
            return
        self._recent_decoded[qr_data] = now
        # purge des entrées vieilles
        cutoff = now - 10 * DEDUP_WINDOW_SECONDS
        self._recent_decoded = {k: v for k, v in self._recent_decoded.items() if v > cutoff}

        result = self._controller.handle_unlock(qr_data)
        log.info("qr_handled", outcome=result.outcome.value,
                 reservation_id=result.reservation_id, locker_id=result.locker_id)
