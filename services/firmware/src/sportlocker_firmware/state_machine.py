"""Machine à états du casier — miroir de l'enum SQL ``locker_state``.

Transitions autorisées :

    idle      → reserved          (réservation créée)
    reserved  → active             (QR scanné, casier ouvert, item retiré)
    reserved  → idle               (réservation expirée ou annulée avant ouverture)
    active    → returning          (item rendu, porte refermée, attente check RFID)
    returning → idle               (RFID vérifié → casier remis à disposition)
    returning → fault              (RFID inconnu / mismatch → quarantaine)
    *         → fault              (panne matérielle signalée par le firmware)
    fault     → idle               (intervention maintenance résolue)

Toute transition non listée lève ``InvalidTransitionError``. Le firmware
publie les transitions sur MQTT ; l'API tient la table SQL pour vérité.
"""
from __future__ import annotations

from enum import StrEnum


class LockerState(StrEnum):
    IDLE = "idle"
    RESERVED = "reserved"
    ACTIVE = "active"
    RETURNING = "returning"
    FAULT = "fault"


_ALLOWED: dict[LockerState, frozenset[LockerState]] = {
    LockerState.IDLE: frozenset({LockerState.RESERVED, LockerState.FAULT}),
    LockerState.RESERVED: frozenset({LockerState.ACTIVE, LockerState.IDLE, LockerState.FAULT}),
    LockerState.ACTIVE: frozenset({LockerState.RETURNING, LockerState.FAULT}),
    LockerState.RETURNING: frozenset({LockerState.IDLE, LockerState.FAULT}),
    LockerState.FAULT: frozenset({LockerState.IDLE}),
}


class InvalidTransitionError(ValueError):
    """Levée quand on tente une transition non autorisée par la machine."""

    def __init__(self, frm: LockerState, to: LockerState) -> None:
        super().__init__(f"invalid transition {frm.value} → {to.value}")
        self.frm = frm
        self.to = to


def can_transition(frm: LockerState, to: LockerState) -> bool:
    """True si la transition est autorisée. ``frm == to`` est toujours toléré (no-op)."""
    if frm is to:
        return True
    return to in _ALLOWED.get(frm, frozenset())


def assert_transition(frm: LockerState, to: LockerState) -> None:
    """Lève ``InvalidTransitionError`` si la transition est interdite."""
    if not can_transition(frm, to):
        raise InvalidTransitionError(frm, to)


class LockerStateMachine:
    """Wrapper objet pour piloter un casier — utile pour les tests d'orchestration."""

    def __init__(self, initial: LockerState = LockerState.IDLE) -> None:
        self._state = initial

    @property
    def state(self) -> LockerState:
        return self._state

    def transition(self, to: LockerState) -> LockerState:
        assert_transition(self._state, to)
        self._state = to
        return self._state

    def reset_from_fault(self) -> LockerState:
        return self.transition(LockerState.IDLE)
