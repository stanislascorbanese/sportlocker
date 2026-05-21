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

# Désactive la télémétrie Next.js au build
ENV NEXT_TELEMETRY_DISABLED=1

# Compile (génère apps/dashboard/.next)
RUN pnpm --filter @sportlocker/dashboard build

# Bundle autonome : prod deps + sources du package (sans devDeps) dans /out.
# Note : pnpm deploy ignore les fichiers .gitignored, donc .next n'y est pas.
RUN pnpm --filter @sportlocker/dashboard --prod deploy /out && \
    cp -r /repo/apps/dashboard/.next /out/.next

# ─── Stage 2 : runtime ───────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# wget pour le HEALTHCHECK Docker (Railway probe aussi via healthcheckPath)
RUN apk add --no-cache wget

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

# `next start` lit PORT directement
CMD ["node_modules/.bin/next", "start"]
