"""Tests machine à états casier — toutes les transitions valides + interdites."""
from __future__ import annotations

import pytest

from sportlocker_firmware.state_machine import (
    InvalidTransitionError,
    LockerState,
    LockerStateMachine,
    assert_transition,
    can_transition,
)

# ─── Transitions valides ────────────────────────────────────────────────────

class TestValidTransitions:
    def test_idle_to_reserved(self) -> None:
        assert can_transition(LockerState.IDLE, LockerState.RESERVED)

    def test_reserved_to_active(self) -> None:
        assert can_transition(LockerState.RESERVED, LockerState.ACTIVE)

    def test_reserved_to_idle_on_expire(self) -> None:
        # Expiration ou annulation avant ouverture.
        assert can_transition(LockerState.RESERVED, LockerState.IDLE)

    def test_active_to_returning(self) -> None:
        assert can_transition(LockerState.ACTIVE, LockerState.RETURNING)

    def test_returning_to_idle(self) -> None:
        assert can_transition(LockerState.RETURNING, LockerState.IDLE)

    def test_returning_to_fault_on_rfid_mismatch(self) -> None:
        assert can_transition(LockerState.RETURNING, LockerState.FAULT)

    def test_any_state_can_go_fault(self) -> None:
        non_fault = (
            LockerState.IDLE,
            LockerState.RESERVED,
            LockerState.ACTIVE,
            LockerState.RETURNING,
        )
        for s in non_fault:
            assert can_transition(s, LockerState.FAULT), f"{s} → fault must be allowed"

    def test_fault_to_idle_after_maintenance(self) -> None:
        assert can_transition(LockerState.FAULT, LockerState.IDLE)

    def test_self_transition_is_noop_allowed(self) -> None:
        for s in LockerState:
            assert can_transition(s, s), f"self-transition {s} must be a no-op"


# ─── Transitions invalides ──────────────────────────────────────────────────

class TestInvalidTransitions:
    def test_idle_to_active_forbidden(self) -> None:
        assert not can_transition(LockerState.IDLE, LockerState.ACTIVE)

    def test_idle_to_returning_forbidden(self) -> None:
        assert not can_transition(LockerState.IDLE, LockerState.RETURNING)

    def test_reserved_to_returning_forbidden(self) -> None:
        # On ne peut pas rendre un item qu'on n'a jamais retiré.
        assert not can_transition(LockerState.RESERVED, LockerState.RETURNING)

    def test_active_to_idle_forbidden(self) -> None:
        # Sortir d'active doit passer par returning.
        assert not can_transition(LockerState.ACTIVE, LockerState.IDLE)

    def test_active_to_reserved_forbidden(self) -> None:
        assert not can_transition(LockerState.ACTIVE, LockerState.RESERVED)

    def test_returning_to_active_forbidden(self) -> None:
        assert not can_transition(LockerState.RETURNING, LockerState.ACTIVE)

    def test_fault_to_active_forbidden(self) -> None:
        # Sortie de fault → idle uniquement (passage explicite par maintenance).
        assert not can_transition(LockerState.FAULT, LockerState.ACTIVE)


# ─── Wrapper LockerStateMachine ─────────────────────────────────────────────

class TestLockerStateMachine:
    def test_default_initial_is_idle(self) -> None:
        sm = LockerStateMachine()
        assert sm.state is LockerState.IDLE

    def test_custom_initial(self) -> None:
        sm = LockerStateMachine(LockerState.RESERVED)
        assert sm.state is LockerState.RESERVED

    def test_happy_path_full_loop(self) -> None:
        sm = LockerStateMachine()
        sm.transition(LockerState.RESERVED)
        sm.transition(LockerState.ACTIVE)
        sm.transition(LockerState.RETURNING)
        sm.transition(LockerState.IDLE)
        assert sm.state is LockerState.IDLE

    def test_transition_raises_on_invalid(self) -> None:
        sm = LockerStateMachine()
        with pytest.raises(InvalidTransitionError) as exc_info:
            sm.transition(LockerState.ACTIVE)
        assert exc_info.value.frm is LockerState.IDLE
        assert exc_info.value.to is LockerState.ACTIVE
        assert "idle → active" in str(exc_info.value)
        # L'état NE doit PAS avoir bougé après échec.
        assert sm.state is LockerState.IDLE

    def test_reset_from_fault(self) -> None:
        sm = LockerStateMachine(LockerState.FAULT)
        sm.reset_from_fault()
        assert sm.state is LockerState.IDLE

    def test_assert_transition_helper(self) -> None:
        assert_transition(LockerState.IDLE, LockerState.RESERVED)  # noop
        with pytest.raises(InvalidTransitionError):
            assert_transition(LockerState.IDLE, LockerState.ACTIVE)
