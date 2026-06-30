-- 0004_admin_multi_tenant.sql
--
-- Étape 1/2 du chantier multi-tenant : ajoute la valeur `super_admin` à
-- l'enum user_role. C'est tout ce que cette migration fait — volontairement.
--
-- POURQUOI EN UN FICHIER SÉPARÉ ?
--   Postgres refuse d'utiliser une nouvelle valeur d'enum (`super_admin`)
--   dans la même transaction où elle a été ajoutée. Or `migrate.mjs` envoie
--   chaque fichier via `sql.unsafe(text)` qui groupe tous les statements
--   en un seul batch — implicitement une transaction. D'où l'erreur :
--     "unsafe use of new value "super_admin" of enum type user_role"
--   quand on tente un UPDATE juste après le ALTER TYPE.
--
--   La suite (UPDATE users + table admin_invites + index) vit donc dans
--   `0005_admin_multi_tenant_data.sql`, exécutée APRÈS le commit de celle-ci.
--
-- Idempotent : ALTER TYPE ... ADD VALUE IF NOT EXISTS est no-op safe.

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';
