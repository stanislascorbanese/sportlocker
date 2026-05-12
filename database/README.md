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
