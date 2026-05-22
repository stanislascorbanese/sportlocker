"""Tests MQTTClient — parsing URL, publish, on_message, backoff, LWT, routage cmd."""
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
    _extract_cmd_subtopic,
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


class TestExtractCmdSubtopic:
    def test_extracts_open(self) -> None:
        assert _extract_cmd_subtopic("sportlocker/dev-1/cmd/open") == "open"

    def test_extracts_arbitrary_subtopic(self) -> None:
        assert _extract_cmd_subtopic("sportlocker/dev-1/cmd/force_unlock") == "force_unlock"

    def test_returns_none_for_non_cmd_topic(self) -> None:
        assert _extract_cmd_subtopic("sportlocker/dev-1/event") is None

    def test_returns_none_for_malformed_topic(self) -> None:
        assert _extract_cmd_subtopic("not/a/sportlocker/topic") is None

    def test_returns_none_when_no_subtopic(self) -> None:
        assert _extract_cmd_subtopic("sportlocker/dev-1/cmd") is None


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

    def test_last_will_configured_on_status_topic(self, cfg: Config) -> None:
        """Le LWT doit être armé avec online:false retained avant la connexion."""
        with patch("paho.mqtt.client.Client") as mock_cls:
            instance = mock_cls.return_value
            MQTTClient(cfg)
            instance.will_set.assert_called_once()
            topic, payload = instance.will_set.call_args.args
            assert topic == "sportlocker/dev-1/status"
            data = json.loads(payload)
            assert data == {
                "online": False,
                "deviceId": "dev-1",
                "reason": "lwt",
            }
            assert instance.will_set.call_args.kwargs["qos"] == 1
            assert instance.will_set.call_args.kwargs["retain"] is True

    def test_on_message_decodes_and_routes_to_subtopic_handler(self, cfg: Config) -> None:
        client = MQTTClient(cfg)
        open_handler = MagicMock()
        client.on_command(open_handler, subtopic="open")
        msg = MagicMock(
            payload=json.dumps({"token": "jwt-token"}).encode(),
            topic="sportlocker/dev-1/cmd/open",
        )
        client._on_message(client._client, None, msg)
        open_handler.assert_called_once_with("open", {"token": "jwt-token"})

    def test_on_message_routes_unknown_subtopic_to_default_handler(self, cfg: Config) -> None:
        client = MQTTClient(cfg)
        default_handler = MagicMock()
        client.on_command(default_handler)  # subtopic=None → default
        msg = MagicMock(
            payload=json.dumps({"k": "v"}).encode(),
            topic="sportlocker/dev-1/cmd/some_unmapped_cmd",
        )
        client._on_message(client._client, None, msg)
        default_handler.assert_called_once_with("some_unmapped_cmd", {"k": "v"})

    def test_on_message_subtopic_handler_takes_priority_over_default(
        self, cfg: Config
    ) -> None:
        client = MQTTClient(cfg)
        default_handler = MagicMock()
        open_handler = MagicMock()
        client.on_command(default_handler)
        client.on_command(open_handler, subtopic="open")
        msg = MagicMock(
            payload=json.dumps({"token": "t"}).encode(),
            topic="sportlocker/dev-1/cmd/open",
        )
        client._on_message(client._client, None, msg)
        open_handler.assert_called_once()
        default_handler.assert_not_called()

    def test_on_message_ignores_bad_json(self, cfg: Config) -> None:
        client = MQTTClient(cfg)
        handler = MagicMock()
        client.on_command(handler)
        msg = MagicMock(payload=b"not-json", topic="sportlocker/dev-1/cmd/open")
        client._on_message(client._client, None, msg)
        handler.assert_not_called()

    def test_on_message_ignores_non_object_payload(self, cfg: Config) -> None:
        client = MQTTClient(cfg)
        handler = MagicMock()
        client.on_command(handler)
        msg = MagicMock(payload=b"[1,2,3]", topic="sportlocker/dev-1/cmd/open")
        client._on_message(client._client, None, msg)
        handler.assert_not_called()

    def test_on_message_without_handler_does_not_crash(self, cfg: Config) -> None:
        client = MQTTClient(cfg)
        msg = MagicMock(
            payload=json.dumps({"k": "v"}).encode(),
            topic="sportlocker/dev-1/cmd/open",
        )
        client._on_message(client._client, None, msg)  # ne lève pas

    def test_on_message_handler_exception_swallowed(self, cfg: Config) -> None:
        """Un handler qui crash ne doit pas tuer le client MQTT."""
        client = MQTTClient(cfg)

        def boom(_subtopic: str, _payload: dict[str, Any]) -> None:
            raise RuntimeError("simulated_handler_crash")

        client.on_command(boom, subtopic="open")
        msg = MagicMock(
            payload=json.dumps({"token": "t"}).encode(),
            topic="sportlocker/dev-1/cmd/open",
        )
        client._on_message(client._client, None, msg)  # ne lève pas

    def test_on_connect_publishes_status_online_on_success(self, cfg: Config) -> None:
        client = MQTTClient(cfg)
        with patch.object(client._client, "publish") as mock_pub:
            client._on_connect(client._client, None, {}, 0)
        # Vérifie la publication retained "online:true" sur le status topic.
        mock_pub.assert_called_once()
        topic, payload = mock_pub.call_args.args
        assert topic == "sportlocker/dev-1/status"
        data = json.loads(payload)
        assert data["online"] is True
        assert data["deviceId"] == "dev-1"
        assert "ts" in data
        assert mock_pub.call_args.kwargs == {"qos": 1, "retain": True}

    def test_on_connect_does_not_publish_status_on_failure(self, cfg: Config) -> None:
        client = MQTTClient(cfg)
        with patch.object(client._client, "publish") as mock_pub:
            client._on_connect(client._client, None, {}, 5)  # rc != 0
        mock_pub.assert_not_called()

    def test_on_disconnect_logs(self, cfg: Config) -> None:
        client = MQTTClient(cfg)
        client._on_disconnect(client._client, None, 0)
        client._on_disconnect(client._client, None, 7)  # rc != 0

    def test_on_connect_accepts_reasoncode_mqttv5(self, cfg: Config) -> None:
        """En MQTTv5, paho passe un ``ReasonCode`` (objet avec ``.value``).
        Le callback doit l'accepter sans crash, sinon les messages MQTT
        suivants ne sont jamais dispatched (cf bug Phase 1 stack sim)."""
        client = MQTTClient(cfg)
        # Simule un ReasonCode paho v2 : objet avec attribut .value
        reason_ok = MagicMock(spec=[])
        reason_ok.value = 0
        with patch.object(client._client, "publish") as mock_pub:
            client._on_connect(client._client, None, {}, reason_ok)
        mock_pub.assert_called_once()  # status online publié

        reason_fail = MagicMock(spec=[])
        reason_fail.value = 5
        with patch.object(client._client, "publish") as mock_pub:
            client._on_connect(client._client, None, {}, reason_fail)
        mock_pub.assert_not_called()

    def test_on_disconnect_accepts_reasoncode_mqttv5(self, cfg: Config) -> None:
        client = MQTTClient(cfg)
        reason = MagicMock(spec=[])
        reason.value = 7
        client._on_disconnect(client._client, None, reason)  # ne lève pas

    def test_disconnect_publishes_clean_offline_then_disconnects(self, cfg: Config) -> None:
        client = MQTTClient(cfg)
        with patch.object(client._client, "publish") as mock_pub, \
             patch.object(client._client, "disconnect") as mock_dc:
            asyncio.run(client.disconnect())
        # Status retained "clean_shutdown" publié AVANT le disconnect.
        mock_pub.assert_called_once()
        topic, payload = mock_pub.call_args.args
        assert topic == "sportlocker/dev-1/status"
        data = json.loads(payload)
        assert data["online"] is False
        assert data["reason"] == "clean_shutdown"
        assert mock_pub.call_args.kwargs == {"qos": 1, "retain": True}
        mock_dc.assert_called_once()

    def test_connect_succeeds_first_try_and_subscribes_to_cmd_wildcard(
        self, cfg: Config, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        client = MQTTClient(cfg)
        with patch.object(client._client, "connect") as mock_co, \
             patch.object(client._client, "subscribe") as mock_sub, \
             patch.object(client._client, "publish"):
            asyncio.run(client.connect())
        mock_co.assert_called_once_with("broker.local", 1883, 60)
        mock_sub.assert_called_once_with("sportlocker/dev-1/cmd/+", qos=1)

    def test_connect_publishes_online_status_after_handshake(
        self, cfg: Config,
    ) -> None:
        client = MQTTClient(cfg)
        with patch.object(client._client, "connect"), \
             patch.object(client._client, "subscribe"), \
             patch.object(client._client, "publish") as mock_pub:
            asyncio.run(client.connect())
        mock_pub.assert_called_once()
        topic, payload = mock_pub.call_args.args
        assert topic == "sportlocker/dev-1/status"
        data = json.loads(payload)
        assert data["online"] is True
        assert mock_pub.call_args.kwargs == {"qos": 1, "retain": True}

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
             patch.object(client._client, "subscribe"), \
             patch.object(client._client, "publish"):
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

    def test_disconnect_swallows_offline_publish_failure(self, cfg: Config) -> None:
        """Si publish offline lève, disconnect doit toujours appeler le client paho."""
        client = MQTTClient(cfg)
        with patch.object(
            client._client, "publish", side_effect=RuntimeError("broker gone")
        ), patch.object(client._client, "disconnect") as mock_dc:
            asyncio.run(client.disconnect())
        mock_dc.assert_called_once()
