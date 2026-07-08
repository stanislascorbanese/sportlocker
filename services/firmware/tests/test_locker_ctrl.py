"""Tests d'intégration LockerController : QR scan → JWT → GPIO → MQTT.

GPIO étant absent en CI, le controller log "gpio_pulse_simulated" mais
retourne True quand même — c'est ce comportement qu'on teste.
"""
from __future__ import annotations

import json
import time
from typing import Any
from unittest.mock import MagicMock

import pytest
from jose import jwt as jose_jwt

from sportlocker_firmware.jwt_verify import JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER
from sportlocker_firmware.locker_ctrl import LockerController, UnlockOutcome


def _make_token(
    secret: str,
    *,
    device_id: str,
    locker_id: str,
    reservation_id: str,
    jti: str,
    exp_offset: int = 900,
    slot_start_offset: int | None = None,
) -> str:
    """Forge un JWT QR pour les tests. ``slot_start_offset`` permet de simuler
    un créneau futur (positif) ou passé (négatif). None = résa legacy sans
    claim ``slotStartAt``."""
    now = int(time.time())
    claims: dict[str, object] = {
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "sub": "user-1",
        "userId": "user-1",
        "jti": jti,
        "iat": now,
        "nbf": now,
        "exp": now + exp_offset,
        "distributorId": device_id,
        "lockerId": locker_id,
        "reservationId": reservation_id,
    }
    if slot_start_offset is not None:
        claims["slotStartAt"] = now + slot_start_offset
    return jose_jwt.encode(claims, secret, algorithm=JWT_ALGORITHM)


@pytest.fixture
def mqtt_stub() -> MagicMock:
    m = MagicMock()
    m.is_connected = True
    return m


@pytest.fixture
def controller(
    tmp_db_path: str,
    mqtt_stub: MagicMock,
    device_secret: str,
    device_id: str,
    locker_id: str,
) -> LockerController:
    ctrl = LockerController(
        mqtt=mqtt_stub,
        device_id=device_id,
        device_secret=device_secret,
        gpio_mapping={locker_id: 17},
        db_path=tmp_db_path,
    )
    yield ctrl
    ctrl.close()


def test_unlock_success_on_valid_token(
    controller: LockerController,
    mqtt_stub: MagicMock,
    device_secret: str,
    device_id: str,
    locker_id: str,
    reservation_id: str,
) -> None:
    token = _make_token(
        device_secret,
        device_id=device_id,
        locker_id=locker_id,
        reservation_id=reservation_id,
        jti="nonce-success",
    )
    result = controller.handle_unlock(token)
    assert result.ok is True
    assert result.outcome is UnlockOutcome.SUCCESS

    # Un event MQTT signé a été publié.
    mqtt_stub.publish.assert_called_once()
    args, kwargs = mqtt_stub.publish.call_args
    topic, envelope = args[0], args[1]
    assert topic == "event"
    assert envelope["data"]["type"] == "door_unlocked"
    assert envelope["data"]["lockerId"] == locker_id
    assert "sig" in envelope and len(envelope["sig"]) == 64


def test_replay_blocked_on_second_use(
    controller: LockerController,
    device_secret: str,
    device_id: str,
    locker_id: str,
    reservation_id: str,
) -> None:
    token = _make_token(
        device_secret,
        device_id=device_id,
        locker_id=locker_id,
        reservation_id=reservation_id,
        jti="nonce-replay",
    )
    first = controller.handle_unlock(token)
    second = controller.handle_unlock(token)
    assert first.ok is True
    assert second.outcome is UnlockOutcome.REPLAY


def test_invalid_signature_returns_invalid_token(
    controller: LockerController,
    device_id: str,
    locker_id: str,
    reservation_id: str,
) -> None:
    token = _make_token(
        "wrong-secret",
        device_id=device_id,
        locker_id=locker_id,
        reservation_id=reservation_id,
        jti="nonce-bad-sig",
    )
    result = controller.handle_unlock(token)
    assert result.outcome is UnlockOutcome.INVALID_TOKEN


def test_expired_token_returns_expired(
    controller: LockerController,
    device_secret: str,
    device_id: str,
    locker_id: str,
    reservation_id: str,
) -> None:
    token = _make_token(
        device_secret,
        device_id=device_id,
        locker_id=locker_id,
        reservation_id=reservation_id,
        jti="nonce-expired",
        exp_offset=-10,
    )
    result = controller.handle_unlock(token)
    assert result.outcome is UnlockOutcome.EXPIRED


def test_unknown_locker_returns_unknown_locker(
    controller: LockerController,
    device_secret: str,
    device_id: str,
    reservation_id: str,
) -> None:
    # Token pour un locker non mappé en GPIO local.
    token = _make_token(
        device_secret,
        device_id=device_id,
        locker_id="locker-not-mapped",
        reservation_id=reservation_id,
        jti="nonce-unknown",
    )
    result = controller.handle_unlock(token)
    assert result.outcome is UnlockOutcome.UNKNOWN_LOCKER


def test_offline_without_cached_reservation_denies(
    controller: LockerController,
    mqtt_stub: MagicMock,
    device_secret: str,
    device_id: str,
    locker_id: str,
    reservation_id: str,
) -> None:
    """Si on est offline et qu'on n'a pas la réservation en cache, refus par défense."""
    mqtt_stub.is_connected = False
    token = _make_token(
        device_secret,
        device_id=device_id,
        locker_id=locker_id,
        reservation_id=reservation_id,
        jti="nonce-offline-uncached",
    )
    result = controller.handle_unlock(token)
    assert result.outcome is UnlockOutcome.CACHE_MISS_OFFLINE


def test_offline_with_cached_reservation_opens(
    controller: LockerController,
    mqtt_stub: MagicMock,
    device_secret: str,
    device_id: str,
    locker_id: str,
    reservation_id: str,
) -> None:
    mqtt_stub.is_connected = False
    controller.upsert_reservation(
        reservation_id, locker_id, expires_at=int(time.time()) + 3600,
    )
    token = _make_token(
        device_secret,
        device_id=device_id,
        locker_id=locker_id,
        reservation_id=reservation_id,
        jti="nonce-offline-cached",
    )
    # publish va lever, le payload doit être queué dans pending_events
    mqtt_stub.publish.side_effect = ConnectionError("broker down")
    result = controller.handle_unlock(token)
    assert result.ok is True
    # Une ligne pending_events doit exister
    pending = controller._db.execute(
        "SELECT topic, envelope_json FROM pending_events"
    ).fetchall()
    assert len(pending) == 1
    envelope = json.loads(pending[0][1])
    assert envelope["data"]["mode"] == "offline"


def test_cached_locker_mismatch_returns_mismatch(
    controller: LockerController,
    device_secret: str,
    device_id: str,
    locker_id: str,
    reservation_id: str,
) -> None:
    # Le cache dit que cette réservation cible "autre-locker".
    controller.upsert_reservation(
        reservation_id, "autre-locker", expires_at=int(time.time()) + 3600,
    )
    token = _make_token(
        device_secret,
        device_id=device_id,
        locker_id=locker_id,
        reservation_id=reservation_id,
        jti="nonce-mismatch",
    )
    result = controller.handle_unlock(token)
    assert result.outcome is UnlockOutcome.LOCKER_MISMATCH


def test_flush_pending_events_replays_queued(
    controller: LockerController,
    mqtt_stub: MagicMock,
    device_secret: str,
    device_id: str,
    locker_id: str,
    reservation_id: str,
) -> None:
    # Force la mise en file en faisant échouer publish.
    mqtt_stub.is_connected = False
    controller.upsert_reservation(
        reservation_id, locker_id, expires_at=int(time.time()) + 3600,
    )
    mqtt_stub.publish.side_effect = ConnectionError("down")
    token = _make_token(
        device_secret,
        device_id=device_id,
        locker_id=locker_id,
        reservation_id=reservation_id,
        jti="nonce-queue",
    )
    controller.handle_unlock(token)
    assert (
        controller._db.execute("SELECT COUNT(*) FROM pending_events").fetchone()[0] == 1
    )

    # Réseau revient.
    mqtt_stub.publish.side_effect = None
    flushed = controller.flush_pending_events()
    assert flushed == 1
    assert (
        controller._db.execute("SELECT COUNT(*) FROM pending_events").fetchone()[0] == 0
    )


def test_remove_reservation_clears_cache(
    controller: LockerController, locker_id: str, reservation_id: str,
) -> None:
    controller.upsert_reservation(
        reservation_id, locker_id, expires_at=int(time.time()) + 3600,
    )
    controller.remove_reservation(reservation_id)
    assert controller._lookup_reservation(reservation_id) is None


def test_internal_error_path_returns_internal_error(
    controller: LockerController, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Si une exception inattendue surgit, on retourne INTERNAL_ERROR sans lever."""
    def boom(*_a: Any, **_kw: Any) -> None:
        raise RuntimeError("simulated_crash")

    monkeypatch.setattr("sportlocker_firmware.locker_ctrl.verify", boom)
    result = controller.handle_unlock("anything")
    assert result.outcome is UnlockOutcome.INTERNAL_ERROR
    assert "simulated_crash" in (result.detail or "")


# ─── Modèle slots : check slot_start_at (PR 0010) ──────────────────────────


def test_slot_scan_before_start_returns_slot_not_yet_open(
    controller: LockerController,
    device_secret: str,
    device_id: str,
    locker_id: str,
    reservation_id: str,
) -> None:
    """Un scan d'un QR slot AVANT son ``slot_start_at`` doit être refusé sans
    consommer le nonce (le user pourra re-scanner à l'heure dite)."""
    # Créneau dans 1h → bien au-delà de la tolérance d'horloge (60s).
    token = _make_token(
        device_secret,
        device_id=device_id,
        locker_id=locker_id,
        reservation_id=reservation_id,
        jti="nonce-too-early",
        slot_start_offset=3600,
    )
    result = controller.handle_unlock(token)
    assert result.outcome is UnlockOutcome.SLOT_NOT_YET_OPEN
    assert result.reservation_id == reservation_id
    assert "wait_" in (result.detail or "")

    # Le nonce n'a PAS été consommé : un retry à l'heure dite doit aboutir
    # (on bypasse le check time avec un slot_start_offset = -10s = passé).
    token2 = _make_token(
        device_secret,
        device_id=device_id,
        locker_id=locker_id,
        reservation_id=reservation_id,
        jti="nonce-too-early",  # même jti
        slot_start_offset=-10,
    )
    result2 = controller.handle_unlock(token2)
    assert result2.outcome is UnlockOutcome.SUCCESS


def test_slot_scan_within_tolerance_succeeds(
    controller: LockerController,
    device_secret: str,
    device_id: str,
    locker_id: str,
    reservation_id: str,
) -> None:
    """Tolérance d'horloge : un scan jusqu'à 60s avant ``slot_start_at`` est OK
    (clock skew Pi/smartphone). Au-delà → refus."""
    token = _make_token(
        device_secret,
        device_id=device_id,
        locker_id=locker_id,
        reservation_id=reservation_id,
        jti="nonce-edge-tolerance",
        slot_start_offset=30,  # 30s dans le futur < 60s tolérance
    )
    result = controller.handle_unlock(token)
    assert result.outcome is UnlockOutcome.SUCCESS


def test_slot_scan_after_start_succeeds(
    controller: LockerController,
    device_secret: str,
    device_id: str,
    locker_id: str,
    reservation_id: str,
) -> None:
    """Scan à l'heure ou après : ouvre normalement."""
    token = _make_token(
        device_secret,
        device_id=device_id,
        locker_id=locker_id,
        reservation_id=reservation_id,
        jti="nonce-on-time",
        slot_start_offset=-5,  # créneau a commencé il y a 5s
    )
    result = controller.handle_unlock(token)
    assert result.outcome is UnlockOutcome.SUCCESS


def test_legacy_token_without_slot_claim_works_as_before(
    controller: LockerController,
    device_secret: str,
    device_id: str,
    locker_id: str,
    reservation_id: str,
) -> None:
    """Régression : un JWT sans claim ``slotStartAt`` (résa legacy
    immédiate) doit toujours s'ouvrir sans passer par le check slot."""
    token = _make_token(
        device_secret,
        device_id=device_id,
        locker_id=locker_id,
        reservation_id=reservation_id,
        jti="nonce-legacy",
        slot_start_offset=None,  # pas de claim
    )
    result = controller.handle_unlock(token)
    assert result.outcome is UnlockOutcome.SUCCESS


# ─── Pulse GPIO : timeout + retry idempotent ────────────────────────────────


def test_pulse_unmapped_locker_returns_false(controller: LockerController) -> None:
    """Pulse sur un locker non mappé GPIO doit retourner False sans lever."""
    assert controller._pulse_open("locker-not-mapped") is False


def test_pulse_simulated_succeeds_on_first_attempt(
    controller: LockerController, locker_id: str,
) -> None:
    """En mode dev (sans RPi.GPIO), le pulse réussit en simulé."""
    assert controller._pulse_open(locker_id) is True


def test_hardware_fault_when_gpio_pulse_returns_false(
    controller: LockerController, monkeypatch: pytest.MonkeyPatch,
    device_secret: str, device_id: str, locker_id: str, reservation_id: str,
) -> None:
    """Quand _pulse_open retourne False, l'outcome doit être HARDWARE_FAULT."""
    monkeypatch.setattr(
        "sportlocker_firmware.locker_ctrl.LockerController._pulse_open",
        lambda *_a, **_kw: False,
    )
    token = _make_token(
        device_secret,
        device_id=device_id,
        locker_id=locker_id,
        reservation_id=reservation_id,
        jti="nonce-hw-fault",
    )
    result = controller.handle_unlock(token)
    assert result.outcome is UnlockOutcome.HARDWARE_FAULT


# ─── Passthroughs GPIO (diagnostic / heartbeat / bench) ─────────────────────


def test_open_locker_direct_bypasses_jwt(
    controller: LockerController, locker_id: str,
) -> None:
    """open_locker ouvre directement (hors chemin JWT) — utilisé au bench."""
    assert controller.open_locker(locker_id) is True


def test_get_gpio_states_reflects_mapping(
    controller: LockerController, locker_id: str,
) -> None:
    """Au repos toutes les broches mappées sont HIGH (verrouillé)."""
    states = controller.get_gpio_states()
    assert states == {locker_id: "HIGH"}


def test_get_locker_status_tracks_last_open(
    controller: LockerController, locker_id: str,
) -> None:
    """Après une ouverture, last_open_at est renseigné et l'état revient HIGH."""
    before = controller.get_locker_status(locker_id)
    assert before["last_open_at"] is None
    assert before["gpio_state"] == "HIGH"

    controller.open_locker(locker_id)

    after = controller.get_locker_status(locker_id)
    assert after["gpio_state"] == "HIGH"  # retour HIGH fail-secure
    assert isinstance(after["last_open_at"], int)
    assert after["error"] is None
    assert after["pin"] == 17


def test_unlock_records_last_open_at(
    controller: LockerController,
    device_secret: str, device_id: str, locker_id: str, reservation_id: str,
) -> None:
    """Un handle_unlock réussi met à jour l'état GPIO exposé au heartbeat."""
    token = _make_token(
        device_secret,
        device_id=device_id,
        locker_id=locker_id,
        reservation_id=reservation_id,
        jti="nonce-state-track",
    )
    assert controller.handle_unlock(token).ok is True
    status = controller.get_locker_status(locker_id)
    assert isinstance(status["last_open_at"], int)
