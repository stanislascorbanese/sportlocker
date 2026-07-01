"""Mock local QR → JWT → GPIO — sans Raspberry Pi, sans caméra, sans broker.

Contrairement à ``demo_unlock`` (qui publie sur MQTT et exige un broker +
firmware-sim), cet outil exécute *en process* le vrai chemin de sécurité du
firmware :

    mint JWT device  →  LockerController.handle_unlock(token)
                        ├─ jwt_verify (HS256 + claims + distributeur cible)
                        ├─ anti-replay (NonceStore SQLite)
                        ├─ cohérence mapping GPIO (calibration)
                        ├─ cache réservation (mode online/offline)
                        ├─ pulse GPIO  ← simulé hors Pi ("gpio_pulse_simulated")
                        └─ event MQTT signé HMAC-SHA256  ← capté par un faux client

Aucune dépendance externe : ni Docker, ni Mosquitto, ni /dev/video0, ni
/dev/gpiomem. Idéal pour valider la logique sur un poste de dev ou en CI, et
pour rejouer les cas d'erreur (replay, offline, hors créneau).

Exemples :

    # Cas nominal (réservation en cache, broker "connecté") → success
    python -m sportlocker_firmware.tools.local_scan \\
        --secret dev-secret --device dist-1 --locker locker-1

    # Rejoue le même QR deux fois → 2e scan = replay bloqué
    python -m sportlocker_firmware.tools.local_scan \\
        --secret dev-secret --device dist-1 --locker locker-1 --replay

    # Simule une coupure réseau sans réservation cachée → cache_miss_offline
    python -m sportlocker_firmware.tools.local_scan \\
        --secret dev-secret --device dist-1 --locker locker-1 \\
        --offline --no-cache

    # QR scanné avant le début du créneau → slot_not_yet_open (nonce préservé)
    python -m sportlocker_firmware.tools.local_scan \\
        --secret dev-secret --device dist-1 --locker locker-1 \\
        --slot-start-in 3600
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import sys
import tempfile
import time
import uuid
from pathlib import Path
from typing import TYPE_CHECKING, Any, cast

from ..locker_ctrl import LockerController, UnlockResult
from .demo_unlock import MintArgs, mint_jwt

if TYPE_CHECKING:
    from ..mqtt_client import MQTTClient


class _LoopbackMQTT:
    """Faux MQTTClient : capte les publications au lieu de les envoyer.

    Reproduit la surface utilisée par ``LockerController`` :
      - attribut ``is_connected`` (pilote le mode online/offline) ;
      - méthode ``publish(topic, payload, qos)`` qui archive l'envelope.
    """

    def __init__(self, *, connected: bool = True) -> None:
        self.is_connected = connected
        self.published: list[tuple[str, dict[str, Any], int]] = []

    def publish(self, topic: str, payload: dict[str, Any], qos: int = 0) -> None:
        self.published.append((topic, payload, qos))


def _verify_event_signature(envelope: dict[str, Any], secret: str) -> bool:
    """Recalcule la signature HMAC de l'event pour prouver son intégrité."""
    data = envelope.get("data")
    sig = envelope.get("sig")
    if not isinstance(data, dict) or not isinstance(sig, str):
        return False
    canonical = json.dumps(data, sort_keys=True, separators=(",", ":")).encode("utf-8")
    expected = hmac.new(secret.encode("utf-8"), canonical, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig)


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python -m sportlocker_firmware.tools.local_scan",
        description="Mock local QR→JWT→GPIO : exécute handle_unlock() en process, "
                    "sans Raspberry Pi ni broker MQTT.",
    )
    p.add_argument("--secret", default=None,
                   help="Secret HS256. À défaut, lu dans $JWT_DEVICE_SECRET.")
    p.add_argument("--device", "--device-id", dest="device_id", required=True,
                   help="UUID/identifiant du distributeur (= DEVICE_ID du firmware).")
    p.add_argument("--locker", "--locker-id", dest="locker_id", required=True,
                   help="Identifiant du casier ciblé (sera mappé sur --pin).")
    p.add_argument("--pin", type=int, default=17,
                   help="Pin BCM associé au casier dans le mapping (défaut: 17).")
    p.add_argument("--reservation", "--reservation-id", dest="reservation_id",
                   default=None, help="UUID de réservation. Auto-généré si omis.")
    p.add_argument("--user", "--user-id", dest="user_id", default=None,
                   help="UUID citoyen. Auto-généré si omis.")
    p.add_argument("--ttl", type=int, default=900,
                   help="Validité du JWT en secondes (défaut: 900).")
    p.add_argument("--slot-start-in", type=int, default=None,
                   help="Décalage (s) du début de créneau par rapport à maintenant. "
                        "Positif = créneau futur (test slot_not_yet_open).")
    p.add_argument("--offline", action="store_true",
                   help="Simule un broker déconnecté (is_connected=False).")
    p.add_argument("--no-cache", action="store_true",
                   help="Ne pré-cache PAS la réservation (test trust-jwt / cache-miss).")
    p.add_argument("--replay", action="store_true",
                   help="Rejoue le même QR une 2e fois pour déclencher l'anti-replay.")
    return p


def _run_scan(
    controller: LockerController, token: str, *, label: str
) -> UnlockResult:
    print(f"\n── scan {label} ─────────────────────────────────────────", file=sys.stderr)
    result = controller.handle_unlock(token)
    print(f"   outcome        : {result.outcome.value}", file=sys.stderr)
    print(f"   reservation_id : {result.reservation_id}", file=sys.stderr)
    print(f"   locker_id      : {result.locker_id}", file=sys.stderr)
    if result.detail:
        print(f"   detail         : {result.detail}", file=sys.stderr)
    return result


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)

    secret = args.secret or os.environ.get("JWT_DEVICE_SECRET")
    if not secret:
        print("[local_scan] secret manquant : passe --secret ou exporte "
              "JWT_DEVICE_SECRET.", file=sys.stderr)
        return 2

    reservation_id = args.reservation_id or str(uuid.uuid4())
    slot_start_at = (
        int(time.time()) + args.slot_start_in if args.slot_start_in is not None else None
    )
    token = mint_jwt(MintArgs(
        secret=secret,
        device_id=args.device_id,
        locker_id=args.locker_id,
        reservation_id=reservation_id,
        user_id=args.user_id or str(uuid.uuid4()),
        ttl_seconds=args.ttl,
        slot_start_at=slot_start_at,
    ))

    mqtt = _LoopbackMQTT(connected=not args.offline)

    # DB temporaire jetable : anti-replay + cache vivent le temps du run.
    tmp_dir = tempfile.mkdtemp(prefix="sportlocker-localscan-")
    db_path = str(Path(tmp_dir) / "agent.db")
    controller = LockerController(
        # _LoopbackMQTT implémente la surface (is_connected + publish) utilisée
        # par le controller ; cast pour satisfaire le typage strict.
        mqtt=cast("MQTTClient", mqtt),
        device_id=args.device_id,
        device_secret=secret,
        gpio_mapping={args.locker_id: args.pin},
        db_path=db_path,
    )

    print(f"[local_scan] device={args.device_id} locker={args.locker_id} "
          f"pin=BCM{args.pin} online={mqtt.is_connected} cached={not args.no_cache}",
          file=sys.stderr)

    try:
        if not args.no_cache:
            controller.upsert_reservation(
                reservation_id, args.locker_id, expires_at=int(time.time()) + args.ttl,
            )

        result = _run_scan(controller, token, label="#1")
        if args.replay:
            _run_scan(controller, token, label="#2 (replay)")

        # Vérifie l'intégrité du dernier event publié (le cas success en publie un).
        if mqtt.published:
            topic, envelope, _qos = mqtt.published[-1]
            valid = _verify_event_signature(envelope, secret)
            print(f"\n[local_scan] event publié sur '{topic}' — "
                  f"signature HMAC {'✓ valide' if valid else '✗ INVALIDE'}",
                  file=sys.stderr)
            print(json.dumps(envelope, indent=2, ensure_ascii=False))
        else:
            print("\n[local_scan] aucun event MQTT publié (ouverture non aboutie).",
                  file=sys.stderr)

        return 0 if result.ok else 1
    finally:
        controller.close()


if __name__ == "__main__":
    raise SystemExit(main())
