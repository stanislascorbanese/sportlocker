# SportLocker — Monorepo

> Distributeurs IoT de matériel sportif en libre-service — service public numérique

## Structure

```
sportlocker/
├── apps/
│   ├── web/          # Site vitrine public  (HTML/CSS statique)
│   ├── mobile/       # App iOS & Android    (React Native + Expo)
│   └── dashboard/    # Dashboard opérateur  (Next.js 14)
├── services/
│   ├── api/          # Backend REST + WS    (Node.js + Fastify)
│   └── firmware/     # Agent IoT embarqué   (Python 3.11 — RPi CM4)
├── packages/
│   ├── types/        # Types TypeScript partagés
│   └── config/       # Configs ESLint, tsconfig, Prettier
├── infra/
│   ├── docker/       # Docker Compose (dev + prod)
│   └── .github/      # CI/CD GitHub Actions
├── database/
│   ├── schema.sql    # Schéma PostgreSQL complet
│   └── migrations/   # Migrations versionnées
└── docs/             # Documentation technique
```

## Démarrage rapide

```bash
# Prérequis : Node.js 20+, pnpm 9+, Docker
git clone https://github.com/your-org/sportlocker.git
cd sportlocker
cp .env.example .env          # Configurer les variables

# Démarrer l'infra locale (Postgres, Redis, EMQX)
docker compose -f infra/docker/docker-compose.dev.yml up -d

# Installer les dépendances et démarrer tous les services
pnpm install
pnpm dev
```

## URLs en développement

| Service           | URL                         |
|-------------------|-----------------------------|
| Site vitrine      | http://localhost:4000       |
| API REST          | http://localhost:3000       |
| API Docs (Swagger)| http://localhost:3000/docs  |
| Dashboard ops     | http://localhost:3001       |
| Postgres          | localhost:5432              |
| Redis             | localhost:6379              |

## Stack technique

| Couche      | Technologies                                      |
|-------------|---------------------------------------------------|
| App mobile  | React Native · Expo SDK 51 · TypeScript · Firebase|
| Backend     | Node.js 20 · Fastify 4 · PostgreSQL 16 · Redis 7  |
| IoT         | Python 3.11 · MQTT · OpenCV · paho-mqtt · Balena  |
| Infra       | Docker · GitHub Actions · AWS ECS · RDS           |

## Licence

Propriétaire — SportLocker SAS © 2026
