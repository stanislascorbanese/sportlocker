"""Tests du CLI ``tools.demo_unlock`` — simulateur scan QR sans Pi physique.

On vérifie :
- Le JWT minté est accepté par ``jwt_verify.verify`` (vrai test d'interop,
  pas un mock — c'est le même contrat que le firmware appliquera en prod).
- L'absence de secret retourne un code d'erreur non-zéro.
- ``--print-only`` n'essaie pas de se connecter au broker.
- La fonction ``publish_unlock`` cible le bon topic + le bon payload JSON.
"""
from __future__ import annotations

import json
import time
from unittest.mock import MagicMock, patch

import pytest

from sportlocker_firmware import jwt_verify
from sportlocker_firmware.tools import demo_unlock


@pytest.fixture
def base_argv(device_id: str, locker_id: str, device_secret: str) -> list[str]:
    return [
        "--device", device_id,
        "--locker", locker_id,
        "--secret", device_secret,
        "--print-only",
    ]


def test_mint_jwt_passes_firmware_verification(
    device_id: str, locker_id: str, reservation_id: str, device_secret: str,
) -> None:
    """Le JWT minté par demo_unlock doit passer jwt_verify.verify sans erreur.

    C'est LE test d'intégration critique : si ça casse, le simulateur ne peut
    pas déclencher d'ouverture côté firmware.
    """
    args = demo_unlock.MintArgs(
        secret=device_secret,
        device_id=device_id,
        locker_id=locker_id,
        reservation_id=reservation_id,
        user_id="user-uuid-1",
        ttl_seconds=900,
        slot_start_at=None,
    )
    token = demo_unlock.mint_jwt(args)

    claims = jwt_verify.verify(
        token, device_secret=device_secret, expected_device_id=device_id,
    )

    assert claims.reservation_id == reservation_id
    assert claims.locker_id == locker_id
    assert claims.distributor_id == device_id
    assert claims.user_id == "user-uuid-1"
    assert claims.slot_start_at is None
    assert claims.exp is not None
    # exp ~ now + 900s ; tolérance large pour ne pas flaker en CI lente.
    assert abs(claims.exp - (int(time.time()) + 900)) < 5


def test_mint_jwt_includes_slot_start_at_when_provided(
    device_id: str, locker_id: str, reservation_id: str, device_secret: str,
) -> None:
    slot_start = int(time.time())
    args = demo_unlock.MintArgs(
        secret=device_secret,
        device_id=device_id,
        locker_id=locker_id,
        reservation_id=reservation_id,
        user_id="user-uuid-1",
        ttl_seconds=900,
        slot_start_at=slot_start,
    )
    token = demo_unlock.mint_jwt(args)
    claims = jwt_verify.verify(
        token, device_secret=device_secret, expected_device_id=device_id,
    )
    assert claims.slot_start_at == slot_start


def test_mint_jwt_unique_jti_each_call(
    device_id: str, locker_id: str, reservation_id: str, device_secret: str,
) -> None:
    """jti doit être unique pour que l'anti-replay côté firmware fonctionne."""
    base = demo_unlock.MintArgs(
        secret=device_secret, device_id=device_id, locker_id=locker_id,
        reservation_id=reservation_id, user_id="user-uuid-1",
        ttl_seconds=900, slot_start_at=None,
    )
    tokens = {demo_unlock.mint_jwt(base) for _ in range(5)}
    # Si deux tokens étaient identiques, le set en aurait 4 ou moins.
    assert len(tokens) == 5


def test_main_exits_2_without_secret(
    device_id: str, locker_id: str, capsys: pytest.CaptureFixture[str],
) -> None:
    """Sans --secret ni $JWT_DEVICE_SECRET, refuser proprement."""
    with patch.dict("os.environ", {}, clear=False):
        # Forcer l'absence de la var
        import os
        os.environ.pop("JWT_DEVICE_SECRET", None)
        rc = demo_unlock.main([
            "--device", device_id, "--locker", locker_id, "--print-only",
        ])
    assert rc == 2
    err = capsys.readouterr().err
    assert "secret" in err.lower()


def test_print_only_does_not_connect_to_broker(
    base_argv: list[str], capsys: pytest.CaptureFixture[str],
) -> None:
    """--print-only doit imprimer le JWT et sortir sans toucher au réseau."""
    with patch.object(demo_unlock, "publish_unlock") as pub_mock:
        rc = demo_unlock.main(base_argv)
    assert rc == 0
    pub_mock.assert_not_called()
    # Le JWT (3 segments séparés par .) doit être sur stdout.
    out = capsys.readouterr().out.strip()
    assert out.count(".") == 2


def test_publish_unlock_publishes_correct_topic_and_payload(
    device_id: str,
) -> None:
    """``publish_unlock`` doit publier exactement {topic, payload, QoS 1}."""
    token = "fake.jwt.token"
    fake_info = MagicMock()
    fake_info.wait_for_publish = MagicMock(return_value=True)
    fake_client = MagicMock()
    fake_client.publish = MagicMock(return_value=fake_info)

    # patch le Client paho à la racine du module pour intercepter
    # l'instanciation.
    with patch.object(demo_unlock.mqtt, "Client", return_value=fake_client):
        demo_unlock.publish_unlock(
            broker_url="mqtt://broker.example:1883",
            device_id=device_id,
            token=token,
        )

    fake_client.connect.assert_called_once_with("broker.example", 1883, keepalive=30)
    fake_client.publish.assert_called_once()
    publish_args, publish_kwargs = fake_client.publish.call_args
    assert publish_args[0] == f"sportlocker/{device_id}/cmd/open"
    assert json.loads(publish_args[1]) == {"token": token}
    assert publish_kwargs.get("qos") == 1
    fake_client.disconnect.assert_called_once()


def test_publish_unlock_default_port_when_url_has_no_port(device_id: str) -> None:
    fake_info = MagicMock()
    fake_info.wait_for_publish = MagicMock(return_value=True)
    fake_client = MagicMock()
    fake_client.publish = MagicMock(return_value=fake_info)
    with patch.object(demo_unlock.mqtt, "Client", return_value=fake_client):
        demo_unlock.publish_unlock(
            broker_url="mqtt://broker.example",
            device_id=device_id,
            token="t",
        )
    fake_client.connect.assert_called_once_with("broker.example", 1883, keepalive=30)


def test_publish_unlock_raises_on_puback_timeout(device_id: str) -> None:
    fake_info = MagicMock()
    fake_info.wait_for_publish = MagicMock(return_value=False)  # timeout
    fake_client = MagicMock()
    fake_client.publish = MagicMock(return_value=fake_info)
    with patch.object(demo_unlock.mqtt, "Client", return_value=fake_client):
        with pytest.raises(SystemExit, match="PUBACK"):
            demo_unlock.publish_unlock(
                broker_url="mqtt://localhost:1883",
                device_id=device_id,
                token="t",
            )
    # Même en cas de timeout PUBACK on doit cleanup la connexion.
    fake_client.disconnect.assert_called_once()
