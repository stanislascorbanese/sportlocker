"""Lecteur QR — capture caméra USB, décodage pyzbar.

Cette classe se limite à la lecture optique : elle délègue toute la vérification
JWT, l'anti-replay, l'ouverture GPIO et la publication MQTT à
``LockerController.handle_unlock`` qui centralise la sécurité.

Un cache mémoire `_recent_decoded` évite d'envoyer plusieurs fois le même QR
au controller pendant la fenêtre d'1 seconde où la caméra le voit en continu.
"""
from __future__ import annotations

import asyncio
import time

import cv2
import structlog
from pyzbar import pyzbar

from .locker_controller import LockerController

log = structlog.get_logger(__name__)

DEDUP_WINDOW_SECONDS = 1.0


class QRReader:
    def __init__(self, *, mqtt, controller: LockerController, device_secret: str) -> None:
        # device_secret est conservé pour compatibilité de signature, mais le
        # controller s'occupe désormais de la vérification JWT.
        del mqtt, device_secret
        self._controller = controller
        self._recent_decoded: dict[str, float] = {}

    async def run(self) -> None:
        cap = cv2.VideoCapture(0)
        try:
            while True:
                ok, frame = cap.read()
                if not ok:
                    await asyncio.sleep(0.1)
                    continue
                for code in pyzbar.decode(frame):
                    self._on_qr_seen(code.data.decode("utf-8"))
                await asyncio.sleep(0.05)
        finally:
            cap.release()

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
