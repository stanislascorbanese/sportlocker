"""Tests agent — chargement calibration + entry-point + handler cmd MQTT."""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from sportlocker_firmware import agent


def test_load_gpio_mapping_returns_dict(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    cal = tmp_path / "calibration.json"
    cal.write_text(json.dumps({"locker-1": 17, "locker-2": 27}))
    monkeypatch.setattr(agent, "CALIBRATION_PATH", cal)
    assert agent._load_gpio_mapping() == {"locker-1": 17, "locker-2": 27}


def test_load_gpio_mapping_missing_returns_empty(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(agent, "CALIBRATION_PATH", tmp_path / "absent.json")
    assert agent._load_gpio_mapping() == {}


def test_load_gpio_mapping_rejects_non_object(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    cal = tmp_path / "calibration.json"
    cal.write_text("[1, 2, 3]")
    monkeypatch.setattr(agent, "CALIBRATION_PATH", cal)
    assert agent._load_gpio_mapping() == {}


def test_load_gpio_mapping_skips_bad_entries(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    cal = tmp_path / "calibration.json"
    cal.write_text(json.dumps({
        "locker-1": 17,
        "locker-2": "not-an-int",
        "locker-3": 22,
    }))
    monkeypatch.setattr(agent, "CALIBRATION_PATH", cal)
    assert agent._load_gpio_mapping() == {"locker-1": 17, "locker-3": 22}


def test_make_open_cmd_handler_forwards_token_to_controller() -> None:
    controller = MagicMock()
    controller.handle_unlock.return_value = MagicMock(
        outcome=MagicMock(value="success"),
        reservation_id="r-1",
        locker_id="l-1",
    )
    handler = agent._make_open_cmd_handler(controller)
    handler("open", {"token": "jwt-token-xyz"})
    controller.handle_unlock.assert_called_once_with("jwt-token-xyz")


def test_make_open_cmd_handler_ignores_payload_without_token() -> None:
    controller = MagicMock()
    handler = agent._make_open_cmd_handler(controller)
    handler("open", {"not_a_token": "x"})
    controller.handle_unlock.assert_not_called()


def test_make_open_cmd_handler_ignores_non_string_token() -> None:
    controller = MagicMock()
    handler = agent._make_open_cmd_handler(controller)
    handler("open", {"token": 12345})
    handler("open", {"token": ""})
    handler("open", {"token": None})
    controller.handle_unlock.assert_not_called()


def test_run_invokes_asyncio_run() -> None:
    with patch.object(agent, "asyncio") as mock_asyncio:
        agent.run()
    mock_asyncio.run.assert_called_once()


def test_run_swallows_keyboard_interrupt() -> None:
    with patch.object(agent, "asyncio") as mock_asyncio, \
         patch.object(agent, "sys") as mock_sys:
        mock_asyncio.run.side_effect = KeyboardInterrupt
        agent.run()
    mock_sys.exit.assert_called_once_with(0)


def test_main_async_orchestrates_subsystems(monkeypatch: pytest.MonkeyPatch) -> None:
    """Le main async câble MQTT + controller + QR + heartbeat puis attend signal."""
    import asyncio as real_asyncio

    cfg = MagicMock(device_id="d-1", device_secret="s")
    monkeypatch.setattr(agent, "load_config", lambda: cfg)
    monkeypatch.setattr(agent, "_load_gpio_mapping", lambda: {"l-1": 17})

    fake_mqtt = MagicMock()
    fake_mqtt.connect = AsyncMock()
    fake_mqtt.run = AsyncMock()
    fake_mqtt.disconnect = AsyncMock()
    monkeypatch.setattr(agent, "MQTTClient", lambda _c: fake_mqtt)

    fake_ctrl = MagicMock()
    monkeypatch.setattr(agent, "LockerController", lambda **_kw: fake_ctrl)

    fake_qr = MagicMock()
    fake_qr.run = AsyncMock()
    monkeypatch.setattr(agent, "QRReader", lambda **_kw: fake_qr)

    async def _hb_noop(*_a: object, **_kw: object) -> None:
        return None

    monkeypatch.setattr(agent, "heartbeat_loop", _hb_noop)

    async def driver() -> None:
        # Lance main puis tue rapidement via le signal handler interne.
        task = real_asyncio.create_task(agent.main())
        await real_asyncio.sleep(0.05)
        # On simule SIGTERM en cherchant l'event interne via la stack des tasks :
        # plus simple → annuler la task et laisser les except handlers tourner.
        task.cancel()
        try:
            await task
        except (real_asyncio.CancelledError, Exception):
            pass

    real_asyncio.run(driver())

    fake_mqtt.connect.assert_called_once()
    fake_ctrl.close.assert_not_called()  # cancel précoce → cleanup partiel toléré
