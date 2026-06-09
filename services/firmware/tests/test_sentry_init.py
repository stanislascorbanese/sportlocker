"""Tests de ``init_sentry`` — init Sentry conditionnel à ``SENTRY_DSN``.

Couvre les 3 chemins :
    - DSN absent / vide → skip (aucun init, mode dev/test par défaut) ;
    - DSN présent + sentry_sdk dispo → init avec env + sample rate ;
    - DSN présent mais sentry_sdk non importable → warning + continue (pas de crash).

``sentry_sdk`` est injecté dans ``sys.modules`` (l'import est lazy dans la
fonction), donc aucune dépendance réelle au SDK n'est requise.
"""
from __future__ import annotations

import logging
import sys
from unittest.mock import MagicMock

from sportlocker_firmware.sentry_init import init_sentry


def test_no_dsn_skips_init(monkeypatch):
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    fake = MagicMock(name="sentry_sdk")
    monkeypatch.setitem(sys.modules, "sentry_sdk", fake)
    init_sentry()
    fake.init.assert_not_called()


def test_blank_dsn_skips_init(monkeypatch):
    # Espaces seuls → ``.strip()`` vide → skip.
    monkeypatch.setenv("SENTRY_DSN", "   ")
    fake = MagicMock(name="sentry_sdk")
    monkeypatch.setitem(sys.modules, "sentry_sdk", fake)
    init_sentry()
    fake.init.assert_not_called()


def test_dsn_set_initializes_with_defaults(monkeypatch):
    monkeypatch.setenv("SENTRY_DSN", "https://abc@o0.ingest.sentry.io/1")
    monkeypatch.delenv("SENTRY_ENVIRONMENT", raising=False)
    monkeypatch.delenv("SENTRY_TRACES_SAMPLE_RATE", raising=False)
    fake = MagicMock(name="sentry_sdk")
    monkeypatch.setitem(sys.modules, "sentry_sdk", fake)

    init_sentry()

    fake.init.assert_called_once()
    kwargs = fake.init.call_args.kwargs
    assert kwargs["dsn"] == "https://abc@o0.ingest.sentry.io/1"
    assert kwargs["environment"] == "production"
    assert kwargs["traces_sample_rate"] == 0.1


def test_dsn_set_respects_env_overrides(monkeypatch):
    monkeypatch.setenv("SENTRY_DSN", "https://abc@o0.ingest.sentry.io/1")
    monkeypatch.setenv("SENTRY_ENVIRONMENT", "staging")
    monkeypatch.setenv("SENTRY_TRACES_SAMPLE_RATE", "0.5")
    fake = MagicMock(name="sentry_sdk")
    monkeypatch.setitem(sys.modules, "sentry_sdk", fake)

    init_sentry()

    kwargs = fake.init.call_args.kwargs
    assert kwargs["environment"] == "staging"
    assert kwargs["traces_sample_rate"] == 0.5


def test_dsn_set_but_sdk_missing_logs_and_continues(monkeypatch, caplog):
    monkeypatch.setenv("SENTRY_DSN", "https://abc@o0.ingest.sentry.io/1")
    # sys.modules[name] = None → ``import sentry_sdk`` lève ImportError.
    monkeypatch.setitem(sys.modules, "sentry_sdk", None)

    with caplog.at_level(logging.WARNING):
        init_sentry()  # ne doit PAS crasher

    assert any("sentry_sdk not installed" in r.message for r in caplog.records)
