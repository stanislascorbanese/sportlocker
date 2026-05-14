"""Tests config.load_config — variables d'env requises et defaults."""
from __future__ import annotations

import pytest

from sportlocker_firmware.config import load_config

REQUIRED = ("DEVICE_ID", "DEVICE_API_KEY", "JWT_DEVICE_SECRET")


def _set_required(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEVICE_ID", "dev-1")
    monkeypatch.setenv("DEVICE_API_KEY", "api-key-1")
    monkeypatch.setenv("JWT_DEVICE_SECRET", "secret-1")


def test_load_config_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_required(monkeypatch)
    for k in ("MQTT_URL", "MQTT_USERNAME", "MQTT_PASSWORD", "LOCKER_COUNT"):
        monkeypatch.delenv(k, raising=False)
    cfg = load_config()
    assert cfg.device_id == "dev-1"
    assert cfg.mqtt_url == "mqtt://localhost:1883"
    assert cfg.mqtt_username is None
    assert cfg.locker_count == 8


def test_load_config_full(monkeypatch: pytest.MonkeyPatch) -> None:
    _set_required(monkeypatch)
    monkeypatch.setenv("MQTT_URL", "mqtts://broker.emqx:8883")
    monkeypatch.setenv("MQTT_USERNAME", "dev")
    monkeypatch.setenv("MQTT_PASSWORD", "pw")
    monkeypatch.setenv("LOCKER_COUNT", "16")
    cfg = load_config()
    assert cfg.mqtt_url == "mqtts://broker.emqx:8883"
    assert cfg.mqtt_username == "dev"
    assert cfg.mqtt_password == "pw"
    assert cfg.locker_count == 16


@pytest.mark.parametrize("missing", REQUIRED)
def test_load_config_missing_required_raises(
    monkeypatch: pytest.MonkeyPatch, missing: str,
) -> None:
    _set_required(monkeypatch)
    monkeypatch.delenv(missing, raising=False)
    with pytest.raises(RuntimeError, match=missing):
        load_config()
