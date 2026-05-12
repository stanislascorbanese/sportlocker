# Déploiement Railway — SportLocker API

## Architecture

```
┌──────────────┐    ┌─────────────────┐
│ Railway      │───▶│  API service    │  (ce Dockerfile)
│ Projet       │    │  Fastify :PORT  │
└──────┬───────┘    └────────┬────────┘
       │                     │
       ├─ Postgres add-on ──▶ DATABASE_URL (auto-injecté)
       └─ Redis add-on    ──▶ REDIS_URL    (auto-injecté)
```

## Mise en place

1. Créer un projet Railway, attacher les add-ons **PostgreSQL** et **Redis**.
2. Ajouter un service depuis le repo GitHub. Pointer la config sur :
   - **Builder** : Dockerfile
   - **Dockerfile path** : `services/api/Dockerfile`
   - **Root directory** : `/` (racine repo — le contexte build a besoin du workspace)
3. Variables d'environnement : copier-coller depuis `.env.production.example`
   (à la racine du repo). Ne PAS dupliquer `DATABASE_URL`/`REDIS_URL` —
   Railway les injecte via les add-ons.
4. Générer les secrets JWT :
   ```bash
   openssl rand -base64 48 | tr -d '\n='
   ```
   À coller dans `JWT_SESSION_SECRET` et `JWT_DEVICE_SECRET`.
5. (Optionnel) Importer `railway.toml` via Settings → Config-as-Code pour
   pinner le healthcheck path + politique de restart.

## Cycle de vie d'un déploiement

```
git push  →  Railway pull  →  docker build  →  entrypoint.sh
                                                   │
                                                   ├─ node ./scripts/migrate.mjs
                                                   │     ├─ applique schema.sql (DB vide)
                                                   │     └─ applique migrations/*.sql non vues
                                                   │
                                                   └─ exec node dist/index.js
                                                         └─ Fastify écoute :$PORT
                                                              └─ /health/ répond 200
                                                                   └─ Railway marque READY
```

## Migrations

Le migrateur ([`services/api/scripts/migrate.mjs`](../../services/api/scripts/migrate.mjs)) :

- Détecte une DB vide (pas de table `users`) → applique `database/schema.sql`.
- Crée `schema_migrations(filename, applied_at)` si absente.
- Parcourt `database/migrations/*.sql` triés, applique ceux jamais vus,
  enregistre dans `schema_migrations`.

**Contrat** : chaque migration doit être idempotente (CREATE/ALTER ... IF NOT EXISTS).
Voir `migrations/0002_extension_columns.sql` pour un exemple de `ALTER TYPE ADD VALUE IF NOT EXISTS`.

Pour ajouter une nouvelle migration : créer `database/migrations/NNNN_description.sql`
(NNNN = numéro suivant). Au prochain déploiement, le migrateur la captera.

## Rollback / opérations

- **Voir les migrations appliquées** :
  ```bash
  railway run -s api -- psql "$DATABASE_URL" -c 'SELECT * FROM schema_migrations ORDER BY applied_at'
  ```
- **Re-jouer une migration manuelle** :
  ```bash
  railway run -s api -- node ./scripts/migrate.mjs
  ```
- **Logs** : `railway logs -s api`
- **Healthcheck** : `/health/` (200 si l'API tourne, ignore DB/Redis).
  Pour un check plus strict : `/health/ready` (DB + Redis up).

## Coût indicatif

- Service API (≤ 1 vCPU, 512 Mo) : ~5 $/mois
- Postgres add-on (1 Go) : ~5 $/mois
- Redis add-on (256 Mo) : ~3 $/mois

Total ≈ **13 $/mois** pour le MVP. Largement sous le seuil 350 €/dist./mois
facturé aux communes.
