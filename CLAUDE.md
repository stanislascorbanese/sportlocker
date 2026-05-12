# SportLocker — Contexte projet pour Claude Code

## C'est quoi SportLocker ?
Service de prêt de matériel sportif en libre-service. Des distributeurs IoT connectés
installés sur les terrains publics. Les citoyens empruntent gratuitement via QR code ou NFC.
Modèle B2B SaaS vendu aux communes (350–500 €/dist./mois). Aucun concurrent direct en France.

## Stack technique
- **App mobile** : React Native + Expo SDK 51 + TypeScript + Firebase Auth + Zustand + React Query
- **Backend API** : Node.js 20 + Fastify 4 + TypeScript + Drizzle ORM + PostgreSQL 16 + Redis 7 + BullMQ
- **Firmware IoT** : Python 3.11 sur Raspberry Pi CM4 — MQTT paho, OpenCV+pyzbar (QR), pyhon-jose (JWT offline), llrpy (RFID)
- **Infra** : Docker Compose (dev) · AWS ECS (prod) · EMQX Cloud (MQTT broker) · Balena.io (OTA firmware)
- **Monorepo** : pnpm workspaces + Turborepo

## Architecture dossiers
```
sportlocker/
├── apps/web/          Site vitrine HTML statique
├── apps/mobile/       App React Native + Expo
├── apps/dashboard/    Dashboard opérateur Next.js 14
├── services/api/      Backend Fastify — routes REST + WebSocket
├── services/firmware/ Agent Python embarqué Raspberry Pi
├── packages/types/    Types TypeScript partagés
├── packages/config/   ESLint + tsconfig base
├── infra/docker/      Docker Compose dev/prod
├── database/          schema.sql + migrations/
└── docs/              ARCHITECTURE.md
```

## Base de données (PostgreSQL 16)
14 tables principales : communes · users · distributors · lockers · item_types · items ·
token_nonces · reservations · reviews · locker_events · distributor_heartbeats ·
maintenance_tickets · push_tokens · notification_logs

Voir `database/schema.sql` pour le schéma complet (1 165 lignes commentées).

## Règles métier critiques
- Un casier suit une machine à états : idle → reserved → active → returning → idle
- Le QR code est un JWT HS256 signé côté app (mode offline) — valable 15 min — nonce anti-replay
- Les stocks sont servis depuis Redis (< 20ms) avec fallback SQL
- BullMQ crons : expire réservations (2 min) · detect overdue (1 min) · heartbeat watchdog (3 min)
- RGPD : données supprimées/anonymisées 30j après gdpr_delete_requested_at

## Variables d'environnement
Voir `.env.example` — ne jamais committer les vraies valeurs.
Secrets critiques : DATABASE_URL · JWT_DEVICE_SECRET · FIREBASE_SERVICE_ACCOUNT_KEY · STRIPE_SECRET_KEY

## Conventions de code
- TypeScript strict mode — pas d'`any` explicite
- Zod pour toutes les validations d'entrée (API + forms)
- Drizzle pour toutes les requêtes SQL — jamais de string concat
- Commits en français, conventional commits : feat/fix/chore/docs/refactor
- Tests : vitest (backend) · Jest + React Testing Library (app)

## Commandes utiles
```bash
pnpm dev                    # Démarre tous les services en parallèle
pnpm --filter @sportlocker/api dev    # API seule (port 3000)
pnpm --filter @sportlocker/mobile dev # App mobile (Expo)
docker compose -f infra/docker/docker-compose.dev.yml up -d  # Infra locale
pnpm typecheck              # Vérification TypeScript tout le monorepo
pnpm test                   # Tests tout le monorepo
```

## Priorités actuelles (Mai 2026)
1. **API backend** — implémenter les routes reservations et distributors (scaffold existe)
2. **App mobile** — écrans carte, réservation, QR déverrouillage
3. **Firmware** — agent MQTT + QR reader + locker controller
4. **Tests** — couverture minimale 80% sur les routes critiques

## Ce qui NE doit PAS être modifié sans accord
- Le schéma SQL `database/schema.sql` — migrations versionnées uniquement
- La logique JWT offline dans le firmware — sécurité critique
- Les types partagés dans `packages/types/` — impact cross-app
