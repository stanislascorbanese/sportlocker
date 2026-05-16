"""Init Sentry pour l'agent firmware.

Appelé en TOUT premier depuis ``__main__.py`` (avant tout autre import du
package qui pourrait déclencher du code instrumenté).

Comportement :
    - Si ``SENTRY_DSN`` absent ou vide → ``sentry_sdk.init`` skip → SDK
      no-op, aucune télémétrie envoyée. C'est le mode par défaut, safe
      pour dev local et tests.
    - Si présent → init avec sampling perf 10%, environnement piloté par
      ``SENTRY_ENVIRONMENT`` (fallback ``production``).

Pas de dépendance dure : ``sentry_sdk`` est listé dans pyproject.toml +
requirements.txt, mais si l'import échoue (rare, env corrompu), on ne
crashe pas l'agent — on log et on continue.
"""
from __future__ import annotations

import logging
import os


def init_sentry() -> None:
    dsn = os.environ.get("SENTRY_DSN", "").strip()
    if not dsn:
        return

    try:
        import sentry_sdk
    except ImportError:
        logging.getLogger(__name__).warning(
            "SENTRY_DSN set but sentry_sdk not installed — skipping init"
        )
        return

    sentry_sdk.init(
        dsn=dsn,
        environment=os.environ.get("SENTRY_ENVIRONMENT", "production"),
        # 10% des transactions tracées (perf). À monter en cas de debug.
        traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
        # Le device_id est utile pour grouper les erreurs par distributeur
        # — Sentry le récupère via le tag set ci-dessous (cf. agent.py).
        # Ici on ne le set pas car config pas encore chargée à ce point.
    )
