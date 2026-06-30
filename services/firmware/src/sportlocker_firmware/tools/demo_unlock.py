"""CLI démo — simule un scan QR sans Raspberry Pi ni caméra.

Forge un JWT device valide (mêmes claims que ceux émis par l'app citoyenne
en prod) et le publie sur ``sportlocker/{deviceId}/cmd/open`` via MQTT.
Le firmware-sim reçoit, vérifie la signature et l'expiry, déclenche le
"pulse GPIO simulé", puis publie l'``event`` signé en retour — le cycle
``idle → reserved → active`` se déroule de bout en bout, sans hardware.

Usage typique en démo commerciale :

    # Terminal 1 : lance la stack (mosquitto + firmware-sim)
    docker compose -f infra/docker/docker-compose.dev.yml up

    # Terminal 2 : simule le scan d'un citoyen
    python -m sportlocker_firmware.tools.demo_unlock \\
        --broker mqtt://localhost:1883 \\
        --secret dev-jwt-device-secret-change-me \\
        --device 00000000-0000-0000-0000-000000000000 \\
        --locker 11111111-1111-1111-1111-111111111111 \\
        --reservation $(uuidgen)

Pour la vérif côté observateur, sur un 3e terminal :

    mosquitto_sub -h localhost -p 1883 -v -t 'sportlocker/#'

Note de sécurité : ``--secret`` accepte une valeur en clair pour fluidifier
les démos locales. **Ne jamais** utiliser cette CLI avec le vrai secret prod
en argument bash (il atterrit dans l'historique shell). Pour la prod,
exporter ``JWT_DEVICE_SECRET`` et passer ``--secret-env``.
"""
from __future__ import annotations

import argparse
import json
import os
import secrets
import sys
import time
import uuid
from dataclasses import dataclass

import paho.mqtt.client as mqtt
from jose import jwt

JWT_ISSUER = "sportlocker.app"
JWT_AUDIENCE = "sportlocker.device"
JWT_ALGORITHM = "HS256"
DEFAULT_TTL_SECONDS = 900  # 15 min, identique à l'app citoyenne
PUBLISH_TIMEOUT_SECONDS = 5.0


@dataclass(frozen=True)
class MintArgs:
    secret: str
    device_id: str
    locker_id: str
    reservation_id: str
    user_id: str
    ttl_seconds: int
    slot_start_at: int | None


def mint_jwt(args: MintArgs) -> str:
    """Forge un JWT device aligné sur ``jwt_verify.REQUIRED_CLAIMS``."""
    now = int(time.time())
    claims: dict[str, object] = {
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "sub": args.user_id,
        "userId": args.user_id,
        "jti": secrets.token_hex(16),
        "iat": now,
        "nbf": now,
        "exp": now + args.ttl_seconds,
        "distributorId": args.device_id,
        "lockerId": args.locker_id,
        "reservationId": args.reservation_id,
    }
    if args.slot_start_at is not None:
        # locker_ctrl refuse l'ouverture si now < slot_start_at à tolérance
        # près. Sans cet override, on prend "maintenant" pour ne pas se faire
        # rejeter en démo (le check côté firmware reste actif côté prod).
        claims["slotStartAt"] = args.slot_start_at
    return jwt.encode(claims, args.secret, algorithm=JWT_ALGORITHM)


def publish_unlock(broker_url: str, device_id: str, token: str) -> None:
    """Publie ``{"token": <jwt>}`` sur ``sportlocker/{deviceId}/cmd/open``.

    Bloque jusqu'au PUBACK (QoS 1) ou jusqu'à ``PUBLISH_TIMEOUT_SECONDS``.
    """
    host, port = _parse_broker_url(broker_url)
    topic = f"sportlocker/{device_id}/cmd/open"
    payload = json.dumps({"token": token})

    client = mqtt.Client(
        client_id=f"demo-unlock-{secrets.token_hex(4)}",
        protocol=mqtt.MQTTv5,
    )
    try:
        client.connect(host, port, keepalive=30)
    except OSError as exc:
        raise SystemExit(
            f"[demo_unlock] connexion broker {host}:{port} impossible : {exc}",
        ) from exc

    client.loop_start()
    try:
        info = client.publish(topic, payload, qos=1)
        ok = info.wait_for_publish(timeout=PUBLISH_TIMEOUT_SECONDS)
        if not ok:
            raise SystemExit(
                f"[demo_unlock] PUBACK non reçu en {PUBLISH_TIMEOUT_SECONDS}s",
            )
    finally:
        client.loop_stop()
        client.disconnect()


def _parse_broker_url(url: str) -> tuple[str, int]:
    rest = url.split("://", 1)[-1] if "://" in url else url
    if ":" in rest:
        host, port_str = rest.split(":", 1)
        return host, int(port_str)
    return rest, 1883


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python -m sportlocker_firmware.tools.demo_unlock",
        description="Simule un scan QR (JWT device + publication MQTT cmd/open) "
                    "pour démontrer le firmware sans Raspberry Pi physique.",
    )
    p.add_argument(
        "--broker", default=os.environ.get("MQTT_URL", "mqtt://localhost:1883"),
        help="URL broker MQTT (défaut: $MQTT_URL ou mqtt://localhost:1883)",
    )
    p.add_argument(
        "--secret", default=None,
        help="Secret HS256 partagé avec le firmware. "
             "À défaut, lu dans $JWT_DEVICE_SECRET.",
    )
    p.add_argument(
        "--device", "--device-id", dest="device_id", required=True,
        help="UUID du distributeur (doit matcher DEVICE_ID du firmware-sim).",
    )
    p.add_argument(
        "--locker", "--locker-id", dest="locker_id", required=True,
        help="UUID du casier ciblé (doit être présent dans calibration.json).",
    )
    p.add_argument(
        "--reservation", "--reservation-id", dest="reservation_id", default=None,
        help="UUID de la réservation. Auto-généré si omis.",
    )
    p.add_argument(
        "--user", "--user-id", dest="user_id", default=None,
        help="UUID du citoyen. Auto-généré si omis (démo).",
    )
    p.add_argument(
        "--ttl", type=int, default=DEFAULT_TTL_SECONDS,
        help=f"Durée de validité du JWT en secondes (défaut: {DEFAULT_TTL_SECONDS}).",
    )
    p.add_argument(
        "--slot-start-at", type=int, default=None,
        help="Epoch seconds du début du créneau réservé. "
             "Si omis et que le firmware exige ce claim, prendre 'now'.",
    )
    p.add_argument(
        "--print-only", action="store_true",
        help="Imprime le JWT sur stdout sans publier sur MQTT.",
    )
    return p


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)

    secret = args.secret or os.environ.get("JWT_DEVICE_SECRET")
    if not secret:
        print(
            "[demo_unlock] secret manquant : passe --secret ou exporte "
            "JWT_DEVICE_SECRET.",
            file=sys.stderr,
        )
        return 2

    mint_args = MintArgs(
        secret=secret,
        device_id=args.device_id,
        locker_id=args.locker_id,
        reservation_id=args.reservation_id or str(uuid.uuid4()),
        user_id=args.user_id or str(uuid.uuid4()),
        ttl_seconds=args.ttl,
        slot_start_at=args.slot_start_at,
    )
    token = mint_jwt(mint_args)

    if args.print_only:
        print(token)
        return 0

    print(
        f"[demo_unlock] minté JWT — reservation={mint_args.reservation_id} "
        f"locker={mint_args.locker_id} ttl={mint_args.ttl_seconds}s",
        file=sys.stderr,
    )
    publish_unlock(args.broker, args.device_id, token)
    print(
        f"[demo_unlock] publié sur sportlocker/{args.device_id}/cmd/open ✓",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
