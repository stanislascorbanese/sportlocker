"""Tests du mock local QR→JWT→GPIO (tools/local_scan).

On exécute le vrai ``LockerController`` (GPIO simulé hors Pi) via l'entry
point ``main`` pour couvrir les chemins nominal + erreurs, sans broker.
"""
from __future__ import annotations

import pytest

from sportlocker_firmware.tools import local_scan


def _args(*extra: str) -> list[str]:
    base = ["--secret", "test-secret-min-32-chars-aaaaaaaa",
            "--device", "dist-1", "--locker", "locker-1"]
    return base + list(extra)


def test_missing_secret_returns_2(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("JWT_DEVICE_SECRET", raising=False)
    rc = local_scan.main(["--device", "d", "--locker", "l"])
    assert rc == 2


def test_secret_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JWT_DEVICE_SECRET", "env-secret-min-32-chars-bbbbbbbb")
    rc = local_scan.main(["--device", "dist-1", "--locker", "locker-1"])
    assert rc == 0


def test_nominal_scan_succeeds() -> None:
    assert local_scan.main(_args()) == 0


def test_offline_without_cache_denied() -> None:
    # cache_miss_offline → handle_unlock non ok → rc 1.
    assert local_scan.main(_args("--offline", "--no-cache")) == 1


def test_offline_with_cache_succeeds() -> None:
    # Réservation cachée + offline → ouverture autorisée en mode dégradé.
    assert local_scan.main(_args("--offline")) == 0


def test_slot_not_yet_open_denied() -> None:
    assert local_scan.main(_args("--slot-start-in", "3600")) == 1


def test_replay_second_scan_does_not_crash() -> None:
    # Le 1er scan réussit (rc basé sur le 1er résultat) ; le 2e est bloqué en
    # replay mais ne doit pas lever.
    assert local_scan.main(_args("--replay")) == 0


def test_signature_helper_roundtrip() -> None:
    secret = "s3cr3t"
    data = {"type": "door_unlocked", "lockerId": "l1"}
    import hashlib
    import hmac
    import json
    sig = hmac.new(
        secret.encode(),
        json.dumps(data, sort_keys=True, separators=(",", ":")).encode(),
        hashlib.sha256,
    ).hexdigest()
    assert local_scan._verify_event_signature({"data": data, "sig": sig}, secret)
    assert not local_scan._verify_event_signature({"data": data, "sig": "bad"}, secret)
    assert not local_scan._verify_event_signature({"data": "notdict", "sig": sig}, secret)


def test_loopback_mqtt_records_publications() -> None:
    m = local_scan._LoopbackMQTT(connected=True)
    m.publish("event", {"a": 1}, qos=1)
    assert m.is_connected is True
    assert m.published == [("event", {"a": 1}, 1)]
