"""Démo bench matériel — ouverture séquentielle des casiers + QR/NFC factices.

Cible ``make demo``. Déroule, **sans aucun composant physique** (mode mock si
``RPi.GPIO`` absent), la chaîne que le technicien validera au banc :

  1. ouverture séquentielle des casiers 1→4 (pulse GPIO) avec état HIGH/LOW ;
  2. lecture d'un **QR factice** poussé dans le vrai chemin de sécurité
     (JWT → anti-replay → GPIO → event MQTT signé, via un broker loopback) ;
  3. lecture d'un **tag NFC factice** (UID → callback ``NFCReader``).

Sur un vrai Pi (``RPi.GPIO`` présent), les pulses sont réels : brancher une LED
sur BCM17/27/22/23 pour voir chaque canal s'activer (cf. ``BENCH_TEST.md`` §3).

    make demo                       # séquence complète, pulses courts
    make demo ARGS="--duration-ms 800"
"""
from __future__ import annotations

import argparse
import os
import sys
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any, TextIO, cast

from ..gpio_relay import BENCH_GPIO_MAPPING, RelayController
from ..locker_ctrl import LockerController, UnlockResult
from ..nfc_reader import NFCReader
from .demo_unlock import MintArgs, mint_jwt
from .local_scan import _LoopbackMQTT

DEMO_DEVICE_ID = "dist-bench-0001"
DEMO_SECRET = "dev-secret-min-32-chars-xxxxxxxxxx"
BENCH_LOCKERS = ("locker_1", "locker_2", "locker_3", "locker_4")


def demo_gpio_sequence(
    relay: RelayController, *, duration_ms: int, out: TextIO,
) -> list[dict[str, Any]]:
    """Ouvre séquentiellement les 4 casiers et retourne leur état final."""
    print("\n── 1. Ouverture séquentielle des casiers (GPIO) ──────────────", file=out)
    print(f"   mode: {'RÉEL (RPi.GPIO)' if relay.gpio_available else 'SIMULÉ (mock)'}"
          f"   pulse: {duration_ms} ms\n", file=out)
    statuses: list[dict[str, Any]] = []
    for n, label in enumerate(BENCH_LOCKERS, start=1):
        pin = BENCH_GPIO_MAPPING[label]
        before = relay.get_locker_status(label)["gpio_state"]
        ok = relay.open_locker(n, duration_ms=duration_ms)  # int → locker_{n}
        after = relay.get_locker_status(label)
        statuses.append(after)
        flag = "✓" if ok else "✗"
        print(
            f"   casier {n} (BCM{pin:>2})  repos={before:<4} "
            f"→ pulse LOW {duration_ms}ms → {after['gpio_state']:<4} "
            f"{flag}  last_open_at={after['last_open_at']}",
            file=out,
        )
    print(f"\n   états GPIO: {relay.get_gpio_states()}", file=out)
    return statuses


def demo_qr(*, secret: str, device_id: str, out: TextIO) -> UnlockResult:
    """Pousse un QR factice (JWT device) dans le vrai chemin de sécurité."""
    print("\n── 2. Lecture QR factice → chemin sécurité complet ───────────", file=out)
    locker_id = BENCH_LOCKERS[0]
    reservation_id = str(uuid.uuid4())
    token = mint_jwt(MintArgs(
        secret=secret,
        device_id=device_id,
        locker_id=locker_id,
        reservation_id=reservation_id,
        user_id=str(uuid.uuid4()),
        ttl_seconds=900,
        slot_start_at=None,
    ))
    print(f"   QR factice (ce que la caméra décoderait):\n   {token[:56]}…", file=out)

    tmp_dir = tempfile.mkdtemp(prefix="sportlocker-bench-")
    controller = LockerController(
        mqtt=cast("Any", _LoopbackMQTT(connected=True)),
        device_id=device_id,
        device_secret=secret,
        gpio_mapping={locker_id: BENCH_GPIO_MAPPING[locker_id]},
        db_path=str(Path(tmp_dir) / "agent.db"),
    )
    try:
        controller.upsert_reservation(
            reservation_id, locker_id, expires_at=int(time.time()) + 900,
        )
        result = controller.handle_unlock(token)
        print(f"   → outcome: {result.outcome.value}  (locker={result.locker_id})", file=out)
        return result
    finally:
        controller.close()


def demo_nfc(*, out: TextIO) -> bytes:
    """Simule la lecture d'un tag NFC factice via le dispatch NFCReader."""
    print("\n── 3. Lecture tag NFC factice → callback ─────────────────────", file=out)
    read: list[bytes] = []
    reader = NFCReader(on_card=read.append)
    fake_uid = b"\x04\xde\xad\xbe\xef\x10\x80"
    reader._dispatch(fake_uid)
    uid = read[0] if read else b""
    print(f"   tag factice UID: {uid.hex(':')}  (nfc_ok={reader.nfc_ok})", file=out)
    return uid


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python -m sportlocker_firmware.tools.bench_demo",
        description="Démo bench : ouverture séquentielle des casiers + QR/NFC "
                    "factices, sans composant physique (mock si RPi.GPIO absent).",
    )
    p.add_argument("--secret", default=os.environ.get("JWT_DEVICE_SECRET", DEMO_SECRET),
                   help="Secret HS256 pour le QR factice (défaut: secret de démo).")
    p.add_argument("--device", "--device-id", dest="device_id", default=DEMO_DEVICE_ID,
                   help="UUID/identifiant du distributeur pour le QR factice.")
    p.add_argument("--duration-ms", type=int, default=300,
                   help="Durée du pulse d'ouverture en ms (défaut: 300).")
    return p


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    out = sys.stderr

    print("═══ SportLocker firmware — démo bench matériel ═══", file=out)

    relay = RelayController(BENCH_GPIO_MAPPING)
    try:
        demo_gpio_sequence(relay, duration_ms=args.duration_ms, out=out)
    finally:
        relay.cleanup()

    result = demo_qr(secret=args.secret, device_id=args.device_id, out=out)
    demo_nfc(out=out)

    print("\n═══ démo terminée ═══", file=out)
    return 0 if result.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
