-- 0017_wallet_topups.sql
--
-- Porte-monnaie prépayé citoyen (carnet/pass — Phase 1).
--
-- Modèle « minimal » : une seule table pour le cycle de vie des RECHARGES.
-- Le SOLDE d'un user est calculé :
--   solde = Σ(wallet_topups.amount_cents WHERE status='succeeded')
--         − Σ(payments.amount_cents WHERE provider='wallet' AND status='succeeded')
-- Les dépenses réutilisent la table `payments` (provider='wallet') : pas de
-- table « ledger » séparée.
--
-- Idempotent : CREATE TABLE/INDEX IF NOT EXISTS → re-jouable sans risque.

CREATE TABLE IF NOT EXISTS wallet_topups (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents             INTEGER NOT NULL CHECK (amount_cents > 0),
  currency                 VARCHAR(3) NOT NULL DEFAULT 'EUR',
  status                   payment_status NOT NULL DEFAULT 'pending',
  -- 'stripe' (réel) | 'simulate' (dev offline). Figé à la création selon
  -- PAYMENTS_PROVIDER, comme pour les paiements de location.
  provider                 VARCHAR(20) NOT NULL DEFAULT 'stripe',
  stripe_payment_intent_id VARCHAR(255) UNIQUE,
  error_message            TEXT,
  paid_at                  TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_topups_user   ON wallet_topups(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_topups_status ON wallet_topups(status, created_at);
