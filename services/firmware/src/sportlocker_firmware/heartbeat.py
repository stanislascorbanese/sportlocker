"""Heartbeat périodique → MQTT toutes les 60s."""
from __future__ import annotations

import asyncio
import time
from pathlib import Path

import structlog

from .mqtt_client import MQTTClient

log = structlog.get_logger()
_START = time.monotonic()


async def heartbeat_loop(mqtt: MQTTClient, *, device_id: str, interval: int = 60) -> None:
    while True:
        mqtt.publish("heartbeat", {
            "deviceId": device_id,
            "uptimeSeconds": int(time.monotonic() - _START),
            "cpuTempC": _read_cpu_temp(),
            "freeMemMb": _read_free_mem_mb(),
        }, qos=0)
        await asyncio.sleep(interval)


def _read_cpu_temp() -> float | None:
    path = Path("/sys/class/thermal/thermal_zone0/temp")
    if not path.exists():
        return None
    try:
        return int(path.read_text().strip()) / 1000.0
    except (OSError, ValueError):
        return None


def _read_free_mem_mb() -> int | None:
    path = Path("/proc/meminfo")
    if not path.exists():
        return None
    try:
        for line in path.read_text().splitlines():
            if line.startswith("MemAvailable:"):
                return int(line.split()[1]) // 1024
    except OSError:
        return None
    return None
