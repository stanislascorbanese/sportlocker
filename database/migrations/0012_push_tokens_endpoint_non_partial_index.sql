-- 0012_push_tokens_endpoint_non_partial_index.sql
--
-- Convertit l'index UNIQUE sur push_tokens.endpoint d'un *partial* index
-- (`WHERE endpoint IS NOT NULL`, hérité de la migration 0010) vers un
-- index UNIQUE *non-partial*.
--
-- Pourquoi
-- ────────
-- Le code citoyen abonne un user au push via Drizzle :
--
--   db.insert(pushTokens).values(...)
--     .onConflictDoUpdate({ target: pushTokens.endpoint, set: {...} })
--
-- Drizzle génère un SQL `INSERT ... ON CONFLICT (endpoint) DO UPDATE ...`
-- SANS clause `WHERE` (Drizzle 0.45 n'expose pas l'API pour le faire).
--
-- Or Postgres exige que pour qu'un partial index soit utilisable comme
-- target d'`ON CONFLICT`, la requête doit aussi spécifier le WHERE
-- correspondant (cf. doc PG sur `index_predicate`). Sans ça, PG ne sait
-- pas matcher l'index → erreur "there is no unique or exclusion constraint
-- matching the ON CONFLICT specification" wrappée silencieusement par
-- Drizzle en "Failed query: insert into push_tokens".
--
-- Le partial était bien intentionné (gérer les vieilles rows endpoint=NULL
-- hériées de l'époque Expo Push) mais incompatible avec le code Drizzle.
-- Solution : index UNIQUE non-partial. En Postgres, NULL est traité comme
-- *distinct* dans un index UNIQUE par défaut → plusieurs rows endpoint=NULL
-- restent autorisées, donc safe pour les vieilles rows historiques.
--
-- Incident
-- ────────
-- Cf. session debug du 23 mai 2026. Symptôme côté citizen :
-- "L'abonnement est créé côté navigateur mais le serveur n'a pas pu
-- l'enregistrer. Réessaie." (500 Internal Server Error sur
-- POST /v1/push-subscriptions, masqué par Drizzle wrap).
--
-- Idempotent : DROP IF EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS.

DROP INDEX IF EXISTS idx_push_tokens_endpoint;

CREATE UNIQUE INDEX IF NOT EXISTS idx_push_tokens_endpoint
  ON push_tokens(endpoint);
