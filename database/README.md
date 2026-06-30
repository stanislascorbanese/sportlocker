# Database

PostgreSQL 16 + extensions `pgcrypto`, `postgis`, `pg_trgm`.

## Fichiers
- `schema.sql` — schéma complet de référence. À appliquer sur base vide pour bootstrap dev.
- `migrations/` — migrations versionnées générées par Drizzle Kit (`pnpm --filter @sportlocker/api db:generate`).

## Bootstrap dev
```bash
docker compose -f infra/docker/docker-compose.dev.yml up -d postgres
psql "$DATABASE_URL" -f database/schema.sql
```

## Workflow migrations
1. Modifier le schéma Drizzle dans `services/api/src/db/schema.ts`.
2. `pnpm --filter @sportlocker/api db:generate` → produit un fichier dans `migrations/`.
3. `pnpm --filter @sportlocker/api db:migrate` → applique.
4. Mettre à jour `schema.sql` en miroir (référence humaine).

## Comment le runner applique les migrations

Au boot du container API (`services/api/entrypoint.sh` → `scripts/migrate.mjs`) :

1. Si la table `users` n'existe pas → applique `schema.sql` (bootstrap d'une DB neuve).
2. Crée si besoin la table `schema_migrations(filename, applied_at)`.
3. Itère sur `migrations/*.sql` **triés alphabétiquement**, applique chaque fichier non encore dans `schema_migrations`, puis y insère son nom.

## Convention de nommage — **1 numéro = 1 migration unique**

Format : `NNNN_short_snake_case_description.sql` où `NNNN` est un entier zero-padded à 4 chiffres.

⚠️ **JAMAIS deux migrations avec le même préfixe `NNNN_`.** Si deux PRs ouvertes prennent le même numéro et se font merger dans la foulée, **la 2e doit être renumérotée avant merge** sur le prochain numéro libre.

**Pourquoi** : sur une DB fraîche, l'ordre d'application dépend du tri alphabétique strict (`0005_a.sql` < `0005_b.sql`). En cas de doublon, ce tri devient pseudo-déterministe selon l'éditeur / le filesystem / la locale — on a déjà eu une divergence prod ↔ dev qui a nécessité un patch manuel (cf. `0007_distributors_address_line.sql`, historique de renommage).

## Convention d'idempotence — **chaque migration doit pouvoir être rejouée sans casser**

Le runner utilise `schema_migrations` pour éviter la re-application en prod, mais pour 3 raisons l'idempotence reste obligatoire :

1. Les suites de tests **appliquent `schema.sql` PUIS toutes les migrations** sans passer par `schema_migrations`. Si une migration ajoute une colonne déjà présente dans `schema.sql`, elle plante sans `IF NOT EXISTS`.
2. Une migration peut devoir être renumérotée plus tard — le runner verra alors le nouveau nom comme jamais appliqué et la rejouera.
3. Un rollback partiel manuel suivi d'un re-deploy doit tourner sans hoquet.

Patterns :

```sql
ALTER TABLE foo ADD COLUMN IF NOT EXISTS bar TEXT;
CREATE INDEX IF NOT EXISTS idx_foo_bar ON foo(bar);
CREATE TABLE IF NOT EXISTS baz (…);

-- Enums :
ALTER TYPE my_enum ADD VALUE IF NOT EXISTS 'new_value';

-- Seeds :
INSERT INTO foo (id, name) VALUES (…)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
```

## Que faire quand on renumérote une migration

Si tu dois renommer `0005_foo.sql` → `0018_foo.sql` (parce que `0005` est en doublon avec une autre PR) :

1. **`git mv`** le fichier vers le nouveau nom.
2. **Ajoute un bloc HISTORIQUE DE RENOMMAGE** en tête du fichier (voir `0007_distributors_address_line.sql`, `0018_reservations_unique_active.sql` ou `0019_stripe_connect.sql` pour des exemples).
3. **Vérifie l'idempotence** du contenu — la migration va être rejouée en prod (le runner ne reconnaît pas le nouveau nom).
4. **Documente le `DELETE FROM schema_migrations`** manuel à faire en prod après deploy, pour nettoyer la trace de l'ancien nom dans la table de tracking.

## Fallback en cas de doute

Variable d'env `MIGRATE_LEGACY_BATCH=1` → revient à l'ancien comportement (un seul `sql.unsafe()` par fichier complet, au lieu du split statement-par-statement). Utile pour debug d'un cas pathologique, à ne pas laisser activé en prod.
