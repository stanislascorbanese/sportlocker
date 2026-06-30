# SportLocker — Contexte projet pour Claude Code

## C'est quoi SportLocker ?
Service de prêt de matériel sportif en libre-service. Des distributeurs IoT connectés
installés sur les terrains publics (communes) **et sur les campings** depuis mai 2026.
Les citoyens réservent via QR code ou NFC depuis une PWA et **payent à la location**
via Stripe (carte / Apple Pay / Google Pay / PayPal / Klarna).

Deux segments commerciaux :
- **Communes** : SaaS 350-500 €/dist./mois, grille tarifaire pilote 1/2/3/4 € pour
  30/60/90/120 min (configurable par tenant via `pricing_rules`).
- **Campings** : SaaS 400 €/dist./mois + **revenue share Stripe Connect** (75 %
  reversés à l'opérateur), grille opérateur libre.

Aucun concurrent direct en France.

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
17 tables principales : communes · users · distributors · lockers · item_types · items ·
token_nonces · reservations · reviews · locker_events · distributor_heartbeats ·
maintenance_tickets · push_tokens · notification_logs · pricing_rules · admin_invites · payments

Voir `database/schema.sql` pour le schéma complet.

## Règles métier critiques
- Un casier suit une machine à états : idle → reserved → active → returning → idle
- Le QR code est un JWT HS256 signé côté app (mode offline) — valable 15 min — nonce anti-replay
- Les stocks sont servis depuis Redis (< 20ms) avec fallback SQL
- BullMQ crons : expire réservations (2 min) · detect overdue (1 min, + rappel push + pénalité trust_score) · heartbeat watchdog (3 min) · slot-reminders (rappel J-N min avant slot)
- RGPD : données supprimées/anonymisées 30j après gdpr_delete_requested_at
- **Modèle tarifaire (PR #0008)** : slots de 30/60/90/120 min · prix configurable par tenant via `pricing_rules` (commune × item_type × duration) · réservation anticipée J+7 (statut `scheduled`) · max 1 résa "vivante" par user
- **Paiement Stripe (PR #253, #267, #281, #283)** : carte + Apple/Google Pay + PayPal/Klarna via `automatic_payment_methods` · webhook `/v1/stripe/webhook` couvert à 96% · **Stripe Connect** pour reverser aux opérateurs camping (75 %) · **porte-monnaie prépayé** (recharge + dépense) côté citoyen
- **Trust score (PR #259)** : pénalité automatique sur retour overdue (cron `detect-overdue`)
- **Articles premium (PR #278)** : grille tarifaire ×2/×3 pour matériel haut de gamme

## Variables d'environnement
Voir `.env.example` — ne jamais committer les vraies valeurs.
Secrets critiques : DATABASE_URL · JWT_SESSION_SECRET · JWT_DEVICE_SECRET · FIREBASE_SERVICE_ACCOUNT_KEY · STRIPE_SECRET_KEY · STRIPE_WEBHOOK_SECRET · STRIPE_CONNECT_CLIENT_ID · MQTT_USERNAME · MQTT_PASSWORD · MQTT_CA_CERT_PATH

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

## Priorités actuelles (Juin 2026)

**Acquis depuis mai 2026** :
- ✅ Firmware MQTT TLS + distributeur fantôme `firmware-sim` opérationnel sur Railway (PRs #176-180) — il reste à déployer sur un vrai Raspberry Pi quand le hardware sera commandé.
- ✅ Vitrine refondue : modèle slots reflété, pages distinctes `/mairies` + `/campings`, `PriceCalculator.tsx`, mockup 3D distributeur, SEO local par commune, polish home.
- ✅ Couverture tests gate ≥80% en CI sur l'API (PR #282), couverture massive sur webhook Stripe / reservations / auth / admin-payments / pricing.
- ✅ Paiement Stripe complet (carte + wallets natifs + PayPal/Klarna) + Stripe Connect + porte-monnaie prépayé citoyen.
- ✅ i18n FR/EN dashboard ops complet.

**Chantiers en cours** :
1. **Migration Fastify 4 → 5** (PR #289 en cours) — résout GHSA-jx2c.
2. **Triage Dependabot** — 7 PRs ouvertes dont 4 majeures sensibles (Sentry 8→10, Tailwind 3→4, Node 20→26, lucide 0→1).
3. **Hardware Pi physique** — Tier 1 MVP (~250 €) à commander pour valider le firmware sur de vrais GPIO.

## Ce qui NE doit PAS être modifié sans accord
- Le schéma SQL `database/schema.sql` — migrations versionnées uniquement
- La logique JWT offline dans le firmware — sécurité critique
- Les types partagés dans `packages/types/` — impact cross-app
