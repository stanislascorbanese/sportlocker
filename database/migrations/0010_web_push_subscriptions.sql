-- 0010_web_push_subscriptions.sql
--
-- Adapte la table push_tokens au standard Web Push (RFC 8030 + VAPID).
-- Le champ `expo_token` initialement prévu pour Expo Push n'est jamais
-- entré en service en prod (apps/mobile supprimé en mai 2026, cf. PR #152).
-- On ajoute les 3 colonnes nécessaires à un envoi web-push :
--
--   - `endpoint`   : URL du push service (FCM/Mozilla/Apple). Unique.
--   - `p256dh_key` : clé publique ECDSA P-256 du subscriber (chiffrement
--                    payload). Format base64url, ~88 caractères.
--   - `auth_key`   : secret 16-octets fourni par le subscriber pour
--                    l'authentification du payload. Base64url, ~24 chars.
--
-- `expo_token` est rendu nullable pour ne pas bloquer les nouveaux inserts
-- (on ne le set plus). À supprimer dans une migration ultérieure si on est
-- sûr que rien en prod n'en dépend.
--
-- Idempotent : ADD COLUMN IF NOT EXISTS + DROP NOT NULL safe à re-jouer.

ALTER TABLE push_tokens
  ADD COLUMN IF NOT EXISTS endpoint   VARCHAR(500),
  ADD COLUMN IF NOT EXISTS p256dh_key VARCHAR(200),
  ADD COLUMN IF NOT EXISTS auth_key   VARCHAR(50);

ALTER TABLE push_tokens
  ALTER COLUMN expo_token DROP NOT NULL;

-- Unicité de l'endpoint : un même push service ne peut être enregistré
-- qu'une fois (le user peut quand même avoir plusieurs devices = plusieurs
-- endpoints). Partial index pour ne pas faire trébucher la ligne historique
-- (endpoint = NULL).
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_tokens_endpoint
  ON push_tokens(endpoint)
  WHERE endpoint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_push_tokens_user
  ON push_tokens(user_id);
