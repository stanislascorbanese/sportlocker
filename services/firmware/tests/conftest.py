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

# Stub picamera2 (caméra Pi v3) — libcamera n'existe pas sur macOS/CI.
# ``qr_reader`` fait ``from picamera2 import Picamera2`` : on expose un
# attribut Picamera2 mockable. Les tests le patchent au niveau de qr_reader.
_picamera2_pkg = MagicMock(name="picamera2_stub")
_picamera2_pkg.Picamera2 = MagicMock(name="Picamera2_stub")
sys.modules.setdefault("picamera2", _picamera2_pkg)

# Stub des libs matérielles NFC/GPIO (présentes seulement sur le Pi).
sys.modules.setdefault("board", MagicMock(name="board_stub"))
sys.modules.setdefault("busio", MagicMock(name="busio_stub"))
_pn532_pkg = MagicMock(name="adafruit_pn532_pkg_stub")
sys.modules.setdefault("adafruit_pn532", _pn532_pkg)
sys.modules.setdefault("adafruit_pn532.i2c", MagicMock(name="adafruit_pn532_i2c_stub"))


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
