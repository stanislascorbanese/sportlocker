-- ═══════════════════════════════════════════════════════════════════════════
--  SportLocker — Schéma PostgreSQL 16
-- ═══════════════════════════════════════════════════════════════════════════
--  14 tables principales pour le service de prêt de matériel sportif IoT.
--  Convention : noms de tables au pluriel, snake_case, timestamps UTC.
--  À appliquer sur une base vide. Les migrations versionnées vivent dans
--  ./migrations/ et sont produites par Drizzle Kit.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- recherche textuelle
-- PostGIS retiré : déploiement vanilla postgres:16-alpine.
-- Voir migration 0003_distributors_latlng.sql pour le passage en colonnes
-- scalaires (latitude/longitude) + Haversine app-side.

-- ─── ENUMS ────────────────────────────────────────────────────────────────

-- Sémantique multi-tenant :
--   citizen     : utilisateur app mobile
--   admin       : responsable d'une commune (scoping commune_id obligatoire)
--   super_admin : équipe SportLocker (bypass scoping, voit tous les tenants)
--   operator    : DEPRECATED (migration 0004) — conservé pour compat enum
CREATE TYPE user_role AS ENUM ('citizen', 'operator', 'admin', 'super_admin');

CREATE TYPE distributor_status AS ENUM (
  'online',         -- heartbeat reçu < 5 min
  'offline',        -- pas de heartbeat depuis > 5 min
  'maintenance',    -- mode maintenance déclaré
  'decommissioned'  -- retiré du parc
);

CREATE TYPE locker_state AS ENUM (
  'idle',           -- casier libre, contient l'item
  'reserved',       -- réservé par un user, attend ouverture
  'active',         -- ouvert, item sorti, prêt en cours
  'returning',      -- item rendu dans un casier (en attente vérif)
  'fault'           -- erreur matérielle, hors service
);

CREATE TYPE item_condition AS ENUM ('new', 'good', 'worn', 'damaged', 'lost');

CREATE TYPE reservation_status AS ENUM (
  'pending',        -- créée, casier réservé, QR émis
  'active',         -- item retiré
  'returned',       -- rendu dans les délais
  'overdue',        -- non rendu après 24h
  'cancelled',      -- annulée avant ouverture
  'expired'         -- QR expiré sans ouverture (auto-libération casier)
);

CREATE TYPE locker_event_type AS ENUM (
  'reserved', 'opened', 'closed', 'returned',
  'expired', 'cancelled', 'fault', 'maintenance', 'extended'
);

CREATE TYPE maintenance_status AS ENUM ('open', 'in_progress', 'resolved', 'wontfix');

CREATE TYPE notification_channel AS ENUM ('push', 'email', 'sms');

-- ─── 1. communes ───────────────────────────────────────────────────────────

CREATE TABLE communes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insee_code     VARCHAR(5)  NOT NULL UNIQUE,
  name           VARCHAR(120) NOT NULL,
  postal_code    VARCHAR(5)  NOT NULL,
  department     VARCHAR(3)  NOT NULL,
  region         VARCHAR(60) NOT NULL,
  population     INTEGER,
  contract_start DATE,
  contract_end   DATE,
  monthly_fee_cents INTEGER NOT NULL DEFAULT 0,
  contact_email  VARCHAR(180),
  contact_phone  VARCHAR(20),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_communes_insee ON communes(insee_code);

-- ─── 2. users ──────────────────────────────────────────────────────────────

CREATE TABLE users (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid             VARCHAR(128) NOT NULL UNIQUE,
  email                    VARCHAR(180) NOT NULL UNIQUE,
  display_name             VARCHAR(120),
  phone                    VARCHAR(20),
  role                     user_role NOT NULL DEFAULT 'citizen',
  commune_id               UUID REFERENCES communes(id) ON DELETE SET NULL,
  trust_score              SMALLINT NOT NULL DEFAULT 100 CHECK (trust_score BETWEEN 0 AND 100),
  total_reservations       INTEGER NOT NULL DEFAULT 0,
  is_banned                BOOLEAN NOT NULL DEFAULT FALSE,
  banned_reason            TEXT,
  last_active_at           TIMESTAMPTZ,
  gdpr_delete_requested_at TIMESTAMPTZ,
  gdpr_deleted_at          TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_firebase    ON users(firebase_uid);
CREATE INDEX idx_users_email       ON users(email);
CREATE INDEX idx_users_role        ON users(role);
CREATE INDEX idx_users_commune_id  ON users(commune_id);
CREATE INDEX idx_users_gdpr_delete ON users(gdpr_delete_requested_at)
  WHERE gdpr_delete_requested_at IS NOT NULL;

-- ─── admin_invites — onboarding magique tenant ─────────────────────────────
--  Un super_admin émet un invite avec email + commune_id ; l'admin tenant
--  clique le lien (token one-time), s'authentifie via Firebase, et son user
--  est créé avec role='admin' + commune_id. Voir migration 0004.

CREATE TABLE admin_invites (
  token        TEXT PRIMARY KEY,
  email        VARCHAR(180) NOT NULL,
  commune_id   UUID NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
  expires_at   TIMESTAMPTZ NOT NULL,
  accepted_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_invites_email      ON admin_invites(email);
CREATE INDEX idx_admin_invites_commune_id ON admin_invites(commune_id);

-- ─── 3. distributors ───────────────────────────────────────────────────────

CREATE TABLE distributors (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number     VARCHAR(40) NOT NULL UNIQUE,
  commune_id        UUID NOT NULL REFERENCES communes(id) ON DELETE RESTRICT,
  name              VARCHAR(120) NOT NULL,
  latitude          DOUBLE PRECISION,
  longitude         DOUBLE PRECISION,
  address_line      VARCHAR(200),
  status            distributor_status NOT NULL DEFAULT 'offline',
  firmware_version  VARCHAR(20),
  balena_uuid       VARCHAR(64),
  installed_at      DATE,
  last_seen_at      TIMESTAMPTZ,
  locker_count      SMALLINT NOT NULL CHECK (locker_count > 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_distributors_commune ON distributors(commune_id);
CREATE INDEX idx_distributors_status  ON distributors(status);
CREATE INDEX idx_distributors_latlng  ON distributors(latitude, longitude);

-- ─── 4. item_types ─────────────────────────────────────────────────────────

CREATE TABLE item_types (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          VARCHAR(60)  NOT NULL UNIQUE,
  name          VARCHAR(120) NOT NULL,
  category      VARCHAR(40)  NOT NULL,           -- ballon, raquette, etc.
  description   TEXT,
  image_url     TEXT,
  caution_cents INTEGER NOT NULL DEFAULT 0,
  max_duration_minutes INTEGER NOT NULL DEFAULT 240,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_item_types_category ON item_types(category);
CREATE INDEX idx_item_types_slug     ON item_types(slug);

-- ─── 5. lockers ────────────────────────────────────────────────────────────

CREATE TABLE lockers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id  UUID NOT NULL REFERENCES distributors(id) ON DELETE CASCADE,
  position        SMALLINT NOT NULL,             -- 0..N-1 sur le distributeur
  state           locker_state NOT NULL DEFAULT 'idle',
  current_item_id UUID,                          -- FK ajoutée plus bas
  rfid_tag        VARCHAR(64),                   -- tag du compartiment
  last_state_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(distributor_id, position)
);

CREATE INDEX idx_lockers_distributor ON lockers(distributor_id);
CREATE INDEX idx_lockers_state       ON lockers(state);

-- ─── 6. items ──────────────────────────────────────────────────────────────

CREATE TABLE items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type_id    UUID NOT NULL REFERENCES item_types(id) ON DELETE RESTRICT,
  rfid_tag        VARCHAR(64) NOT NULL UNIQUE,
  current_locker_id UUID REFERENCES lockers(id) ON DELETE SET NULL,
  condition       item_condition NOT NULL DEFAULT 'new',
  total_loans     INTEGER NOT NULL DEFAULT 0,
  last_inspected_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_items_type     ON items(item_type_id);
CREATE INDEX idx_items_locker   ON items(current_locker_id);
CREATE INDEX idx_items_rfid     ON items(rfid_tag);
CREATE INDEX idx_items_condition ON items(condition);

ALTER TABLE lockers
  ADD CONSTRAINT fk_lockers_current_item
  FOREIGN KEY (current_item_id) REFERENCES items(id) ON DELETE SET NULL;

-- ─── 7. token_nonces ───────────────────────────────────────────────────────
--  Anti-replay pour les JWT offline du QR code (15 min de validité).
--  Purge automatique via cron BullMQ (rétention 24h pour audit).

CREATE TABLE token_nonces (
  nonce          VARCHAR(64) PRIMARY KEY,
  reservation_id UUID NOT NULL,
  used_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  distributor_id UUID NOT NULL REFERENCES distributors(id) ON DELETE CASCADE
);

CREATE INDEX idx_token_nonces_reservation ON token_nonces(reservation_id);
CREATE INDEX idx_token_nonces_used_at     ON token_nonces(used_at);

-- ─── 8. reservations ───────────────────────────────────────────────────────

CREATE TABLE reservations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  locker_id       UUID NOT NULL REFERENCES lockers(id) ON DELETE RESTRICT,
  item_id         UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  distributor_id  UUID NOT NULL REFERENCES distributors(id) ON DELETE RESTRICT,
  status          reservation_status NOT NULL DEFAULT 'pending',
  qr_jti          VARCHAR(64) NOT NULL UNIQUE,   -- JWT ID = nonce attendu
  expires_at      TIMESTAMPTZ NOT NULL,
  opened_at       TIMESTAMPTZ,
  returned_at     TIMESTAMPTZ,
  return_locker_id UUID REFERENCES lockers(id) ON DELETE SET NULL,
  return_distributor_id UUID REFERENCES distributors(id) ON DELETE SET NULL,
  cancellation_reason TEXT,
  due_at          TIMESTAMPTZ,                   -- deadline retour, posée à l'ouverture
  extension_count SMALLINT NOT NULL DEFAULT 0,   -- max 2 prolongations
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reservations_due_at      ON reservations(due_at)
  WHERE status IN ('active', 'overdue');
CREATE INDEX idx_reservations_user        ON reservations(user_id);
CREATE INDEX idx_reservations_status      ON reservations(status);
CREATE INDEX idx_reservations_expires     ON reservations(expires_at)
  WHERE status IN ('pending', 'active');
CREATE INDEX idx_reservations_distributor ON reservations(distributor_id);
CREATE INDEX idx_reservations_created     ON reservations(created_at DESC);

-- ─── 9. reviews ────────────────────────────────────────────────────────────

CREATE TABLE reviews (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL UNIQUE REFERENCES reservations(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating         SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment        TEXT,
  reported_issue BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reviews_user    ON reviews(user_id);
CREATE INDEX idx_reviews_rating  ON reviews(rating);

-- ─── 10. locker_events ─────────────────────────────────────────────────────
--  Journal append-only de tous les événements casier (audit, debug, analytics).

CREATE TABLE locker_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  locker_id      UUID NOT NULL REFERENCES lockers(id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
  event_type     locker_event_type NOT NULL,
  source         VARCHAR(20) NOT NULL,           -- 'firmware', 'api', 'cron'
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_locker_events_locker      ON locker_events(locker_id, created_at DESC);
CREATE INDEX idx_locker_events_reservation ON locker_events(reservation_id);
CREATE INDEX idx_locker_events_type        ON locker_events(event_type);

-- ─── 11. distributor_heartbeats ────────────────────────────────────────────
--  Rétention 30 jours, partitionnée par jour en prod.

CREATE TABLE distributor_heartbeats (
  id             BIGSERIAL PRIMARY KEY,
  distributor_id UUID NOT NULL REFERENCES distributors(id) ON DELETE CASCADE,
  received_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rssi_dbm       SMALLINT,
  uptime_seconds INTEGER,
  cpu_temp_c     NUMERIC(4,1),
  free_mem_mb    INTEGER,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_heartbeats_distributor ON distributor_heartbeats(distributor_id, received_at DESC);

-- ─── 12. maintenance_tickets ───────────────────────────────────────────────

CREATE TABLE maintenance_tickets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id  UUID NOT NULL REFERENCES distributors(id) ON DELETE CASCADE,
  locker_id       UUID REFERENCES lockers(id) ON DELETE SET NULL,
  item_id         UUID REFERENCES items(id) ON DELETE SET NULL,
  opened_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_to     UUID REFERENCES users(id) ON DELETE SET NULL,
  status          maintenance_status NOT NULL DEFAULT 'open',
  severity        SMALLINT NOT NULL DEFAULT 3 CHECK (severity BETWEEN 1 AND 5),
  title           VARCHAR(200) NOT NULL,
  description     TEXT,
  resolution_note TEXT,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_maintenance_distributor ON maintenance_tickets(distributor_id);
CREATE INDEX idx_maintenance_status      ON maintenance_tickets(status);

-- ─── 13. push_tokens ───────────────────────────────────────────────────────

CREATE TABLE push_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expo_token  VARCHAR(200) NOT NULL UNIQUE,
  device_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_push_tokens_user ON push_tokens(user_id);

-- ─── 14. notification_logs ─────────────────────────────────────────────────

CREATE TABLE notification_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  channel       notification_channel NOT NULL,
  template      VARCHAR(60) NOT NULL,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  delivered_at  TIMESTAMPTZ,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notification_logs_user    ON notification_logs(user_id);
CREATE INDEX idx_notification_logs_channel ON notification_logs(channel);

-- ─── Triggers updated_at ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'communes', 'users', 'distributors', 'lockers', 'items',
    'reservations', 'maintenance_tickets'
  ])
  LOOP
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();', t);
  END LOOP;
END$$;
