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
) -> str:
    now = int(time.time())
    return jose_jwt.encode(
        {
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
        },
        secret,
        algorithm=JWT_ALGORITHM,
    )


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


# ─── Pulse GPIO : timeout + retry idempotent ────────────────────────────────


def test_pulse_unmapped_locker_returns_false(controller: LockerController) -> None:
    """Pulse sur un locker non mappé GPIO doit retourner False sans lever."""
    assert controller._pulse_open("locker-not-mapped") is False


def test_pulse_simulated_succeeds_on_first_attempt(
    controller: LockerController, locker_id: str,
) -> None:
    """En mode dev (sans RPi.GPIO), le pulse réussit en simulé."""
    assert controller._pulse_open(locker_id) is True


def test_pulse_retries_on_failure_then_succeeds(
    controller: LockerController, locker_id: str, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Si le premier pulse lève, le 2e (retry idempotent) est tenté."""
    attempts = {"n": 0}

    def flaky(_self: LockerController, _pin: int, _timeout: float) -> None:
        attempts["n"] += 1
        if attempts["n"] == 1:
            raise OSError("gpio_busy")
        # 2e tentative : OK

    monkeypatch.setattr(
        "sportlocker_firmware.locker_ctrl.LockerController._run_pulse_with_timeout",
        flaky,
    )
    assert controller._pulse_open(locker_id) is True
    assert attempts["n"] == 2


def test_pulse_exhausts_retries_and_returns_false(
    controller: LockerController, locker_id: str, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Si toutes les tentatives échouent, retourne False (HARDWARE_FAULT en aval)."""
    attempts = {"n": 0}

    def always_fails(_self: LockerController, _pin: int, _timeout: float) -> None:
        attempts["n"] += 1
        raise OSError("driver_dead")

    monkeypatch.setattr(
        "sportlocker_firmware.locker_ctrl.LockerController._run_pulse_with_timeout",
        always_fails,
    )
    assert controller._pulse_open(locker_id) is False
    # 1 essai initial + 1 retry par défaut.
    assert attempts["n"] == 2


def test_pulse_timeout_raises_in_inner_helper(
    controller: LockerController, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Si le thread du pulse n'aboutit pas dans le timeout, on lève TimeoutError."""
    import sportlocker_firmware.locker_ctrl as mod
    monkeypatch.setattr(mod, "_GPIO_AVAILABLE", True)

    stub = MagicMock()
    stub.LOW = 0
    stub.HIGH = 1
    stub.output = MagicMock()  # rapide, mais sleep prend toute la place
    monkeypatch.setattr(mod, "GPIO", stub)
    monkeypatch.setattr(mod, "GPIO_PULSE_SECONDS", 5.0)  # plus long que timeout

    with pytest.raises(TimeoutError):
        controller._run_pulse_with_timeout(pin=17, timeout_s=0.05)


def test_pulse_propagates_inner_exception(
    controller: LockerController, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Si GPIO.output lève dans le thread, l'exception est remontée."""
    import sportlocker_firmware.locker_ctrl as mod
    monkeypatch.setattr(mod, "_GPIO_AVAILABLE", True)

    stub = MagicMock()
    stub.LOW = 0
    stub.HIGH = 1
    stub.output = MagicMock(side_effect=OSError("ioctl_failed"))
    monkeypatch.setattr(mod, "GPIO", stub)
    monkeypatch.setattr(mod, "GPIO_PULSE_SECONDS", 0.001)

    with pytest.raises(OSError, match="ioctl_failed"):
        controller._run_pulse_with_timeout(pin=17, timeout_s=2.0)


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
