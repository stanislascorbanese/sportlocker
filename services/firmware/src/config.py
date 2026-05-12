"""Configuration agent — chargée depuis les variables d'environnement."""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    device_id: str
    api_key: str
    mqtt_url: str
    mqtt_username: str | None
    mqtt_password: str | None
    device_secret: str  # JWT_DEVICE_SECRET partagé avec l'API
    locker_count: int


def load_config() -> Config:
    return Config(
        device_id=_required("DEVICE_ID"),
        api_key=_required("DEVICE_API_KEY"),
        mqtt_url=os.environ.get("MQTT_URL", "mqtt://localhost:1883"),
        mqtt_username=os.environ.get("MQTT_USERNAME"),
        mqtt_password=os.environ.get("MQTT_PASSWORD"),
        device_secret=_required("JWT_DEVICE_SECRET"),
        locker_count=int(os.environ.get("LOCKER_COUNT", "8")),
    )


def _required(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"missing required env var: {name}")
    return value
