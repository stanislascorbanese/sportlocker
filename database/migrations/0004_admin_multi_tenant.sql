-- 0004_admin_multi_tenant.sql
--
-- Multi-tenant production-ready :
--   1. Ajoute la valeur `super_admin` à l'enum user_role
--   2. Renomme les rôles existants pour matcher le contrat dashboard :
--        operator → admin       (scoped commune)
--        admin    → super_admin (bypass scoping)
--   3. Crée la table `admin_invites` pour l'onboarding magique des admins tenant
--   4. Ajoute l'index `idx_users_commune_id` pour les jointures de scoping
--
-- Sémantique finale :
--   - citizen     : utilisateur app mobile
--   - admin       : responsable d'une commune (scoping commune_id obligatoire)
--   - super_admin : équipe SportLocker (bypass scoping, voit tous les tenants)
--   - operator    : DEPRECATED (valeur conservée dans l'enum, plus aucun user
--                   ne l'utilise après cette migration ; impossible de retirer
--                   une valeur d'un enum Postgres sans recréer le type)
--
-- Idempotent : safe à re-jouer (IF NOT EXISTS partout, UPDATE convergents).

-- Étape 1 : enum super_admin
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';

-- Étape 2 : migration des rôles existants.
-- Ordre important : on déplace d'abord 'admin' → 'super_admin' (sinon les anciens
-- operator promus en 'admin' seraient sur-promus en 'super_admin').
UPDATE users SET role = 'super_admin' WHERE role = 'admin';
UPDATE users SET role = 'admin'       WHERE role = 'operator';

-- Étape 3 : table admin_invites
CREATE TABLE IF NOT EXISTS admin_invites (
  token        TEXT PRIMARY KEY,
  email        VARCHAR(180) NOT NULL,
  commune_id   UUID NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
  expires_at   TIMESTAMPTZ NOT NULL,
  accepted_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_invites_email      ON admin_invites(email);
CREATE INDEX IF NOT EXISTS idx_admin_invites_commune_id ON admin_invites(commune_id);

-- Étape 4 : index sur users.commune_id (jointures de scoping admin → commune).
CREATE INDEX IF NOT EXISTS idx_users_commune_id ON users(commune_id);
