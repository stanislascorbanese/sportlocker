"""``python -m sportlocker_firmware`` → délègue à ``agent.run``.

Sentry est init AVANT l'import de ``agent`` pour que toute exception levée
pendant le bootstrap (chargement config, connexion MQTT, GPIO…) soit déjà
capturée. No-op si ``SENTRY_DSN`` absent.
"""
from .sentry_init import init_sentry

init_sentry()

from .agent import run  # noqa: E402  (init Sentry doit précéder)

if __name__ == "__main__":
    run()
