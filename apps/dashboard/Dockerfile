# syntax=docker/dockerfile:1.7
#
# SportLocker Dashboard — image Docker production (Railway).
#
# Stratégie multi-stage :
#   1. builder : install workspace (devDeps incluses pour tailwind/postcss/ts),
#                `next build`, puis `pnpm deploy --prod` pour bundler les prod
#                deps + sources dans /out (autonome, sans symlinks workspace).
#   2. runtime : node:20-alpine + /out + .next + public, démarre `next start`.
#
# Pourquoi un Dockerfile plutôt que Nixpacks : le Dockerfile auto-généré par
# Nixpacks ARG/ENV-ifie tous les vars Railway du service (incl. secrets type
# DASHBOARD_ADMIN_TOKEN, JWT_SESSION_SECRET), ce qui déclenche les warnings
# BuildKit `SecretsUsedInArgOrEnv`. Ici on contrôle exactement les ENV de
# l'image (aucun secret n'est gravé), aligné sur services/api et apps/web.

# ─── Stage 1 : build ─────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# pnpm via corepack (version pin matchée sur package.json#packageManager)
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /repo

# Manifests d'abord — cache Docker tant que les manifests ne bougent pas.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/dashboard/package.json   apps/dashboard/
COPY packages/types/package.json   packages/types/
COPY packages/config/package.json  packages/config/

# Install : filtre sur le dashboard + workspace deps transitives.
#
# `--ignore-scripts` : pnpm parcourt tout le lockfile pour vérifier la
# cohérence, ce qui déclenche les postinstall des deps hors filtre
# (notamment react-native-screens dans apps/mobile qui requiert
# `bob`/`husky` non installés). Le dashboard n'a aucun postinstall
# critique → safe à skip.
#
# devDependencies incluses (NODE_ENV pas encore = production) :
# next build a besoin de tailwindcss, postcss, autoprefixer, typescript.
RUN pnpm install --frozen-lockfile --filter "@sportlocker/dashboard..." --ignore-scripts

# Sources
COPY apps/dashboard   apps/dashboard
COPY packages/types   packages/types

# Compile @sportlocker/types → dist/ (les exports du paquet pointent sur
# ./dist/index.js ; requis par `next build` ET par `pnpm deploy --prod`
# plus bas, qui n'embarque que dist/ via le champ files du package.json)
RUN pnpm --filter @sportlocker/types build

# Désactive la télémétrie Next.js au build
ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_* sont bakés dans le bundle client au build par Next.js.
# Railway les injecte comme build args si on les déclare avec ARG ici.
# Sans valeur, le build passe mais l'app cliente plante au runtime
# (`Firebase config manquante`) → set ces variables dans Service →
# Variables. Mêmes valeurs publiques que pour apps/citizen.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID

# Compile (génère apps/dashboard/.next)
RUN pnpm --filter @sportlocker/dashboard build

# Bundle autonome : prod deps + sources du package (sans devDeps) dans /out.
# Note : pnpm deploy ignore les fichiers .gitignored, donc .next n'y est pas.
RUN pnpm --filter @sportlocker/dashboard --prod deploy /out && \
    cp -r /repo/apps/dashboard/.next /out/.next

# ─── Stage 2 : runtime ───────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# wget pour le HEALTHCHECK Docker (Railway probe aussi via healthcheckPath)
# tzdata + TZ=Europe/Paris pour que les Server Components Next.js formatent
# les dates en heure locale française (toLocaleString sans timeZone explicite
# utilise TZ du process). Sans ça, le container Railway tourne en UTC et
# affiche 08:54 au lieu de 10:54 dans la liste des réservations.
RUN apk add --no-cache wget tzdata
ENV TZ=Europe/Paris

# pnpm pin via npm — nécessaire UNIQUEMENT parce que Railway a un Start
# Command custom `pnpm --filter @sportlocker/dashboard start` qui override
# le CMD du Dockerfile. Sans pnpm ici, le container crash au démarrage avec
# "The executable `pnpm` could not be found".
#
# Pourquoi pas corepack ? Le bundle issu de `pnpm deploy` est un sous-dossier
# du workspace SANS `pnpm-workspace.yaml`, et `package.json` du dashboard
# ne porte pas la directive `packageManager`. Du coup `corepack prepare`
# au build ne fige rien et `corepack enable` télécharge la dernière version
# au premier appel — actuellement pnpm 11 qui exige Node 22 (crash avec
# `No such built-in module: node:sqlite`) et qu'on ne peut pas faire
# tourner sur node:20-alpine.
#
# `npm install -g` est déterministe : pin exact, pas de réseau au boot.
# À retirer si on aligne le Start Command Railway sur le CMD `next start`.
RUN npm install -g pnpm@9.0.0

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001

# Bundle déployé (node_modules prod + package.json + sources + .next)
COPY --from=builder /out ./

RUN chown -R node:node /app

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:${PORT:-3001}/" || exit 1

# Fallback si lancé sans override Railway : `next start` lit PORT directement.
CMD ["node_modules/.bin/next", "start"]
