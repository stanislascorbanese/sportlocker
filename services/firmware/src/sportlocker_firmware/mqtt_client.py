"""Client MQTT — pub/sub vers EMQX Cloud avec reconnect exponentiel.

Topics :
  - sportlocker/{device_id}/heartbeat   (pub, QoS 0, retain=False)
  - sportlocker/{device_id}/status      (pub, QoS 1, retain=True — online/offline)
  - sportlocker/{device_id}/event       (pub, QoS 1)
  - sportlocker/{device_id}/cmd/+       (sub, QoS 1, sous-topics: open, ...)

Resilience :
  - paho gère la reconnect TCP en interne (``reconnect_delay_set``).
  - On expose un backoff exponentiel borné (1s → 60s) sur la première connexion
    et on relance ``loop_forever`` dans un thread asyncio dédié.
  - ``is_connected`` reflète l'état réel de la socket — utilisé par le
    controller pour décider du mode online vs offline.
  - Last-will : à la coupure brutale, le broker publie un status ``online:false``
    retained sur le topic ``status`` du device — le backend voit immédiatement
    qu'un distributeur est tombé sans attendre le watchdog heartbeat.
"""
from __future__ import annotations

import asyncio
import json
import time
from collections.abc import Callable
from typing import Any

import paho.mqtt.client as mqtt
import structlog

from .config import Config

log = structlog.get_logger()
CommandHandler = Callable[[str, dict[str, Any]], None]

INITIAL_BACKOFF_S = 1.0
MAX_BACKOFF_S = 60.0
BACKOFF_FACTOR = 2.0

CMD_TOPIC_SUFFIX = "cmd"
STATUS_TOPIC_SUFFIX = "status"


class MQTTClient:
    def __init__(self, cfg: Config) -> None:
        self._cfg = cfg
        self._client = mqtt.Client(client_id=cfg.device_id, protocol=mqtt.MQTTv5)
        if cfg.mqtt_username:
            self._client.username_pw_set(cfg.mqtt_username, cfg.mqtt_password or "")
        # Reconnect TCP automatique côté paho (entre 1s et 60s).
        self._client.reconnect_delay_set(min_delay=1, max_delay=60)
        # Last-will : si la session TCP tombe sans DISCONNECT propre, le broker
        # publie ce payload retained → le backend détecte la panne au lieu
        # d'attendre l'expiration du watchdog heartbeat.
        will_topic = f"sportlocker/{cfg.device_id}/{STATUS_TOPIC_SUFFIX}"
        will_payload = json.dumps(
            {"online": False, "deviceId": cfg.device_id, "reason": "lwt"}
        )
        self._client.will_set(will_topic, will_payload, qos=1, retain=True)

        self._cmd_handlers: dict[str, CommandHandler] = {}
        self._default_cmd_handler: CommandHandler | None = None
        self._client.on_message = self._on_message
        self._client.on_connect = self._on_connect
        self._client.on_disconnect = self._on_disconnect

    def on_command(
        self, handler: CommandHandler, *, subtopic: str | None = None
    ) -> None:
        """Enregistre un handler pour les commandes MQTT.

        ``subtopic`` (ex: ``"open"``) cible un suffixe précis ; ``None``
        attrape toutes les commandes non-routées (handler par défaut).
        Le handler reçoit ``(subtopic, payload_json)``.
        """
        if subtopic is None:
            self._default_cmd_handler = handler
        else:
            self._cmd_handlers[subtopic] = handler

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
                # Abonnement wildcard : router internement par sous-topic.
                self._client.subscribe(
                    f"sportlocker/{self._cfg.device_id}/{CMD_TOPIC_SUFFIX}/+",
                    qos=1,
                )
                # Annule le last-will tant qu'on est UP — overwrite le retained.
                self._publish_status_online()
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
        # Avant de partir proprement, publier offline (retained) pour annuler
        # le retain "online:true" avant le DISCONNECT — le broker ne déclenchera
        # plus le LWT puisque la sortie est propre.
        try:
            self._publish_status_offline_clean()
        except Exception as exc:  # noqa: BLE001
            log.warning("mqtt_status_offline_publish_failed", err=str(exc))
        await asyncio.to_thread(self._client.disconnect)

    @property
    def is_connected(self) -> bool:
        """True quand la socket TCP au broker est établie et l'handshake MQTT fait."""
        return bool(self._client.is_connected())

    def publish(self, topic: str, payload: dict[str, Any], qos: int = 0) -> None:
        full = f"sportlocker/{self._cfg.device_id}/{topic}"
        self._client.publish(full, json.dumps(payload), qos=qos)

    def _publish_status_online(self) -> None:
        topic = f"sportlocker/{self._cfg.device_id}/{STATUS_TOPIC_SUFFIX}"
        payload = json.dumps(
            {"online": True, "deviceId": self._cfg.device_id, "ts": int(time.time())}
        )
        self._client.publish(topic, payload, qos=1, retain=True)

    def _publish_status_offline_clean(self) -> None:
        topic = f"sportlocker/{self._cfg.device_id}/{STATUS_TOPIC_SUFFIX}"
        payload = json.dumps(
            {
                "online": False,
                "deviceId": self._cfg.device_id,
                "reason": "clean_shutdown",
                "ts": int(time.time()),
            }
        )
        self._client.publish(topic, payload, qos=1, retain=True)

    def _on_message(
        self, _client: mqtt.Client, _userdata: Any, msg: mqtt.MQTTMessage
    ) -> None:
        try:
            payload = json.loads(msg.payload)
        except json.JSONDecodeError:
            log.warning("mqtt_bad_payload", topic=msg.topic)
            return
        if not isinstance(payload, dict):
            log.warning("mqtt_payload_not_object", topic=msg.topic)
            return
        subtopic = _extract_cmd_subtopic(msg.topic)
        handler = self._cmd_handlers.get(subtopic) if subtopic else None
        if handler is None:
            handler = self._default_cmd_handler
        if handler is None:
            log.debug(
                "mqtt_cmd_no_handler", topic=msg.topic, subtopic=subtopic
            )
            return
        try:
            handler(subtopic or "", payload)
        except Exception as exc:  # noqa: BLE001
            log.exception(
                "mqtt_cmd_handler_raised",
                topic=msg.topic, subtopic=subtopic, err=str(exc),
            )

    def _on_connect(
        self,
        _client: mqtt.Client,
        _userdata: Any,
        _flags: dict[str, Any],
        rc: Any,
        _props: Any = None,
    ) -> None:
        # En MQTTv5, paho passe un ``ReasonCode`` (pas un ``int``). ``_rc_value``
        # absorbe les deux. Sans ça, ``int(rc)`` crash et paho considère le
        # callback raté → les messages cmd/+ ne sont jamais dispatched.
        rc_value = _rc_value(rc)
        log.info("mqtt_on_connect", rc=rc_value)
        # En cas de reconnect spontané (paho), republier le status online.
        if rc_value == 0:
            try:
                self._publish_status_online()
            except Exception as exc:  # noqa: BLE001
                log.warning("mqtt_status_online_publish_failed", err=str(exc))

    def _on_disconnect(
        self,
        _client: mqtt.Client,
        _userdata: Any,
        rc: Any,
        _props: Any = None,
    ) -> None:
        rc_value = _rc_value(rc)
        if rc_value != 0:
            log.warning("mqtt_disconnected_unexpectedly", rc=rc_value)
        else:
            log.info("mqtt_disconnected_clean")


def _rc_value(rc: Any) -> int:
    """Normalise un ``rc`` paho en ``int``.

    En MQTTv5, paho passe un ``ReasonCode`` qui expose ``.value``. En MQTTv3,
    c'est déjà un ``int``. Cette helper supporte les deux pour ne pas crasher
    le callback ``on_connect``/``on_disconnect``.
    """
    value = getattr(rc, "value", rc)
    try:
        return int(value)
    except (TypeError, ValueError):
        return -1


def _parse_mqtt_url(url: str) -> tuple[str, int]:
    rest = url.split("://", 1)[-1]
    if ":" in rest:
        host, port = rest.split(":", 1)
        return host, int(port)
    return rest, 1883


def _extract_cmd_subtopic(topic: str) -> str | None:
    """``sportlocker/{device}/cmd/open`` → ``"open"``. Sinon ``None``."""
    parts = topic.split("/")
    # Format attendu : sportlocker / device_id / cmd / <sub>
    if len(parts) >= 4 and parts[0] == "sportlocker" and parts[2] == CMD_TOPIC_SUFFIX:
        return parts[3]
    return None
