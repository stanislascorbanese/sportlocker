"""Anti-replay JWT — persiste les ``jti`` déjà consommés dans SQLite.

Rétention : 24 h (le JWT vit 15 min, donc largement la marge). La purge
est appelée explicitement par le controller à intervalle régulier, ou
manuellement via ``purge_expired``.

Sécurité thread : la connexion ``sqlite3`` est partagée entre threads
(``check_same_thread=False``) et toutes les écritures passent par un
``threading.Lock`` interne — la lib paho-mqtt déclenche des callbacks
sur son propre thread, donc l'orchestrateur peut accéder au store
depuis plusieurs threads.
"""
from __future__ import annotations

import sqlite3
import threading
import time
from pathlib import Path

import structlog

log = structlog.get_logger(__name__)

DEFAULT_RETENTION_SECONDS = 24 * 3600


class NonceStore:
    def __init__(
        self,
        db_path: str,
        *,
        retention_seconds: int = DEFAULT_RETENTION_SECONDS,
    ) -> None:
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._db_path = db_path
        self._retention = retention_seconds
        self._lock = threading.Lock()
        self._db = sqlite3.connect(db_path, check_same_thread=False, isolation_level=None)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._setup()

    def _setup(self) -> None:
        with self._lock:
            self._db.executescript(
                """
                CREATE TABLE IF NOT EXISTS used_nonces (
                    jti TEXT PRIMARY KEY,
                    used_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_used_nonces_used_at
                    ON used_nonces(used_at);
                """
            )

    def seen(self, jti: str) -> bool:
        """True si ce ``jti`` a déjà été consommé."""
        with self._lock:
            row = self._db.execute(
                "SELECT 1 FROM used_nonces WHERE jti = ?", (jti,)
            ).fetchone()
        return row is not None

    def register(self, jti: str, *, now: int | None = None) -> bool:
        """Marque le ``jti`` comme consommé. Renvoie False si déjà présent (race)."""
        ts = int(time.time()) if now is None else now
        try:
            with self._lock:
                self._db.execute(
                    "INSERT INTO used_nonces(jti, used_at) VALUES (?, ?)",
                    (jti, ts),
                )
            return True
        except sqlite3.IntegrityError:
            return False

    def purge_expired(self, *, now: int | None = None) -> int:
        """Supprime les nonces plus vieux que ``retention_seconds``. Renvoie le nb purgé."""
        cutoff = (int(time.time()) if now is None else now) - self._retention
        try:
            with self._lock:
                cur = self._db.execute(
                    "DELETE FROM used_nonces WHERE used_at < ?", (cutoff,)
                )
                return cur.rowcount
        except sqlite3.Error as exc:
            log.warning("nonce_purge_failed", err=str(exc))
            return 0

    def count(self) -> int:
        with self._lock:
            row = self._db.execute("SELECT COUNT(*) FROM used_nonces").fetchone()
        return int(row[0]) if row else 0

    def close(self) -> None:
        with self._lock:
            self._db.close()
