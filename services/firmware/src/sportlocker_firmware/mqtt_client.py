"""Client MQTT — pub/sub vers EMQX Cloud avec reconnect exponentiel.

Topics :
  - sportlocker/{device_id}/heartbeat   (pub, QoS 0, retain=False)
  - sportlocker/{device_id}/event       (pub, QoS 1)
  - sportlocker/{device_id}/cmd         (sub, QoS 1)

Resilience :
  - paho gère la reconnect TCP en interne (``reconnect_delay_set``).
  - On expose un backoff exponentiel borné (1s → 60s) sur la première connexion
    et on relance ``loop_forever`` dans un thread asyncio dédié.
  - ``is_connected`` reflète l'état réel de la socket — utilisé par le
    controller pour décider du mode online vs offline.
"""
from __future__ import annotations

import asyncio
import json
from collections.abc import Callable
from typing import Any

import paho.mqtt.client as mqtt
import structlog

from .config import Config

log = structlog.get_logger()
CommandHandler = Callable[[dict[str, Any]], None]

INITIAL_BACKOFF_S = 1.0
MAX_BACKOFF_S = 60.0
BACKOFF_FACTOR = 2.0


class MQTTClient:
    def __init__(self, cfg: Config) -> None:
        self._cfg = cfg
        self._client = mqtt.Client(client_id=cfg.device_id, protocol=mqtt.MQTTv5)
        if cfg.mqtt_username:
            self._client.username_pw_set(cfg.mqtt_username, cfg.mqtt_password or "")
        # Reconnect TCP automatique côté paho (entre 1s et 60s).
        self._client.reconnect_delay_set(min_delay=1, max_delay=60)
        self._cmd_handler: CommandHandler | None = None
        self._client.on_message = self._on_message
        self._client.on_connect = self._on_connect
        self._client.on_disconnect = self._on_disconnect

    def on_command(self, handler: CommandHandler) -> None:
        self._cmd_handler = handler

    async def connect(self) -> None:
        """Tentative initiale de connexion avec backoff exponentiel borné."""
        host, port = _parse_mqtt_url(self._cfg.mqtt_url)
        backoff = INITIAL_BACKOFF_S
        attempt = 0
        while True:
            attempt += 1
            try:
                await asyncio.to_thread(self._client.connect, host, port, 60)
                log.info("mqtt_connected", host=host, port=port, attempt=attempt)
                self._client.subscribe(f"sportlocker/{self._cfg.device_id}/cmd", qos=1)
                return
            except (OSError, mqtt.WebsocketConnectionError) as exc:
                log.warning(
                    "mqtt_connect_failed",
                    host=host, port=port, attempt=attempt,
                    backoff_s=backoff, err=str(exc),
                )
                await asyncio.sleep(backoff)
                backoff = min(backoff * BACKOFF_FACTOR, MAX_BACKOFF_S)

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

    def _on_connect(
        self,
        _client: mqtt.Client,
        _userdata: Any,
        _flags: dict[str, Any],
        rc: int,
        _props: Any = None,
    ) -> None:
        log.info("mqtt_on_connect", rc=int(rc))

    def _on_disconnect(
        self,
        _client: mqtt.Client,
        _userdata: Any,
        rc: int,
        _props: Any = None,
    ) -> None:
        if rc != 0:
            log.warning("mqtt_disconnected_unexpectedly", rc=int(rc))
        else:
            log.info("mqtt_disconnected_clean")


def _parse_mqtt_url(url: str) -> tuple[str, int]:
    rest = url.split("://", 1)[-1]
    if ":" in rest:
        host, port = rest.split(":", 1)
        return host, int(port)
    return rest, 1883
