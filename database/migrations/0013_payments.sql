-- 0013_payments.sql
--
-- Introduit le paiement Stripe pour louer un casier (modèle slots).
--
-- Décisions produit (cf. conversation 2026-06-04) :
--   - Paiement AVANT confirmation : la résa naît en `pending_payment`
--     (slot + item tenus, mais AUCUN QR émis), puis bascule `scheduled`
--     (QR délivré) une fois le paiement réussi.
--   - Provider configurable via env `PAYMENTS_PROVIDER` (stripe | simulate).
--     En `simulate`, aucun appel Stripe : le paiement auto-réussit (dev offline,
--     même esprit que les routes /v1/dev existantes).
--   - Une résa `pending_payment` impayée au-delà de `PAYMENT_TTL_MINUTES` est
--     expirée par le cron (cf. expire-reservations) → libère le slot/item.
--
-- Idempotent : safe à re-jouer (IF NOT EXISTS, DO blocks pour les ALTER TYPE).
--
-- ─── 1. enum reservation_status : ajout 'pending_payment' ────────────────────
-- Placé AVANT 'scheduled' : c'est l'état initial du flow slots payant, qui
-- précède 'scheduled'.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'pending_payment'
      AND enumtypid = 'reservation_status'::regtype
  ) THEN
    ALTER TYPE reservation_status ADD VALUE 'pending_payment' BEFORE 'scheduled';
  END IF;
END$$;

-- ─── 2. enum payment_status ──────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE payment_status AS ENUM (
      'pending',     -- intent créé, paiement pas encore confirmé
      'succeeded',   -- paiement confirmé → résa passée en 'scheduled'
      'failed',      -- échec (carte refusée, etc.) — le citoyen peut réessayer
      'cancelled',   -- abandonné / expiré par le cron
      'refunded'     -- remboursé (post-MVP, réservé pour la suite)
    );
  END IF;
END$$;

-- ─── 3. table payments ───────────────────────────────────────────────────────
-- Une ligne par réservation (1:1). Le montant est un snapshot du price_cents
-- figé à la création de la résa — un changement de pricing_rules ultérieur
-- n'affecte pas un paiement déjà initié.

CREATE TABLE IF NOT EXISTS payments (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id           UUID NOT NULL UNIQUE REFERENCES reservations(id) ON DELETE CASCADE,
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_cents             INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency                 VARCHAR(3) NOT NULL DEFAULT 'EUR',
  status                   payment_status NOT NULL DEFAULT 'pending',
  provider                 VARCHAR(20) NOT NULL DEFAULT 'stripe',  -- 'stripe' | 'simulate'
  stripe_payment_intent_id VARCHAR(255) UNIQUE,
  error_message            TEXT,
  paid_at                  TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_status_created
  ON payments(status, created_at);
CREATE INDEX IF NOT EXISTS idx_payments_user
  ON payments(user_id);

-- ─── 4. index partiels "vivants" : inclure pending_payment ───────────────────
-- Une résa pending_payment tient déjà le slot/item : elle doit compter dans
-- l'anti-monopole (1 résa vivante max par user) ET bloquer le double-booking
-- d'un même item sur la fenêtre. On recrée les 2 index partiels de 0008 avec
-- 'pending_payment' ajouté au scope.

DROP INDEX IF EXISTS idx_reservations_one_live_per_user;
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_one_live_per_user
  ON reservations(user_id)
  WHERE status IN ('pending_payment', 'scheduled', 'pending', 'active');

DROP INDEX IF EXISTS idx_reservations_item_slot;
CREATE INDEX IF NOT EXISTS idx_reservations_item_slot
  ON reservations(item_id, slot_start_at, slot_end_at)
  WHERE status IN ('pending_payment', 'scheduled', 'pending', 'active');
