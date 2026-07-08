"""Tests bench_demo — séquence GPIO + QR/NFC factices en mode mock."""
from __future__ import annotations

import io

from sportlocker_firmware.gpio_relay import BENCH_GPIO_MAPPING, RelayController
from sportlocker_firmware.tools import bench_demo


def test_gpio_sequence_opens_all_four_lockers() -> None:
    relay = RelayController(BENCH_GPIO_MAPPING)
    out = io.StringIO()
    statuses = bench_demo.demo_gpio_sequence(relay, duration_ms=1, out=out)
    relay.cleanup()

    assert len(statuses) == 4
    # Chaque casier revient HIGH (fail-secure) et a un last_open_at renseigné.
    for st in statuses:
        assert st["gpio_state"] == "HIGH"
        assert isinstance(st["last_open_at"], int)
    text = out.getvalue()
    assert "casier 1" in text and "casier 4" in text


def test_demo_qr_runs_full_security_path() -> None:
    out = io.StringIO()
    result = bench_demo.demo_qr(
        secret=bench_demo.DEMO_SECRET, device_id=bench_demo.DEMO_DEVICE_ID, out=out,
    )
    assert result.ok is True
    assert "outcome: success" in out.getvalue()


def test_demo_nfc_dispatches_fake_uid() -> None:
    out = io.StringIO()
    uid = bench_demo.demo_nfc(out=out)
    assert uid == b"\x04\xde\xad\xbe\xef\x10\x80"
    assert "tag factice UID" in out.getvalue()


def test_main_returns_zero_in_mock_mode() -> None:
    assert bench_demo.main([]) == 0


def test_main_accepts_duration_arg() -> None:
    assert bench_demo.main(["--duration-ms", "5"]) == 0
