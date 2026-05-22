# SportLocker — Contexte projet pour Claude Code

## C'est quoi SportLocker ?
Service de prêt de matériel sportif en libre-service. Des distributeurs IoT connectés
installés sur les terrains publics. Les citoyens empruntent gratuitement via QR code ou NFC.
Modèle B2B SaaS vendu aux communes (350–500 €/dist./mois). Aucun concurrent direct en France.

## Stack technique
- **App citoyenne** : Next.js 15 (PWA) + TypeScript + Firebase Auth + React Query — `apps/citizen` (app.sportlocker.fr)
- **Dashboard ops** : Next.js 15 + TypeScript + Tailwind + Firebase Auth — `apps/dashboard` (ops.sportlocker.fr)
- **Site vitrine** : Astro statique — `apps/web` (www.sportlocker.fr)
- **Backend API** : Node.js 20 + Fastify 4 + TypeScript + Drizzle ORM + PostgreSQL 16 + Redis 7 + BullMQ
- **Firmware IoT** : Python 3.11 sur Raspberry Pi CM4 — MQTT paho, OpenCV+pyzbar (QR), pyhon-jose (JWT offline), llrpy (RFID)
- **Infra** : Docker Compose (dev) · AWS ECS (prod) · EMQX Cloud (MQTT broker) · Balena.io (OTA firmware)
- **Monorepo** : pnpm workspaces + Turborepo

## Architecture dossiers
```
sportlocker/
├── apps/web/          Site vitrine Astro (www.sportlocker.fr)
├── apps/citizen/      PWA citoyenne Next.js 15 (app.sportlocker.fr)
├── apps/dashboard/    Dashboard opérateur Next.js 15 (ops.sportlocker.fr)
├── services/api/      Backend Fastify — routes REST (api.sportlocker.fr)
├── services/firmware/ Agent Python embarqué Raspberry Pi
├── packages/types/    Types TypeScript partagés
├── packages/config/   ESLint + tsconfig base
├── infra/docker/      Docker Compose dev/prod
├── database/          schema.sql + migrations/
└── docs/              ARCHITECTURE.md
```

> **Note** : `apps/mobile` (Expo React Native) a été supprimé en mai 2026.
> La PWA `apps/citizen` couvre l'usage citoyen avec une maintenance unique.
> Si un besoin natif émerge plus tard (push iOS, vrai App Store), envisager
> Capacitor par-dessus la PWA pour mutualiser le code, plutôt qu'un fork RN.

## Base de données (PostgreSQL 16)
15 tables principales : communes · users · distributors · lockers · item_types · items ·
token_nonces · reservations · reviews · locker_events · distributor_heartbeats ·
maintenance_tickets · push_tokens · notification_logs · pricing_rules

Voir `database/schema.sql` pour le schéma complet.

## Règles métier critiques
- Un casier suit une machine à états : idle → reserved → active → returning → idle
- Le QR code est un JWT HS256 signé côté app (mode offline) — valable 15 min — nonce anti-replay
- Les stocks sont servis depuis Redis (< 20ms) avec fallback SQL
- BullMQ crons : expire réservations (2 min) · detect overdue (1 min) · heartbeat watchdog (3 min)
- RGPD : données supprimées/anonymisées 30j après gdpr_delete_requested_at
- **Modèle tarifaire (PR 0008)** : slots de 30/60/90/120 min · prix configurable par tenant via `pricing_rules` (commune × item_type × duration) · réservation anticipée J+7 (statut `scheduled`) · max 1 résa "vivante" par user · pas de paiement MVP (prix d'affichage uniquement)

## Variables d'environnement
Voir `.env.example` — ne jamais committer les vraies valeurs.
Secrets critiques : DATABASE_URL · JWT_DEVICE_SECRET · FIREBASE_SERVICE_ACCOUNT_KEY · STRIPE_SECRET_KEY

## Conventions de code
- TypeScript strict mode — pas d'`any` explicite
- Zod pour toutes les validations d'entrée (API + forms)
- Drizzle pour toutes les requêtes SQL — jamais de string concat
- Commits en français, conventional commits : feat/fix/chore/docs/refactor
- Tests : vitest (backend + citizen + dashboard) · pytest (firmware)

## Commandes utiles
```bash
pnpm dev                              # Démarre tous les services en parallèle
pnpm --filter @sportlocker/api dev    # API seule (port 3000)
pnpm --filter @sportlocker/citizen dev # PWA citoyenne (port 3002)
pnpm --filter @sportlocker/dashboard dev # Dashboard ops (port 3001)
docker compose -f infra/docker/docker-compose.dev.yml up -d  # Infra locale
pnpm typecheck              # Vérification TypeScript tout le monorepo
pnpm test                   # Tests tout le monorepo
```

## Priorités actuelles (Mai 2026)
1. **Firmware en prod** — déployer sur un premier Raspberry Pi avec un distributeur réel
2. **Vitrine** — refonte copywriting marketing pour refléter le modèle slots (vs day pass historique)
3. **Tests** — couverture minimale 80% sur les routes critiques

## Ce qui NE doit PAS être modifié sans accord
- Le schéma SQL `database/schema.sql` — migrations versionnées uniquement
- La logique JWT offline dans le firmware — sécurité critique
- Les types partagés dans `packages/types/` — impact cross-app
