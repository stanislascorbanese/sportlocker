"""Tests QRReader — décodage + debounce, avec cv2/pyzbar mockés."""
from __future__ import annotations

import asyncio
import sys
from unittest.mock import MagicMock

import pytest

from sportlocker_firmware.qr_reader import DEDUP_WINDOW_SECONDS, QRReader


def _fake_pyzbar_code(data: str) -> MagicMock:
    code = MagicMock()
    code.data = data.encode("utf-8")
    return code


def test_qr_seen_forwards_to_controller(device_secret: str) -> None:
    controller = MagicMock()
    controller.handle_unlock.return_value = MagicMock(outcome=MagicMock(value="success"))
    reader = QRReader(mqtt=MagicMock(), controller=controller, device_secret=device_secret)

    reader._on_qr_seen("jwt-token-A")

    controller.handle_unlock.assert_called_once_with("jwt-token-A")


def test_debounce_dedupes_same_qr_within_window(device_secret: str) -> None:
    controller = MagicMock()
    controller.handle_unlock.return_value = MagicMock(outcome=MagicMock(value="success"))
    reader = QRReader(mqtt=MagicMock(), controller=controller, device_secret=device_secret)

    reader._on_qr_seen("jwt-token-A")
    reader._on_qr_seen("jwt-token-A")  # même QR immédiatement → ignoré
    reader._on_qr_seen("jwt-token-A")

    assert controller.handle_unlock.call_count == 1


def test_debounce_allows_different_qrs(device_secret: str) -> None:
    controller = MagicMock()
    controller.handle_unlock.return_value = MagicMock(outcome=MagicMock(value="success"))
    reader = QRReader(mqtt=MagicMock(), controller=controller, device_secret=device_secret)

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
    reader = QRReader(mqtt=MagicMock(), controller=controller, device_secret=device_secret)

    fake_time = [1000.0]
    monkeypatch.setattr(
        "sportlocker_firmware.qr_reader.time.monotonic", lambda: fake_time[0]
    )

    reader._on_qr_seen("jwt-A")
    fake_time[0] += DEDUP_WINDOW_SECONDS * 2  # avance le temps au-delà de la fenêtre
    reader._on_qr_seen("jwt-A")

    assert controller.handle_unlock.call_count == 2


def test_run_loop_decodes_frames_from_camera(
    device_secret: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """La boucle async lit la caméra, transmet les decodes au controller, puis sort."""
    controller = MagicMock()
    controller.handle_unlock.return_value = MagicMock(outcome=MagicMock(value="success"))

    # Mock cv2.VideoCapture pour renvoyer une frame une fois puis lever StopAsyncIteration.
    cap = MagicMock()
    cap.isOpened.return_value = True
    frames = [(True, "frame-1"), (True, "frame-1"), (False, None)]
    cap.read.side_effect = frames + [(False, None)] * 10
    cv2_mod = sys.modules["cv2"]
    monkeypatch.setattr(cv2_mod, "VideoCapture", MagicMock(return_value=cap))

    # pyzbar décode "JWT-X" sur la première frame, rien ensuite.
    pyzbar_mod = sys.modules["pyzbar.pyzbar"]
    monkeypatch.setattr(
        pyzbar_mod, "decode",
        MagicMock(side_effect=[[_fake_pyzbar_code("JWT-X")], [], []]),
    )

    reader = QRReader(mqtt=MagicMock(), controller=controller, device_secret=device_secret)

    async def runner() -> None:
        task = asyncio.create_task(reader.run())
        await asyncio.sleep(0.2)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    asyncio.run(runner())

    controller.handle_unlock.assert_any_call("JWT-X")
    cap.release.assert_called()


def test_run_fail_soft_when_camera_unavailable(
    device_secret: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Sans caméra (container sans /dev/video0, dev local…), run doit
    rester dormant sans crash et sans busy-loop — l'injection se fera
    via MQTT cmd/open côté agent."""
    controller = MagicMock()

    cap = MagicMock()
    cap.isOpened.return_value = False  # caméra absente
    cv2_mod = sys.modules["cv2"]
    monkeypatch.setattr(cv2_mod, "VideoCapture", MagicMock(return_value=cap))

    reader = QRReader(mqtt=MagicMock(), controller=controller, device_secret=device_secret)

    async def runner() -> None:
        task = asyncio.create_task(reader.run())
        await asyncio.sleep(0.1)
        # La task doit encore tourner (idle) — pas crashée ni terminée.
        assert not task.done()
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    asyncio.run(runner())

    # Le controller ne doit jamais être appelé sans frame.
    controller.handle_unlock.assert_not_called()


def test_run_fail_soft_when_videocapture_raises(
    device_secret: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Si cv2.VideoCapture lève (libs manquantes, perms…), même comportement
    fail-soft : on log et on dort, on ne crash pas l'agent."""
    controller = MagicMock()

    cv2_mod = sys.modules["cv2"]
    monkeypatch.setattr(
        cv2_mod, "VideoCapture", MagicMock(side_effect=RuntimeError("no v4l2"))
    )

    reader = QRReader(mqtt=MagicMock(), controller=controller, device_secret=device_secret)

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
