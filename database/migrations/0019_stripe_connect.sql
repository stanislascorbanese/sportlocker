-- 0019_stripe_connect.sql
--
-- ┌─ HISTORIQUE DE RENOMMAGE (2026-06-10) ──────────────────────────────────┐
-- │ Cette migration s'appelait initialement 0013_stripe_connect (mergée la  │
-- │ même journée que 0013_payments.sql qui avait pris le même numéro). Pour │
-- │ respecter la convention "1 numéro = 1 migration unique" (cf.            │
-- │ database/README.md), elle a été renommée 0019.                           │
-- │                                                                          │
-- │ Si la prod a déjà appliqué l'ancien nom (entrée                          │
-- │ `0013_stripe_connect.sql` dans schema_migrations), le runner va          │
-- │ considérer 0019 comme jamais appliquée et la rejouer. Aucun problème     │
-- │ fonctionnel (idempotente via IF NOT EXISTS) mais on aura deux traces     │
-- │ dans schema_migrations. Nettoyage manuel à faire en prod après deploy :  │
-- │                                                                          │
-- │   DELETE FROM schema_migrations                                          │
-- │    WHERE filename = '0013_stripe_connect.sql';                           │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- Ajoute les champs Stripe Connect Express à la table `communes` pour
-- permettre l'onboarding KYC + le reversement automatique 75/25 (vitrine
-- /tarifs, CDC §4.6).
--
-- Quoi
-- ────
-- Chaque commune (tenant) a 0 ou 1 compte Stripe Connect Express. L'admin
-- du tenant déclenche l'onboarding depuis le dashboard ops, suit le flow
-- Stripe-hosted (KYC entreprise + RIB + identité dirigeant), et revient
-- sur notre dashboard pour confirmation.
--
-- Champs
-- ──────
--   stripe_connect_account_id      : ID Stripe `acct_XXX` (null = pas
--                                    encore onboardé). UNIQUE quand non-null.
--   stripe_connect_charges_enabled : Stripe a vérifié l'identité et autorise
--                                    les paiements entrants. False par défaut
--                                    le temps de la vérif (24-48h).
--   stripe_connect_payouts_enabled : Stripe autorise les payouts vers le RIB
--                                    (peut être true même si charges_enabled
--                                    est encore false, et inversement).
--   stripe_connect_onboarded_at    : Timestamp posé quand les deux booléens
--                                    sont devenus true simultanément. Sert
--                                    de "premier onboarding complet" — n'est
--                                    PAS effacé si un des deux flags repasse
--                                    à false plus tard (ex. Stripe pause
--                                    payouts pour AML).
--
-- Sync
-- ────
-- Les 3 derniers champs sont sync via :
--   1. POST /v1/admin/stripe-connect/refresh (manuel admin)
--   2. Webhook `account.updated` (sync auto, PR ultérieure)
--
-- Pour la PR G1, le webhook handler n'est pas wiré — l'admin doit cliquer
-- "Rafraîchir le statut" pour récupérer les changements Stripe.
--
-- Rollback
-- ────────
-- DROP les 4 colonnes. Pas de perte de donnée critique côté SportLocker
-- (les comptes Connect restent côté Stripe, on peut les retrouver via
-- l'email du tenant).

-- Idempotent : `IF NOT EXISTS` sur colonnes + index. Permet aux suites de
-- tests qui apply schema.sql PUIS toutes les migrations (cf. pattern
-- mqtt-events.test, rgpd-anonymize.test, dev.test) de ne pas planter sur
-- "column already exists" — schema.sql contient déjà les colonnes 0013.
ALTER TABLE communes
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id      VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_connect_charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_connect_payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_connect_onboarded_at    TIMESTAMPTZ;

-- Index UNIQUE partial : permet plusieurs lignes NULL (communes non-onboardées)
-- mais garantit qu'un account_id ne peut pas être réutilisé par 2 communes.
-- Sécurité contre les bugs de copy-paste d'IDs Stripe entre tenants.
CREATE UNIQUE INDEX IF NOT EXISTS idx_communes_stripe_connect_account_id
  ON communes(stripe_connect_account_id)
  WHERE stripe_connect_account_id IS NOT NULL;
