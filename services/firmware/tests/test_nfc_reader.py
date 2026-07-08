"""Tests NFCReader — lecture PN532 I2C avec adafruit_pn532/board mockés."""
from __future__ import annotations

import asyncio
from unittest.mock import MagicMock

import pytest

from sportlocker_firmware import nfc_reader as nfc_mod
from sportlocker_firmware.nfc_reader import (
    NFCReader,
    NFCUnavailableError,
    _default_on_card,
)


def _fake_pn(uid: bytes | None = None, *, raises: Exception | None = None) -> MagicMock:
    pn = MagicMock()
    if raises is not None:
        pn.read_passive_target.side_effect = raises
    else:
        pn.read_passive_target.return_value = bytearray(uid) if uid is not None else None
    return pn


# ─── read_card ──────────────────────────────────────────────────────────────


def test_read_card_returns_uid_bytes() -> None:
    reader = NFCReader()
    reader._readers = [(0x24, _fake_pn(b"\x04\xab\xcd\xef"))]
    uid = reader.read_card()
    assert uid == b"\x04\xab\xcd\xef"
    assert isinstance(uid, bytes)


def test_read_card_returns_none_on_timeout() -> None:
    reader = NFCReader()
    reader._readers = [(0x24, _fake_pn(None))]
    assert reader.read_card() is None


def test_read_card_no_readers_returns_none() -> None:
    reader = NFCReader()
    assert reader.read_card() is None


def test_read_card_swallows_i2c_error_and_tries_next_module() -> None:
    """Une erreur I2C sur le 1er module ne crash pas : on tente le suivant."""
    good = _fake_pn(b"\x01\x02")
    reader = NFCReader()
    reader._readers = [
        (0x24, _fake_pn(raises=OSError("i2c glitch"))),
        (0x25, good),
    ]
    assert reader.read_card() == b"\x01\x02"


def test_read_card_all_modules_error_returns_none() -> None:
    reader = NFCReader()
    reader._readers = [(0x24, _fake_pn(raises=OSError("bus down")))]
    assert reader.read_card() is None


def test_read_card_uses_configured_timeout() -> None:
    pn = _fake_pn(None)
    reader = NFCReader()
    reader._readers = [(0x24, pn)]
    reader.read_card()
    pn.read_passive_target.assert_called_once_with(timeout=nfc_mod.NFC_READ_TIMEOUT_S)


# ─── _init_readers ──────────────────────────────────────────────────────────


def test_init_readers_raises_when_libs_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(nfc_mod, "_NFC_LIBS_AVAILABLE", False)
    reader = NFCReader()
    with pytest.raises(NFCUnavailableError):
        reader._init_readers()


def test_init_readers_two_modules_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(nfc_mod, "_NFC_LIBS_AVAILABLE", True)
    monkeypatch.setattr(nfc_mod, "board", MagicMock())
    monkeypatch.setattr(nfc_mod, "PN532_I2C", MagicMock(return_value=MagicMock()))
    reader = NFCReader(addresses=(0x24, 0x25))
    reader._init_readers()
    assert len(reader._readers) == 2


def test_init_readers_raises_when_no_module_answers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(nfc_mod, "_NFC_LIBS_AVAILABLE", True)
    monkeypatch.setattr(nfc_mod, "board", MagicMock())
    # Chaque instanciation PN532 lève → aucun module initialisé.
    monkeypatch.setattr(
        nfc_mod, "PN532_I2C", MagicMock(side_effect=OSError("no module")),
    )
    reader = NFCReader(addresses=(0x24,))
    with pytest.raises(NFCUnavailableError):
        reader._init_readers()


def test_init_readers_raises_when_i2c_bus_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(nfc_mod, "_NFC_LIBS_AVAILABLE", True)
    bad_board = MagicMock()
    bad_board.I2C.side_effect = RuntimeError("i2c not enabled")
    monkeypatch.setattr(nfc_mod, "board", bad_board)
    reader = NFCReader()
    with pytest.raises(NFCUnavailableError):
        reader._init_readers()


# ─── run() ──────────────────────────────────────────────────────────────────


def test_run_fail_soft_when_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(nfc_mod, "_NFC_LIBS_AVAILABLE", False)
    reader = NFCReader()

    async def runner() -> None:
        task = asyncio.create_task(reader.run())
        await asyncio.sleep(0.05)
        assert not task.done()  # idle, pas crashée
        assert reader.nfc_ok is False
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    asyncio.run(runner())


def test_run_dispatches_callback_on_card(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[bytes] = []
    reader = NFCReader(on_card=seen.append)
    pn = _fake_pn(b"\xde\xad\xbe\xef")

    monkeypatch.setattr(
        reader, "_init_readers", lambda: reader._readers.append((0x24, pn)),
    )

    async def runner() -> None:
        task = asyncio.create_task(reader.run(poll_interval_s=0.01))
        await asyncio.sleep(0.1)
        assert reader.nfc_ok is True
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    asyncio.run(runner())
    assert seen  # au moins une lecture dispatchée
    assert seen[0] == b"\xde\xad\xbe\xef"
    assert reader.nfc_ok is False  # remis à False à la sortie


# ─── dispatch / dedup ───────────────────────────────────────────────────────


def test_dispatch_dedupes_same_uid_within_window(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[bytes] = []
    reader = NFCReader(on_card=calls.append)
    t = [1000.0]
    monkeypatch.setattr(nfc_mod.time, "monotonic", lambda: t[0])

    reader._dispatch(b"\x01\x02")
    reader._dispatch(b"\x01\x02")  # immédiat → dédupliqué
    assert len(calls) == 1

    t[0] += nfc_mod.NFC_DEDUP_WINDOW_S * 2  # au-delà de la fenêtre
    reader._dispatch(b"\x01\x02")
    assert len(calls) == 2


def test_dispatch_swallows_callback_error() -> None:
    def boom(_uid: bytes) -> None:
        raise RuntimeError("handler exploded")

    reader = NFCReader(on_card=boom)
    reader._dispatch(b"\x09")  # ne doit pas lever


def test_default_on_card_logs_without_raising() -> None:
    _default_on_card(b"\x04\x01\x02\x03")  # smoke : ne lève pas
