"""Client MQTT — pub/sub vers EMQX Cloud.

Topics :
  - sportlocker/{device_id}/heartbeat   (pub, QoS 0, retain=False)
  - sportlocker/{device_id}/event       (pub, QoS 1)
  - sportlocker/{device_id}/cmd         (sub, QoS 1)
"""
from __future__ import annotations

import asyncio
import json
from typing import Any, Callable

import paho.mqtt.client as mqtt
import structlog

from .config import Config

log = structlog.get_logger()
CommandHandler = Callable[[dict[str, Any]], None]


class MQTTClient:
    def __init__(self, cfg: Config) -> None:
        self._cfg = cfg
        self._client = mqtt.Client(client_id=cfg.device_id, protocol=mqtt.MQTTv5)
        if cfg.mqtt_username:
            self._client.username_pw_set(cfg.mqtt_username, cfg.mqtt_password or "")
        self._cmd_handler: CommandHandler | None = None
        self._client.on_message = self._on_message

    def on_command(self, handler: CommandHandler) -> None:
        self._cmd_handler = handler

    async def connect(self) -> None:
        host, port = _parse_mqtt_url(self._cfg.mqtt_url)
        await asyncio.to_thread(self._client.connect, host, port, keepalive=60)
        self._client.subscribe(f"sportlocker/{self._cfg.device_id}/cmd", qos=1)
        log.info("mqtt_connected", host=host, port=port)

    async def run(self) -> None:
        await asyncio.to_thread(self._client.loop_forever)

    async def disconnect(self) -> None:
        await asyncio.to_thread(self._client.disconnect)

    @property
    def is_connected(self) -> bool:
        """True quand la socket TCP au broker est établie et l'handshake MQTT fait."""
        return self._client.is_connected()

    def publish(self, topic: str, payload: dict[str, Any], qos: int = 0) -> None:
        full = f"sportlocker/{self._cfg.device_id}/{topic}"
        self._client.publish(full, json.dumps(payload), qos=qos)

    def _on_message(self, _client: mqtt.Client, _userdata: Any, msg: mqtt.MQTTMessage) -> None:
        try:
            payload = json.loads(msg.payload)
        except json.JSONDecodeError:
            log.warning("mqtt_bad_payload", topic=msg.topic)
            return
        if self._cmd_handler:
            self._cmd_handler(payload)


def _parse_mqtt_url(url: str) -> tuple[str, int]:
    rest = url.split("://", 1)[-1]
    if ":" in rest:
        host, port = rest.split(":", 1)
        return host, int(port)
    return rest, 1883
