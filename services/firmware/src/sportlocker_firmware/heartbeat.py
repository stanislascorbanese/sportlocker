"""Heartbeat périodique → MQTT toutes les 30s.

Cadence resserrée à 30s pour que le watchdog backend détecte un device
tombé en < 1 min (les BullMQ crons tournent à la minute, cf. CLAUDE.md).

Contrat de compatibilité backend
--------------------------------
``services/api/src/lib/mqtt-events.ts::parseHeartbeat`` lit uniquement les
clés **camelCase** ``deviceId`` / ``uptimeSeconds`` / ``cpuTempC`` /
``freeMemMb`` et **ignore** les clés inconnues. On conserve donc ces quatre
clés telles quelles (renommer casserait l'ingestion + le passage online) et on
**ajoute** la télémétrie matérielle enrichie (états GPIO, caméra, NFC, version
firmware) demandée pour le hardware v1. Les nouveaux champs pourront être
capturés plus tard dans la colonne ``metadata`` JSONB côté API.
"""
from __future__ import annotations

import asyncio
import time
from pathlib import Path
from typing import Any, Protocol, runtime_checkable

import structlog

from . import __version__
from .mqtt_client import MQTTClient

log = structlog.get_logger()
_START = time.monotonic()

DEFAULT_HEARTBEAT_INTERVAL_S = 30
FIRMWARE_VERSION = __version__


@runtime_checkable
class HeartbeatSource(Protocol):
    """Fournit la télémétrie matérielle dynamique au heartbeat.

    Implémenté par ``agent._AgentHeartbeatSource`` (branché sur le controller
    GPIO + les lecteurs QR/NFC). Chaque méthode doit être non bloquante et ne
    jamais lever — le heartbeat est vital pour le watchdog.
    """

    def gpio_states(self) -> dict[str, str]: ...
    def camera_ok(self) -> bool: ...
    def nfc_ok(self) -> bool: ...


async def heartbeat_loop(
    mqtt: MQTTClient,
    *,
    device_id: str,
    interval: int = DEFAULT_HEARTBEAT_INTERVAL_S,
    source: HeartbeatSource | None = None,
) -> None:
    while True:
        mqtt.publish("heartbeat", _build_payload(device_id, source), qos=0)
        await asyncio.sleep(interval)


def _build_payload(
    device_id: str, source: HeartbeatSource | None,
) -> dict[str, Any]:
    uptime = int(time.monotonic() - _START)
    temp = _read_cpu_temp()
    gpio_states, camera_ok, nfc_ok = _read_hardware_telemetry(source)
    return {
        # ─ Contrat backend (camelCase, ne pas renommer) ─
        "deviceId": device_id,
        "uptimeSeconds": uptime,
        "cpuTempC": temp,
        "freeMemMb": _read_free_mem_mb(),
        # ─ Télémétrie matérielle enrichie (firmware hardware v1) ─
        "gpio_states": gpio_states,
        "camera_ok": camera_ok,
        "nfc_ok": nfc_ok,
        "temp_cpu": temp,
        "uptime_s": uptime,
        "firmware_version": FIRMWARE_VERSION,
    }


def _read_hardware_telemetry(
    source: HeartbeatSource | None,
) -> tuple[dict[str, str], bool, bool]:
    """Lit les états GPIO + statut caméra/NFC en isolant toute défaillance.

    Une source qui lèverait ne doit jamais tuer la boucle heartbeat : on
    dégrade proprement (états vides, ok=False) et on log.
    """
    if source is None:
        return {}, False, False
    try:
        return source.gpio_states(), source.camera_ok(), source.nfc_ok()
    except Exception as exc:  # noqa: BLE001
        log.warning("heartbeat_source_failed", err=str(exc))
        return {}, False, False


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
