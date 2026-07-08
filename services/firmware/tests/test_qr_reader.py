"""Tests QRReader — décodage picamera2 + debounce, avec picamera2/pyzbar mockés."""
from __future__ import annotations

import asyncio
import sys
from unittest.mock import MagicMock

import pytest

from sportlocker_firmware import qr_reader as qr_mod
from sportlocker_firmware.qr_reader import DEDUP_WINDOW_SECONDS, CameraNotFoundError, QRReader


def _fake_pyzbar_code(data: str) -> MagicMock:
    code = MagicMock()
    code.data = data.encode("utf-8")
    return code


def _reader(controller: MagicMock, secret: str) -> QRReader:
    return QRReader(mqtt=MagicMock(), controller=controller, device_secret=secret)


# ─── Debounce / forwarding ──────────────────────────────────────────────────


def test_qr_seen_forwards_to_controller(device_secret: str) -> None:
    controller = MagicMock()
    controller.handle_unlock.return_value = MagicMock(outcome=MagicMock(value="success"))
    reader = _reader(controller, device_secret)

    reader._on_qr_seen("jwt-token-A")

    controller.handle_unlock.assert_called_once_with("jwt-token-A")


def test_debounce_dedupes_same_qr_within_window(device_secret: str) -> None:
    controller = MagicMock()
    controller.handle_unlock.return_value = MagicMock(outcome=MagicMock(value="success"))
    reader = _reader(controller, device_secret)

    reader._on_qr_seen("jwt-token-A")
    reader._on_qr_seen("jwt-token-A")  # même QR immédiatement → ignoré
    reader._on_qr_seen("jwt-token-A")

    assert controller.handle_unlock.call_count == 1


def test_debounce_allows_different_qrs(device_secret: str) -> None:
    controller = MagicMock()
    controller.handle_unlock.return_value = MagicMock(outcome=MagicMock(value="success"))
    reader = _reader(controller, device_secret)

    reader._on_qr_seen("jwt-A")
    reader._on_qr_seen("jwt-B")
    reader._on_qr_seen("jwt-C")

    assert controller.handle_unlock.call_count == 3


def test_debounce_allows_same_qr_after_window(
    device_secret: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Après la fenêtre de dedup, le même QR doit re-déclencher l'appel."""
    controller = MagicMock()
    controller.handle_unlock.return_value = MagicMock(outcome=MagicMock(value="success"))
    reader = _reader(controller, device_secret)

    fake_time = [1000.0]
    monkeypatch.setattr(
        "sportlocker_firmware.qr_reader.time.monotonic", lambda: fake_time[0]
    )

    reader._on_qr_seen("jwt-A")
    fake_time[0] += DEDUP_WINDOW_SECONDS * 2  # avance le temps au-delà de la fenêtre
    reader._on_qr_seen("jwt-A")

    assert controller.handle_unlock.call_count == 2


# ─── Boucle run() sur picamera2 ─────────────────────────────────────────────


def _fake_camera(frames: list[object]) -> MagicMock:
    """Faux Picamera2 : capture_array renvoie une frame par appel puis répète."""
    cam = MagicMock()
    seq = list(frames)

    def _capture() -> object:
        return seq.pop(0) if seq else "empty-frame"

    cam.capture_array.side_effect = _capture
    return cam


def test_run_loop_decodes_frames_from_camera(
    device_secret: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """La boucle async lit la caméra, transmet les decodes au controller."""
    controller = MagicMock()
    controller.handle_unlock.return_value = MagicMock(outcome=MagicMock(value="success"))

    cam = _fake_camera(["frame-1", "frame-2"])
    fake_picam2_cls = MagicMock(return_value=cam)
    monkeypatch.setattr(qr_mod, "Picamera2", fake_picam2_cls)

    # pyzbar décode "JWT-X" sur la première frame vue, rien ensuite (boucle
    # infinie côté run → le mock doit rester appelable indéfiniment).
    decoded_once = {"done": False}

    def fake_decode(_frame: object) -> list[MagicMock]:
        if decoded_once["done"]:
            return []
        decoded_once["done"] = True
        return [_fake_pyzbar_code("JWT-X")]

    pyzbar_mod = sys.modules["pyzbar.pyzbar"]
    monkeypatch.setattr(pyzbar_mod, "decode", fake_decode)

    reader = _reader(controller, device_secret)

    async def runner() -> None:
        task = asyncio.create_task(reader.run())
        await asyncio.sleep(0.2)
        assert reader.camera_ok is True
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    asyncio.run(runner())

    controller.handle_unlock.assert_any_call("JWT-X")
    cam.stop.assert_called()
    cam.close.assert_called()
    assert reader.camera_ok is False


def test_run_ignores_invalid_frame_without_qr(
    device_secret: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Une frame sans QR (pyzbar renvoie []) ne déclenche aucun unlock."""
    controller = MagicMock()
    cam = _fake_camera(["blurry-frame"])
    monkeypatch.setattr(qr_mod, "Picamera2", MagicMock(return_value=cam))

    pyzbar_mod = sys.modules["pyzbar.pyzbar"]
    monkeypatch.setattr(pyzbar_mod, "decode", MagicMock(return_value=[]))

    reader = _reader(controller, device_secret)

    async def runner() -> None:
        task = asyncio.create_task(reader.run())
        await asyncio.sleep(0.1)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    asyncio.run(runner())
    controller.handle_unlock.assert_not_called()


def test_run_fail_soft_when_picamera2_absent(
    device_secret: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Sans picamera2 (dev macOS, container sans libcamera), run reste dormant
    sans crash ni busy-loop — l'injection se fait via MQTT cmd/open."""
    controller = MagicMock()
    monkeypatch.setattr(qr_mod, "Picamera2", None)

    reader = _reader(controller, device_secret)

    async def runner() -> None:
        task = asyncio.create_task(reader.run())
        await asyncio.sleep(0.1)
        assert not task.done()  # idle, pas crashée
        assert reader.camera_ok is False
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    asyncio.run(runner())
    controller.handle_unlock.assert_not_called()


def test_run_fail_soft_when_camera_init_raises(
    device_secret: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Si l'init picamera2 lève (CSI absent, perms…), même comportement
    fail-soft : on log et on dort, on ne crash pas l'agent."""
    controller = MagicMock()
    monkeypatch.setattr(
        qr_mod, "Picamera2", MagicMock(side_effect=RuntimeError("no camera")),
    )

    reader = _reader(controller, device_secret)

    async def runner() -> None:
        task = asyncio.create_task(reader.run())
        await asyncio.sleep(0.05)
        assert not task.done()
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    asyncio.run(runner())
    controller.handle_unlock.assert_not_called()


def test_open_camera_raises_camera_not_found_when_absent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(qr_mod, "Picamera2", None)
    with pytest.raises(CameraNotFoundError):
        QRReader._open_camera()
