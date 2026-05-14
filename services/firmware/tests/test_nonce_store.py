"""Tests anti-replay SQLite — register, seen, purge, concurrence."""
from __future__ import annotations

import threading
import time

from sportlocker_firmware.nonce_store import NonceStore


def test_register_new_nonce_returns_true(tmp_db_path: str) -> None:
    store = NonceStore(tmp_db_path)
    assert store.register("jti-1") is True
    assert store.count() == 1
    store.close()


def test_seen_returns_true_after_register(tmp_db_path: str) -> None:
    store = NonceStore(tmp_db_path)
    assert store.seen("jti-1") is False
    store.register("jti-1")
    assert store.seen("jti-1") is True
    store.close()


def test_register_duplicate_returns_false(tmp_db_path: str) -> None:
    store = NonceStore(tmp_db_path)
    assert store.register("jti-1") is True
    assert store.register("jti-1") is False
    assert store.count() == 1
    store.close()


def test_purge_removes_old_nonces(tmp_db_path: str) -> None:
    store = NonceStore(tmp_db_path, retention_seconds=60)
    now = int(time.time())
    # Insère deux nonces, l'un vieux d'1h, l'autre frais.
    store.register("old", now=now - 3600)
    store.register("fresh", now=now)
    purged = store.purge_expired(now=now)
    assert purged == 1
    assert store.seen("old") is False
    assert store.seen("fresh") is True
    store.close()


def test_purge_keeps_fresh_nonces(tmp_db_path: str) -> None:
    store = NonceStore(tmp_db_path, retention_seconds=3600)
    now = int(time.time())
    for i in range(5):
        store.register(f"jti-{i}", now=now)
    purged = store.purge_expired(now=now)
    assert purged == 0
    assert store.count() == 5
    store.close()


def test_concurrent_registers_only_one_wins(tmp_db_path: str) -> None:
    """Plusieurs threads tentent d'enregistrer le MÊME jti — un seul doit gagner."""
    store = NonceStore(tmp_db_path)
    results: list[bool] = []
    barrier = threading.Barrier(8)

    def worker() -> None:
        barrier.wait()
        results.append(store.register("shared-jti"))

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert results.count(True) == 1
    assert results.count(False) == 7
    assert store.count() == 1
    store.close()


def test_store_persists_across_instances(tmp_db_path: str) -> None:
    """Si l'agent redémarre, les nonces déjà consommés doivent rester."""
    s1 = NonceStore(tmp_db_path)
    s1.register("jti-persist")
    s1.close()

    s2 = NonceStore(tmp_db_path)
    assert s2.seen("jti-persist") is True
    s2.close()
