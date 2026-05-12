"""Contrôleur des casiers physiques — vérification QR + actionnement GPIO.

Sécurité critique :
  - Vérification JWT HS256 strictement offline (clé partagée avec l'API).
  - Anti-replay via cache local SQLite (rétention 24 h, purge automatique).
  - Fail-secure GPIO : pin HIGH par défaut, pulse LOW seulement à l'ouverture.
  - Tout événement door_unlocked publié MQTT est signé HMAC-SHA256 pour
    permettre au backend de détecter un message forgé en cas de fuite du
    canal MQTT.

Tolérance offline :
  - Le JWT est auto-suffisant (signature + jti + claims). Si la connexion MQTT
    tombe, on ouvre quand même et on persiste l'event dans `pending_events`
    pour re-publication au retour réseau.
  - Un cache local `reservation_cache` est synchronisé via MQTT en mode online ;
    en mode dégradé il sert à vérifier que la réservation n'a pas été annulée
    côté backend avant d'ouvrir.

Logging : structlog. Le renderer JSON doit être configuré au démarrage de
l'application via :
    structlog.configure(processors=[..., structlog.processors.JSONRenderer()])
"""
from __future__ import annotations

import hashlib
import hmac
import json
import sqlite3
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Iterator

import structlog
from jose import JWTError, jwt

from .mqtt_client import MQTTClient

log = structlog.get_logger(__name__)

# Constantes — doivent matcher services/api/src/lib/jwt-device.ts
JWT_ISSUER = "sportlocker.app"
JWT_AUDIENCE = "sportlocker.device"
JWT_ALGORITHM = "HS256"

# Pulse de la gâche électromagnétique : ~500 ms.
GPIO_PULSE_SECONDS = 0.5

# Rétention nonces locaux : 24 h (le JWT n'est valide que 15 min, marge confortable).
NONCE_RETENTION_SECONDS = 24 * 3600

# Import GPIO conditionnel — la lib RPi.GPIO ne s'installe que sur Pi.
try:
    import RPi.GPIO as GPIO  # type: ignore[import]

    _GPIO_AVAILABLE = True
except (ImportError, RuntimeError):
    GPIO = None  # type: ignore[assignment]
    _GPIO_AVAILABLE = False


class UnlockOutcome(str, Enum):
    SUCCESS = "success"
    INVALID_TOKEN = "invalid_token"
    REPLAY = "replay"
    EXPIRED = "expired"
    UNKNOWN_LOCKER = "unknown_locker"
    LOCKER_MISMATCH = "locker_mismatch"
    HARDWARE_FAULT = "hardware_fault"
    CACHE_MISS_OFFLINE = "cache_miss_offline"
    INTERNAL_ERROR = "internal_error"


@dataclass(frozen=True)
class UnlockResult:
    outcome: UnlockOutcome
    reservation_id: str | None = None
    locker_id: str | None = None
    detail: str | None = None

    @property
    def ok(self) -> bool:
        return self.outcome is UnlockOutcome.SUCCESS


class LockerController:
    """Orchestre JWT + anti-replay + GPIO + MQTT pour l'ouverture casier."""

    def __init__(
        self,
        *,
        mqtt: MQTTClient,
        device_id: str,
        device_secret: str,
        gpio_mapping: dict[str, int],
        db_path: str = "/var/lib/sportlocker/agent.db",
    ) -> None:
        self._mqtt = mqtt
        self._device_id = device_id
        self._device_secret = device_secret
        self._gpio_mapping = dict(gpio_mapping)
        self._db_path = db_path
        self._db_lock = threading.Lock()  # sqlite3.Connection partagée entre threads

        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(db_path, check_same_thread=False, isolation_level=None)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._setup_db()
        self._setup_gpio()

        log.info(
            "locker_controller_ready",
            device_id=device_id,
            gpio_available=_GPIO_AVAILABLE,
            mapped_lockers=len(self._gpio_mapping),
            db_path=db_path,
        )

    # ─── Schéma SQLite ─────────────────────────────────────────────────────

    def _setup_db(self) -> None:
        with self._db_lock:
            self._db.executescript(
                """
                CREATE TABLE IF NOT EXISTS used_nonces (
                    jti TEXT PRIMARY KEY,
                    used_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_used_nonces_used_at ON used_nonces(used_at);

                CREATE TABLE IF NOT EXISTS reservation_cache (
                    reservation_id TEXT PRIMARY KEY,
                    locker_id TEXT NOT NULL,
                    item_id TEXT,
                    expires_at INTEGER NOT NULL,
                    cached_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS pending_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    topic TEXT NOT NULL,
                    envelope_json TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                );
                """
            )

    # ─── GPIO ──────────────────────────────────────────────────────────────

    def _setup_gpio(self) -> None:
        if not _GPIO_AVAILABLE:
            log.warning("gpio_unavailable_dev_mode")
            return
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        for pin in self._gpio_mapping.values():
            # HIGH au repos = casier verrouillé (fail-secure : un boot ne libère rien).
            GPIO.setup(pin, GPIO.OUT, initial=GPIO.HIGH)

    def _pulse_open(self, locker_id: str) -> bool:
        pin = self._gpio_mapping.get(locker_id)
        if pin is None:
            log.error("gpio_pin_not_mapped", locker_id=locker_id)
            return False
        try:
            if _GPIO_AVAILABLE:
                GPIO.output(pin, GPIO.LOW)  # ouvert
                time.sleep(GPIO_PULSE_SECONDS)
                GPIO.output(pin, GPIO.HIGH)  # re-verrouillé
            else:
                log.info("gpio_pulse_simulated", locker_id=locker_id, pin=pin)
            return True
        except Exception as exc:  # noqa: BLE001 — on log et on remonte un booléen
            log.exception("gpio_pulse_failed", locker_id=locker_id, pin=pin, err=str(exc))
            return False

    # ─── Anti-replay (SQLite) ──────────────────────────────────────────────

    def _seen_nonce(self, jti: str) -> bool:
        with self._db_lock:
            cur = self._db.execute("SELECT 1 FROM used_nonces WHERE jti = ?", (jti,))
            return cur.fetchone() is not None

    def _register_nonce(self, jti: str) -> bool:
        """Insère le nonce ; renvoie False si déjà présent (collision concurrente)."""
        try:
            with self._db_lock:
                self._db.execute(
                    "INSERT INTO used_nonces(jti, used_at) VALUES (?, ?)",
                    (jti, int(time.time())),
                )
            return True
        except sqlite3.IntegrityError:
            return False

    def _purge_old_nonces(self) -> None:
        cutoff = int(time.time()) - NONCE_RETENTION_SECONDS
        try:
            with self._db_lock:
                self._db.execute("DELETE FROM used_nonces WHERE used_at < ?", (cutoff,))
        except sqlite3.Error as exc:
            log.warning("nonce_purge_failed", err=str(exc))

    # ─── Cache réservations ────────────────────────────────────────────────

    def upsert_reservation(
        self,
        reservation_id: str,
        locker_id: str,
        expires_at: int,
        item_id: str | None = None,
    ) -> None:
        """À brancher sur le handler MQTT `cmd` → `{type: 'reservation_push', ...}`."""
        with self._db_lock:
            self._db.execute(
                "INSERT OR REPLACE INTO reservation_cache"
                " (reservation_id, locker_id, item_id, expires_at, cached_at)"
                " VALUES (?, ?, ?, ?, ?)",
                (reservation_id, locker_id, item_id, expires_at, int(time.time())),
            )

    def remove_reservation(self, reservation_id: str) -> None:
        with self._db_lock:
            self._db.execute(
                "DELETE FROM reservation_cache WHERE reservation_id = ?",
                (reservation_id,),
            )

    def _lookup_reservation(self, reservation_id: str) -> dict[str, Any] | None:
        with self._db_lock:
            cur = self._db.execute(
                "SELECT locker_id, item_id, expires_at FROM reservation_cache"
                " WHERE reservation_id = ?",
                (reservation_id,),
            )
            row = cur.fetchone()
        if not row:
            return None
        return {"locker_id": row[0], "item_id": row[1], "expires_at": int(row[2])}

    # ─── Publication MQTT signée + file locale ─────────────────────────────

    def _sign(self, payload: dict[str, Any]) -> str:
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        return hmac.new(self._device_secret.encode("utf-8"), canonical, hashlib.sha256).hexdigest()

    def _publish_signed(self, topic: str, payload: dict[str, Any]) -> bool:
        envelope = {"data": payload, "sig": self._sign(payload)}
        try:
            self._mqtt.publish(topic, envelope, qos=1)
            return True
        except Exception as exc:  # noqa: BLE001 — fallback queue locale
            log.warning("mqtt_publish_failed_queueing", topic=topic, err=str(exc))
            try:
                with self._db_lock:
                    self._db.execute(
                        "INSERT INTO pending_events(topic, envelope_json, created_at)"
                        " VALUES (?, ?, ?)",
                        (topic, json.dumps(envelope), int(time.time())),
                    )
            except sqlite3.Error as inner:
                log.error("pending_event_persist_failed", err=str(inner))
            return False

    def flush_pending_events(self, max_batch: int = 100) -> int:
        """Rejoue les events queués pendant un offline. Renvoie le nombre publié."""
        with self._db_lock:
            rows = self._db.execute(
                "SELECT id, topic, envelope_json FROM pending_events ORDER BY id LIMIT ?",
                (max_batch,),
            ).fetchall()

        published = 0
        for row_id, topic, envelope_json in rows:
            try:
                self._mqtt.publish(topic, json.loads(envelope_json), qos=1)
                with self._db_lock:
                    self._db.execute("DELETE FROM pending_events WHERE id = ?", (row_id,))
                published += 1
            except Exception as exc:  # noqa: BLE001 — on stoppe au premier échec
                log.warning("pending_flush_aborted", id=row_id, err=str(exc))
                break

        if published:
            log.info("pending_events_flushed", count=published)
        return published

    # ─── API publique ──────────────────────────────────────────────────────

    def handle_unlock(self, qr_data: str) -> UnlockResult:
        """Vérifie un QR, ouvre le casier et publie l'event MQTT signé.

        Tous les chemins d'erreur loggent en structuré et retournent un
        ``UnlockResult`` — la méthode ne lève jamais d'exception à l'appelant.
        """
        bound = log.bind(token_preview=(qr_data[:12] + "...") if qr_data else "")

        try:
            return self._handle_unlock_inner(qr_data, bound)
        except Exception as exc:  # noqa: BLE001 — défense en profondeur
            bound.exception("unlock_internal_error", err=str(exc))
            return UnlockResult(UnlockOutcome.INTERNAL_ERROR, detail=str(exc))

    def _handle_unlock_inner(
        self, qr_data: str, bound: "structlog.types.FilteringBoundLogger"
    ) -> UnlockResult:
        # 1. Décodage + vérification JWT (signature, exp, iss, aud)
        try:
            claims = jwt.decode(
                qr_data,
                self._device_secret,
                algorithms=[JWT_ALGORITHM],
                issuer=JWT_ISSUER,
                audience=JWT_AUDIENCE,
            )
        except JWTError as err:
            bound.warning("jwt_invalid", err=str(err))
            return UnlockResult(UnlockOutcome.INVALID_TOKEN, detail=str(err))

        jti = claims.get("jti")
        reservation_id = claims.get("reservationId")
        locker_id = claims.get("lockerId")
        distributor_id = claims.get("distributorId")

        if not (jti and reservation_id and locker_id):
            bound.warning("jwt_missing_claims", claims_keys=list(claims.keys()))
            return UnlockResult(UnlockOutcome.INVALID_TOKEN, detail="missing_claims")

        bound = bound.bind(jti=jti, reservation_id=reservation_id, locker_id=locker_id)

        # 2. Le token doit cibler CE distributeur (le QR d'un autre site ne nous ouvre rien)
        if distributor_id and distributor_id != self._device_id:
            bound.warning(
                "device_mismatch", token_device=distributor_id, this_device=self._device_id,
            )
            return UnlockResult(
                UnlockOutcome.INVALID_TOKEN,
                reservation_id=reservation_id,
                locker_id=locker_id,
                detail="device_mismatch",
            )

        # 3. Anti-replay : check + insert atomique via contrainte UNIQUE
        if self._seen_nonce(jti):
            bound.warning("replay_blocked")
            return UnlockResult(
                UnlockOutcome.REPLAY, reservation_id=reservation_id, locker_id=locker_id,
            )
        if not self._register_nonce(jti):
            bound.warning("replay_blocked_race")
            return UnlockResult(
                UnlockOutcome.REPLAY, reservation_id=reservation_id, locker_id=locker_id,
            )

        # 4. Cohérence du mapping GPIO local
        if locker_id not in self._gpio_mapping:
            bound.error("locker_not_mapped")
            return UnlockResult(
                UnlockOutcome.UNKNOWN_LOCKER,
                reservation_id=reservation_id,
                locker_id=locker_id,
            )

        # 5. Cache réservation — décide le mode dégradé
        cached = self._lookup_reservation(reservation_id)
        online = self._mqtt.is_connected

        if cached is None:
            if online:
                # Réservation jamais push : on fait confiance au JWT (autoritaire).
                bound.info("reservation_not_cached_online", action="trust_jwt")
            else:
                # Offline + pas dans le cache : on ne peut pas garantir que la
                # réservation n'a pas été annulée → on refuse par défense.
                bound.warning("reservation_not_cached_offline_denied")
                return UnlockResult(
                    UnlockOutcome.CACHE_MISS_OFFLINE,
                    reservation_id=reservation_id,
                    locker_id=locker_id,
                )
        else:
            if cached["locker_id"] != locker_id:
                bound.error("locker_mismatch_with_cache", cached_locker=cached["locker_id"])
                return UnlockResult(
                    UnlockOutcome.LOCKER_MISMATCH,
                    reservation_id=reservation_id,
                    locker_id=locker_id,
                )
            if cached["expires_at"] < int(time.time()):
                bound.warning("reservation_expired_in_cache", expires_at=cached["expires_at"])
                return UnlockResult(
                    UnlockOutcome.EXPIRED,
                    reservation_id=reservation_id,
                    locker_id=locker_id,
                )

        # 6. Ouverture physique (pulse LOW sur la pin mappée)
        if not self._pulse_open(locker_id):
            bound.error("gpio_pulse_failed")
            return UnlockResult(
                UnlockOutcome.HARDWARE_FAULT,
                reservation_id=reservation_id,
                locker_id=locker_id,
            )

        # 7. Publication MQTT signée — fallback file locale si offline
        event_payload: dict[str, Any] = {
            "type": "door_unlocked",
            "deviceId": self._device_id,
            "reservationId": reservation_id,
            "lockerId": locker_id,
            "jti": jti,
            "openedAt": int(time.time()),
            "mode": "online" if online else "offline",
        }
        published = self._publish_signed("event", event_payload)

        # 8. Purge périodique des nonces > 24 h
        self._purge_old_nonces()

        bound.info("unlock_success", mqtt_published=published)
        return UnlockResult(
            UnlockOutcome.SUCCESS,
            reservation_id=reservation_id,
            locker_id=locker_id,
        )

    # ─── Cleanup ──────────────────────────────────────────────────────────

    def close(self) -> None:
        if _GPIO_AVAILABLE:
            with self._mute_exceptions():
                GPIO.cleanup()
        with self._mute_exceptions():
            with self._db_lock:
                self._db.close()

    @contextmanager
    def _mute_exceptions(self) -> Iterator[None]:
        try:
            yield
        except Exception as exc:  # noqa: BLE001
            log.warning("cleanup_ignored_error", err=str(exc))
