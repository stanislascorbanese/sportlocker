"""Tests RelayController — pilotage GPIO bas-niveau (mock hors Pi).

Sans RPi.GPIO en CI, ``_GPIO_AVAILABLE`` est False → le pulse est simulé
(``gpio_pulse_simulated``) mais l'API de suivi d'état reste identique. Les
tests du chemin *réel* (thread + watchdog) forcent ``_GPIO_AVAILABLE=True`` et
injectent un stub GPIO.
"""
from __future__ import annotations

import time
from unittest.mock import MagicMock

import pytest

import sportlocker_firmware.gpio_relay as mod
from sportlocker_firmware.gpio_relay import RelayController


@pytest.fixture
def relay() -> RelayController:
    return RelayController({"locker_1": 17, "locker_2": 27})


# ─── API haut niveau (mock mode) ────────────────────────────────────────────


def test_open_locker_simulated_succeeds(relay: RelayController) -> None:
    assert relay.open_locker("locker_1") is True


def test_open_locker_int_resolves_to_label(relay: RelayController) -> None:
    """Un int (câblage physique IN{n}) est mappé sur locker_{n}."""
    assert relay.open_locker(1) is True
    status = relay.get_locker_status(1)
    assert status["locker_id"] == "locker_1"
    assert status["pin"] == 17


def test_open_unmapped_returns_false_and_records_error(relay: RelayController) -> None:
    assert relay.open_locker("locker_9") is False
    status = relay.get_locker_status("locker_9")
    assert status["pin"] is None
    assert status["error"] == "unmapped"


def test_states_default_high(relay: RelayController) -> None:
    assert relay.get_gpio_states() == {"locker_1": "HIGH", "locker_2": "HIGH"}


def test_status_tracks_last_open_and_returns_high(relay: RelayController) -> None:
    assert relay.get_locker_status("locker_1")["last_open_at"] is None
    relay.open_locker("locker_1", duration_ms=10)
    status = relay.get_locker_status("locker_1")
    assert status["gpio_state"] == "HIGH"  # fail-secure : retour HIGH
    assert isinstance(status["last_open_at"], int)
    assert status["error"] is None


def test_duration_ms_controls_pulse_length(
    relay: RelayController, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """La durée du pulse simulé suit duration_ms (borné par le timeout)."""
    captured: dict[str, float] = {}
    real_sleep = time.sleep

    def spy_sleep(seconds: float) -> None:
        captured["slept"] = seconds
        real_sleep(0)  # ne bloque pas vraiment le test

    monkeypatch.setattr(mod.time, "sleep", spy_sleep)
    relay.open_locker("locker_1", duration_ms=200)
    assert captured["slept"] == pytest.approx(0.2)


def test_cleanup_noop_in_mock_mode(relay: RelayController) -> None:
    # Ne doit pas lever quand RPi.GPIO est absent.
    relay.cleanup()


# ─── Chemin réel : thread + watchdog (GPIO forcé présent) ───────────────────


def _install_fake_gpio(monkeypatch: pytest.MonkeyPatch, **output_kw: object) -> MagicMock:
    monkeypatch.setattr(mod, "_GPIO_AVAILABLE", True)
    stub = MagicMock()
    stub.BCM = "BCM"
    stub.OUT = "OUT"
    stub.LOW = 0
    stub.HIGH = 1
    stub.output = MagicMock(**output_kw)
    monkeypatch.setattr(mod, "GPIO", stub)
    return stub


def test_real_pulse_drives_low_then_high(monkeypatch: pytest.MonkeyPatch) -> None:
    stub = _install_fake_gpio(monkeypatch)
    relay = RelayController({"locker_1": 17})
    assert relay.open_locker("locker_1", duration_ms=1) is True
    # setup() a mis la broche en OUT/HIGH, puis le pulse a fait LOW puis HIGH.
    calls = [c.args for c in stub.output.call_args_list]
    assert (17, 0) in calls  # LOW
    assert (17, 1) in calls  # HIGH


def test_real_pulse_timeout_forces_high_and_returns_false(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Si le pulse dépasse le watchdog, on abandonne, force HIGH, retourne False."""
    _install_fake_gpio(monkeypatch)
    relay = RelayController({"locker_1": 17})

    # duration_ms énorme + timeout minuscule → TimeoutError interne → retry → False.
    result = relay.open_locker("locker_1", duration_ms=5000, timeout_s=0.05)
    assert result is False
    status = relay.get_locker_status("locker_1")
    assert "exceeded" in (status["error"] or "")
    assert status["gpio_state"] == "HIGH"


def test_real_pulse_propagates_output_error_then_retries(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Si GPIO.output lève, l'erreur est capturée, HIGH forcé, retry idempotent."""
    _install_fake_gpio(monkeypatch, side_effect=OSError("ioctl_failed"))
    relay = RelayController({"locker_1": 17})
    assert relay.open_locker("locker_1", duration_ms=1) is False
    status = relay.get_locker_status("locker_1")
    assert "ioctl_failed" in (status["error"] or "")


def test_real_pulse_retry_succeeds_on_second_attempt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_fake_gpio(monkeypatch)
    relay = RelayController({"locker_1": 17})

    calls = {"n": 0}
    orig = relay._run_pulse_with_timeout

    def flaky(pin: int, timeout_s: float, pulse_seconds: float) -> None:
        calls["n"] += 1
        if calls["n"] == 1:
            raise OSError("gpio_busy")
        orig(pin, timeout_s, pulse_seconds)

    monkeypatch.setattr(relay, "_run_pulse_with_timeout", flaky)
    assert relay.open_locker("locker_1", duration_ms=1) is True
    assert calls["n"] == 2


def test_real_cleanup_calls_gpio_cleanup(monkeypatch: pytest.MonkeyPatch) -> None:
    stub = _install_fake_gpio(monkeypatch)
    relay = RelayController({"locker_1": 17})
    relay.cleanup()
    stub.cleanup.assert_called_once()


def test_real_cleanup_swallows_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    stub = _install_fake_gpio(monkeypatch)
    stub.cleanup.side_effect = RuntimeError("already clean")
    relay = RelayController({"locker_1": 17})
    relay.cleanup()  # ne doit pas lever
