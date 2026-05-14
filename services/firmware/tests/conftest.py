"""Fixtures partagées + stubs des modules natifs absents en CI.

``cv2`` (opencv-python) et ``pyzbar`` sont mockés au niveau ``sys.modules``
AVANT que ``qr_reader`` ne soit importé, parce que ces deux libs imposent
des binaires natifs (libzbar, ffmpeg…) qu'on ne veut pas installer en CI
quand on cible juste les tests logiques.
"""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock

# Le package vit sous src/ : on ajoute src/ au sys.path pour permettre
# ``import sportlocker_firmware`` sans nécessiter une install pip locale.
SRC = Path(__file__).resolve().parents[1] / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))


# Stub opencv + pyzbar (manipulés via patch dans test_qr_reader).
sys.modules.setdefault("cv2", MagicMock(name="cv2_stub"))

_pyzbar_pkg = MagicMock(name="pyzbar_pkg_stub")
_pyzbar_mod = MagicMock(name="pyzbar_mod_stub")
_pyzbar_pkg.pyzbar = _pyzbar_mod
sys.modules.setdefault("pyzbar", _pyzbar_pkg)
sys.modules.setdefault("pyzbar.pyzbar", _pyzbar_mod)


import pytest  # noqa: E402


@pytest.fixture
def tmp_db_path(tmp_path: Path) -> str:
    return str(tmp_path / "agent.db")


@pytest.fixture
def device_secret() -> str:
    return "test-secret-do-not-use-in-prod"


@pytest.fixture
def device_id() -> str:
    return "dist-abc-123"


@pytest.fixture
def locker_id() -> str:
    return "locker-uuid-1"


@pytest.fixture
def reservation_id() -> str:
    return "reservation-uuid-1"
