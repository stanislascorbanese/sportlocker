"""SportLocker Firmware — Agent principal Raspberry Pi CM4.

Orchestration des sous-systèmes :
  - MQTT vers EMQX Cloud (telemetry + commandes)
  - Lecteur QR (caméra USB, OpenCV + pyzbar)
  - Controller casiers (GPIO + RFID llrpy)
  - Heartbeat périodique (toutes les 30s)
"""
from __future__ import annotations

import asyncio
import json
import os
import signal
import sys
from collections.abc import Callable
from contextlib import suppress
from pathlib import Path
from typing import Any

import structlog

from .config import load_config
from .heartbeat import heartbeat_loop
from .locker_ctrl import LockerController
from .mqtt_client import MQTTClient
from .qr_reader import QRReader

log = structlog.get_logger()

CALIBRATION_PATH = Path(os.environ.get("CALIBRATION_PATH", "/etc/sportlocker/calibration.json"))
AGENT_DB_PATH = os.environ.get("FIRMWARE_DB_PATH", "/var/lib/sportlocker/agent.db")


def _load_gpio_mapping() -> dict[str, int]:
    """Charge la calibration locker_id → GPIO pin (déployée via Balena)."""
    if not CALIBRATION_PATH.exists():
        log.warning("calibration_missing", path=str(CALIBRATION_PATH))
        return {}
    raw = json.loads(CALIBRATION_PATH.read_text())
    if not isinstance(raw, dict):
        log.error("calibration_not_object", path=str(CALIBRATION_PATH))
        return {}
    mapping: dict[str, int] = {}
    for locker_id, pin in raw.items():
        if not isinstance(locker_id, str) or not isinstance(pin, int):
            log.warning(
                "calibration_entry_bad_type",
                locker_id=str(locker_id), pin=repr(pin),
            )
            continue
        mapping[locker_id] = pin
    return mapping


def _make_open_cmd_handler(
    controller: LockerController,
) -> Callable[[str, dict[str, Any]], None]:
    """Crée le handler MQTT pour ``cmd/open``.

    Le payload attendu : ``{"token": "<jwt>"}`` — réémis par le backend
    pour permettre une ouverture distante (force_unlock, push réservation
    déjà honoré par QR ailleurs, ...). Le controller applique exactement
    le même chemin de sécurité que pour un QR scanné localement.
    """
    def _handle(subtopic: str, payload: dict[str, Any]) -> None:
        token = payload.get("token")
        if not isinstance(token, str) or not token:
            log.warning("cmd_open_missing_token", subtopic=subtopic)
            return
        result = controller.handle_unlock(token)
        log.info(
            "cmd_open_handled",
            outcome=result.outcome.value,
            reservation_id=result.reservation_id,
            locker_id=result.locker_id,
        )

    return _handle


async def main() -> None:
    cfg = load_config()
    log.info("agent_starting", device_id=cfg.device_id)

    mqtt = MQTTClient(cfg)
    await mqtt.connect()

    controller = LockerController(
        mqtt=mqtt,
        device_id=cfg.device_id,
        device_secret=cfg.device_secret,
        gpio_mapping=_load_gpio_mapping(),
        db_path=AGENT_DB_PATH,
    )
    # Câble la commande MQTT cmd/open vers le même chemin que le QR scan.
    mqtt.on_command(_make_open_cmd_handler(controller), subtopic="open")

    qr = QRReader(mqtt=mqtt, controller=controller, device_secret=cfg.device_secret)

    tasks = [
        asyncio.create_task(mqtt.run(), name="mqtt"),
        asyncio.create_task(qr.run(), name="qr"),
        asyncio.create_task(heartbeat_loop(mqtt, device_id=cfg.device_id), name="heartbeat"),
    ]

    loop = asyncio.get_running_loop()
    stop = asyncio.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)

    await stop.wait()
    log.info("agent_stopping")
    for t in tasks:
        t.cancel()
    for t in tasks:
        with suppress(asyncio.CancelledError):
            await t
    controller.close()
    await mqtt.disconnect()


def run() -> None:
    """Entry-point synchrone — utilisé par le console_script ``sportlocker-firmware``."""
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)


if __name__ == "__main__":
    run()
