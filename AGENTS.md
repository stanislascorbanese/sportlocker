# SportLocker — Contexte projet pour Claude Code

## C'est quoi SportLocker ?

Des bornes de casiers connectés installées **dans des campings de la côte
atlantique**. Le vacancier scanne le QR code collé sur la borne, s'identifie avec
son **numéro de séjour et son nom**, un casier s'ouvre, il emprunte un ballon ou
une raquette, il rend.

**SportLocker vend un équipement et un logiciel. Point.** Il n'encaisse jamais
d'argent du vacancier. Si le camping facture le prêt, la ligne part sur le compte
séjour via son PMS.

Modèle : borne 4 500 € HT installée + 790 €/saison d'abonnement, ou location
saisonnière 349 €/mois sur 6 mois.

> ### ⚠️ Ce qui a été abandonné en septembre 2026
>
> Le projet a pivoté. Avant, il visait les **communes** avec une **marketplace**
> où le citoyen payait chaque location et où SportLocker prélevait **25 % de
> commission** via Stripe Connect. Ce modèle est mort, pour trois raisons :
>
> 1. Prélever une commission sur des recettes communales tombe hors de la liste
>    limitative de l'article **L. 1611-7-1 du CGCT** — c'est de la gestion de fait.
> 2. **Equip Sport** (250 stations, contrat Ville de Paris, matériel financé par
>    Decathlon) et **BoxUp/SMC2** occupent déjà ce marché, **gratuitement pour
>    l'usager**. Equip Sport est installé à Saint-Nazaire depuis décembre 2023.
>    L'ancienne affirmation « aucun concurrent direct en France » était fausse.
> 3. Le financement public invoqué n'existe plus : plans « 5000 terrains » clos,
>    aucun volet ANS 2026 sur les équipements de proximité, et une dotation
>    d'investissement ne finance jamais un abonnement de fonctionnement.
>
> **Ne réintroduis ni paiement vacancier, ni commission, ni caution bancaire, ni
> compte utilisateur, ni cible communale sans que Stanislas l'ait explicitement
> demandé.** Le code correspondant n'est pas supprimé, il est gelé — voir
> `docs/PERIMETRE.md`.

**À lire avant toute décision produit :**
- `docs/CDC.md` (v2) — le quoi et le pourquoi
- `docs/PERIMETRE.md` — ce qui est gelé, fichier par fichier
- `docs/API-VACANCIER.md` — le contrat des cinq routes de l'app vacancier
- `SportLocker-Docs/Documents/SportLocker_Refonte_2026.md` — l'analyse qui justifie le pivot

## Stack technique
- **App vacancier** : Next.js 15 — `apps/citizen`. Reconstruite en septembre 2026 : 4 routes, aucun compte, aucun paiement. Mode démo via `NEXT_PUBLIC_DEMO=1`.
- **Dashboard camping** : Next.js 15 + Firebase Auth — `apps/dashboard`. Écrans du quotidien : `/reassort` et `/non-rendus`.
- **Site vitrine** : Astro statique — `apps/web` (www.sportlocker.fr)
- **Backend API** : Node.js 20 + Fastify 4 + TypeScript + Drizzle ORM + PostgreSQL 16 + Redis 7 + BullMQ
- **Firmware IoT** : Python 3.11 sur Raspberry Pi CM4 — MQTT paho, OpenCV+pyzbar (QR), pyhon-jose (JWT offline), llrpy (RFID)
- **Infra** : Docker Compose (dev) · AWS ECS (prod) · EMQX Cloud (MQTT broker) · Balena.io (OTA firmware)
- **Monorepo** : pnpm workspaces + Turborepo
- **Design system** : preset Tailwind unique dans `packages/config/tailwind` + jetons clair/sombre (`tokens.css`). Les trois applications l'utilisent — ne redéfinis pas une couleur ailleurs.

## Architecture dossiers
```
sportlocker/
├── apps/web/          Site vitrine Astro (www.sportlocker.fr)
├── apps/citizen/      App vacancier Next.js 15 (app.sportlocker.fr)
├── apps/dashboard/    Dashboard opérateur Next.js 15 (ops.sportlocker.fr)
├── services/api/      Backend Fastify — routes REST (api.sportlocker.fr)
├── services/firmware/ Agent Python embarqué Raspberry Pi
├── packages/types/    Types TypeScript partagés
├── packages/config/   ESLint + tsconfig + preset Tailwind partagé
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
- **Modèle tarifaire** : ❌ gelé. `pricing_rules`, slots et day pass ne sont plus alimentés. Un emprunt n'a pas de prix. La règle « max 1 emprunt vivant par personne » reste, elle, en vigueur.
- **Paiement Stripe** : ❌ gelé en totalité (Stripe, Stripe Connect, webhooks, wallet, cautions). Le code reste en place, le drapeau est coupé. Voir `docs/PERIMETRE.md`.
- **Trust score (PR #259)** : pénalité automatique sur retour overdue (cron `detect-overdue`)
- **Articles premium** : ❌ gelé, sans objet sans tarification.
- **Identification du vacancier** : numéro de séjour + nom de famille, comparés sans tenir compte de la casse ni des accents. Aucun compte, aucun mot de passe, aucun e-mail.

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
