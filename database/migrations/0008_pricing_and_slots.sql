-- 0008_pricing_and_slots.sql
--
-- Bascule du modèle "day pass 5€/jour" (jamais implémenté, juste mentionné dans
-- docs/CDC.md) vers le modèle "slots de 30/60/90/120 min × prix par sport".
--
-- Décisions produit validées (cf. CDC.md §4.3 et conversation 2026-05-21) :
--   - 4 slots : 30 min, 1h, 1h30, 2h (max 2h, pas de 15 min côté MVP)
--   - Prix configuré par tenant via (commune × item_type × duration)
--   - Réservation anticipée jusqu'à J+7 → nouveau statut `scheduled`
--   - Anti-monopole : max 1 résa scheduled/pending/active par user
--   - Pas de paiement MVP : `price_cents` est un prix d'affichage figé à la
--     création de la résa (snapshot anti-modification rétroactive)
--
-- Idempotent : safe à re-jouer (IF NOT EXISTS, DO blocks pour les ALTER TYPE).
--
-- ─── 1. enum reservation_status : ajout 'scheduled' ──────────────────────────
-- PostgreSQL ne permet pas ADD VALUE IF NOT EXISTS dans toutes les versions,
-- on enveloppe dans un DO block pour rester idempotent.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'scheduled'
      AND enumtypid = 'reservation_status'::regtype
  ) THEN
    ALTER TYPE reservation_status ADD VALUE 'scheduled' BEFORE 'pending';
  END IF;
END$$;

-- ─── 2. reservations : colonnes slot + prix ──────────────────────────────────

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS slot_start_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS slot_end_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS price_cents      INTEGER;

-- Slots autorisés : 30 / 60 / 90 / 120 min (le check accepte NULL pour les
-- réservations historiques créées avant cette migration).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reservations_duration_minutes_check'
  ) THEN
    ALTER TABLE reservations
      ADD CONSTRAINT reservations_duration_minutes_check
      CHECK (duration_minutes IS NULL OR duration_minutes IN (30, 60, 90, 120));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reservations_price_cents_check'
  ) THEN
    ALTER TABLE reservations
      ADD CONSTRAINT reservations_price_cents_check
      CHECK (price_cents IS NULL OR price_cents >= 0);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reservations_slot_range_check'
  ) THEN
    ALTER TABLE reservations
      ADD CONSTRAINT reservations_slot_range_check
      CHECK (
        (slot_start_at IS NULL AND slot_end_at IS NULL)
        OR (slot_start_at IS NOT NULL AND slot_end_at IS NOT NULL
            AND slot_end_at > slot_start_at)
      );
  END IF;
END$$;

-- ─── 3. unique partiel : 1 seule résa "vivante" par user, incluant scheduled ─
-- Remplace idx_reservations_one_active_per_user (migration 0005) pour ajouter
-- 'scheduled' au scope. La règle métier reste : un citoyen ne peut détenir
-- qu'une résa pending/active à un instant T, mais peut désormais aussi
-- "réserver" un créneau futur — et cette résa future bloque elle aussi tout
-- doublon. Statut 'overdue' toujours exclu (cf. justification migration 0005).

DROP INDEX IF EXISTS idx_reservations_one_active_per_user;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_one_live_per_user
  ON reservations(user_id)
  WHERE status IN ('scheduled', 'pending', 'active');

-- ─── 4. index dispo : check overlap de slot par item ─────────────────────────
-- Query type : "ce ballon est-il libre entre 14h00 et 14h30 samedi ?"
--   WHERE item_id = ?
--     AND status IN ('scheduled','pending','active')
--     AND slot_start_at < $end
--     AND slot_end_at   > $start
-- Le composite (item_id, slot_start_at, slot_end_at) filtré sur les statuts
-- "vivants" donne un index scan ordonné pour le range overlap.

CREATE INDEX IF NOT EXISTS idx_reservations_item_slot
  ON reservations(item_id, slot_start_at, slot_end_at)
  WHERE status IN ('scheduled', 'pending', 'active');

-- ─── 5. table pricing_rules ──────────────────────────────────────────────────
-- Configuration tarifaire par (commune × item_type × duration).
-- Une ligne manquante = ce slot n'est pas proposé pour ce type d'item dans
-- cette commune (filtre côté API). price_cents = 0 est autorisé pour les
-- communes qui veulent garder un slot gratuit (ex. ballons enfants).
--
-- Templates par défaut (Communal léger / Saisonnier plage / Hôtel premium)
-- seront seedés en JSON côté dashboard (PR 3), pas dans cette migration —
-- le choix de template appartient au tenant à l'install, pas au schéma.

CREATE TABLE IF NOT EXISTS pricing_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commune_id       UUID NOT NULL REFERENCES communes(id)   ON DELETE CASCADE,
  item_type_id     UUID NOT NULL REFERENCES item_types(id) ON DELETE CASCADE,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes IN (30, 60, 90, 120)),
  price_cents      INTEGER NOT NULL CHECK (price_cents >= 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS pricing_rules_commune_item_type_duration_uq
  ON pricing_rules(commune_id, item_type_id, duration_minutes);

CREATE INDEX IF NOT EXISTS idx_pricing_rules_commune
  ON pricing_rules(commune_id);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_item_type
  ON pricing_rules(item_type_id);
