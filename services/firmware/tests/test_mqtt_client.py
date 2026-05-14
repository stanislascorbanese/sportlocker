"""Tests MQTTClient — parsing URL, publish, on_message, backoff."""
from __future__ import annotations

import asyncio
import json
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from sportlocker_firmware.config import Config
from sportlocker_firmware.mqtt_client import (
    INITIAL_BACKOFF_S,
    MQTTClient,
    _parse_mqtt_url,
)


@pytest.fixture
def cfg() -> Config:
    return Config(
        device_id="dev-1",
        api_key="key",
        mqtt_url="mqtt://broker.local:1883",
        mqtt_username=None,
        mqtt_password=None,
        device_secret="secret",
        locker_count=4,
    )


class TestParseMqttUrl:
    def test_with_explicit_port(self) -> None:
        assert _parse_mqtt_url("mqtt://broker.local:8883") == ("broker.local", 8883)

    def test_with_default_port(self) -> None:
        assert _parse_mqtt_url("mqtt://broker.local") == ("broker.local", 1883)

    def test_without_scheme(self) -> None:
        assert _parse_mqtt_url("broker.local:1883") == ("broker.local", 1883)


class TestMQTTClient:
    def test_publish_serializes_json_with_topic_prefix(self, cfg: Config) -> None:
        client = MQTTClient(cfg)
        with patch.object(client._client, "publish") as mock_pub:
            client.publish("event", {"hello": "world"}, qos=1)
        mock_pub.assert_called_once()
        topic, payload = mock_pub.call_args.args
        assert topic == "sportlocker/dev-1/event"
        assert json.loads(payload) == {"hello": "world"}
        assert mock_pub.call_args.kwargs["qos"] == 1

    def test_is_connected_proxies_underlying(self, cfg: Config) -> None:
        client = MQTTClient(cfg)
        with patch.object(client._client, "is_connected", return_value=True):
            assert client.is_connected is True
        with patch.object(client._client, "is_connected", return_value=False):
            assert client.is_connected is False

    def test_on_message_decodes_and_forwards(self, cfg: Config) -> None:
        client = MQTTClient(cfg)
        handler = MagicMock()
        client.on_command(handler)
        msg = MagicMock(payload=json.dumps({"cmd": "reservation_push"}).encode(), topic="t")
        client._on_message(client._client, None, msg)
        handler.assert_called_once_with({"cmd": "reservation_push"})

    def test_on_message_ignores_bad_json(self, cfg: Config) -> None:
        client = MQTTClient(cfg)
        handler = MagicMock()
        client.on_command(handler)
        msg = MagicMock(payload=b"not-json", topic="t")
        client._on_message(client._client, None, msg)
        handler.assert_not_called()

    def test_on_message_without_handler_does_not_crash(self, cfg: Config) -> None:
        client = MQTTClient(cfg)
        msg = MagicMock(payload=json.dumps({"k": "v"}).encode(), topic="t")
        client._on_message(client._client, None, msg)  # ne lève pas

    def test_on_connect_and_disconnect_log(self, cfg: Config) -> None:
        client = MQTTClient(cfg)
        # Smoke : exécuter pour la coverage.
        client._on_connect(client._client, None, {}, 0)
        client._on_disconnect(client._client, None, 0)
        client._on_disconnect(client._client, None, 7)  # rc != 0

    def test_disconnect_calls_underlying(self, cfg: Config) -> None:
        client = MQTTClient(cfg)
        with patch.object(client._client, "disconnect") as mock_dc:
            asyncio.run(client.disconnect())
        mock_dc.assert_called_once()

    def test_connect_succeeds_first_try(
        self, cfg: Config, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        client = MQTTClient(cfg)
        with patch.object(client._client, "connect") as mock_co, \
             patch.object(client._client, "subscribe") as mock_sub:
            asyncio.run(client.connect())
        mock_co.assert_called_once_with("broker.local", 1883, 60)
        mock_sub.assert_called_once_with("sportlocker/dev-1/cmd", qos=1)

    def test_connect_retries_with_backoff_then_succeeds(
        self, cfg: Config, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        client = MQTTClient(cfg)
        sleeps: list[float] = []

        async def fake_sleep(d: float) -> None:
            sleeps.append(d)

        monkeypatch.setattr("sportlocker_firmware.mqtt_client.asyncio.sleep", fake_sleep)

        attempts = {"n": 0}

        def flaky_connect(*_a: Any, **_kw: Any) -> None:
            attempts["n"] += 1
            if attempts["n"] < 3:
                raise OSError("broker unreachable")

        with patch.object(client._client, "connect", side_effect=flaky_connect), \
             patch.object(client._client, "subscribe"):
            asyncio.run(client.connect())

        assert attempts["n"] == 3
        # Backoff exponentiel : INITIAL_BACKOFF_S puis INITIAL_BACKOFF_S * 2.
        assert sleeps == [INITIAL_BACKOFF_S, INITIAL_BACKOFF_S * 2]

    def test_run_blocks_in_loop_forever(self, cfg: Config) -> None:
        client = MQTTClient(cfg)
        with patch.object(client._client, "loop_forever") as mock_lf:
            asyncio.run(client.run())
        mock_lf.assert_called_once()

    def test_username_password_set_when_provided(self) -> None:
        cfg = Config(
            device_id="d", api_key="a", mqtt_url="mqtt://h",
            mqtt_username="u", mqtt_password="p", device_secret="s", locker_count=1,
        )
        client = MQTTClient(cfg)
        assert client._cfg.mqtt_username == "u"
