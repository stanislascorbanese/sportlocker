"""Tests heartbeat — lectures /sys + boucle async."""
from __future__ import annotations

import asyncio
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from sportlocker_firmware import heartbeat


def test_read_cpu_temp_returns_celsius(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = tmp_path / "temp"
    fake.write_text("48500\n")
    monkeypatch.setattr(heartbeat, "Path", lambda p: fake if "thermal" in p else Path(p))
    assert heartbeat._read_cpu_temp() == 48.5


def test_read_cpu_temp_missing_path_returns_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(heartbeat, "Path", lambda _p: Path("/nope/nada/zilch"))
    assert heartbeat._read_cpu_temp() is None


def test_read_cpu_temp_bad_value_returns_none(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = tmp_path / "temp"
    fake.write_text("not-a-number")
    monkeypatch.setattr(heartbeat, "Path", lambda _p: fake)
    assert heartbeat._read_cpu_temp() is None


def test_read_free_mem_mb_parses_meminfo(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = tmp_path / "meminfo"
    fake.write_text("MemTotal: 4000000 kB\nMemAvailable:  2048000 kB\nFoo: 1\n")
    monkeypatch.setattr(heartbeat, "Path", lambda _p: fake)
    assert heartbeat._read_free_mem_mb() == 2000  # 2048000 // 1024


def test_read_free_mem_mb_missing_returns_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(heartbeat, "Path", lambda _p: Path("/nope/nada"))
    assert heartbeat._read_free_mem_mb() is None


def test_read_free_mem_mb_without_memavailable_returns_none(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = tmp_path / "meminfo"
    fake.write_text("MemTotal: 4000000 kB\n")
    monkeypatch.setattr(heartbeat, "Path", lambda _p: fake)
    assert heartbeat._read_free_mem_mb() is None


def test_heartbeat_loop_publishes_then_cancels(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mqtt = MagicMock()
    monkeypatch.setattr(heartbeat, "_read_cpu_temp", lambda: 42.0)
    monkeypatch.setattr(heartbeat, "_read_free_mem_mb", lambda: 256)

    async def runner() -> None:
        task = asyncio.create_task(heartbeat.heartbeat_loop(mqtt, device_id="d-1", interval=0))
        await asyncio.sleep(0.05)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    asyncio.run(runner())

    # publish a été appelé au moins une fois sur le topic "heartbeat".
    assert mqtt.publish.call_count >= 1
    topic, payload = mqtt.publish.call_args.args
    assert topic == "heartbeat"
    assert payload["deviceId"] == "d-1"
    assert payload["cpuTempC"] == 42.0
    assert payload["freeMemMb"] == 256
    assert "uptimeSeconds" in payload


# ─── Payload enrichi (firmware hardware v1) ─────────────────────────────────


class _FakeSource:
    def __init__(self, *, states: dict[str, str], cam: bool, nfc: bool) -> None:
        self._states = states
        self._cam = cam
        self._nfc = nfc

    def gpio_states(self) -> dict[str, str]:
        return self._states

    def camera_ok(self) -> bool:
        return self._cam

    def nfc_ok(self) -> bool:
        return self._nfc


def test_payload_without_source_has_degraded_hardware_fields(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(heartbeat, "_read_cpu_temp", lambda: 40.0)
    monkeypatch.setattr(heartbeat, "_read_free_mem_mb", lambda: 128)
    payload = heartbeat._build_payload("d-1", None)
    # Contrat backend préservé.
    assert payload["cpuTempC"] == 40.0
    assert payload["freeMemMb"] == 128
    # Enrichi : dégradé proprement en l'absence de source.
    assert payload["gpio_states"] == {}
    assert payload["camera_ok"] is False
    assert payload["nfc_ok"] is False
    assert payload["temp_cpu"] == 40.0
    assert isinstance(payload["uptime_s"], int)
    assert payload["firmware_version"] == heartbeat.FIRMWARE_VERSION


def test_payload_with_source_includes_hardware_telemetry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(heartbeat, "_read_cpu_temp", lambda: 55.0)
    monkeypatch.setattr(heartbeat, "_read_free_mem_mb", lambda: 512)
    source = _FakeSource(
        states={"locker_1": "HIGH", "locker_2": "LOW"}, cam=True, nfc=False,
    )
    payload = heartbeat._build_payload("d-1", source)
    assert payload["gpio_states"] == {"locker_1": "HIGH", "locker_2": "LOW"}
    assert payload["camera_ok"] is True
    assert payload["nfc_ok"] is False
    assert payload["temp_cpu"] == 55.0


def test_payload_source_failure_degrades_without_raising(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(heartbeat, "_read_cpu_temp", lambda: None)
    monkeypatch.setattr(heartbeat, "_read_free_mem_mb", lambda: None)

    class _Boom:
        def gpio_states(self) -> dict[str, str]:
            raise RuntimeError("gpio read blew up")

        def camera_ok(self) -> bool:
            return True

        def nfc_ok(self) -> bool:
            return True

    payload = heartbeat._build_payload("d-1", _Boom())
    # La panne de la source ne doit pas casser le heartbeat.
    assert payload["gpio_states"] == {}
    assert payload["camera_ok"] is False
    assert payload["nfc_ok"] is False
