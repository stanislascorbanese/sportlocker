# syntax=docker/dockerfile:1.7
#
# SportLocker API — image Docker production (Railway).
#
# Stratégie multi-stage :
#   1. builder : install workspace + compile TS → JS, puis `pnpm deploy --prod`
#                pour aplatir le workspace dans /out (autonome, sans symlinks).
#   2. runtime : node:20-alpine + /out + database/ + scripts/ + entrypoint.
#
# Le boot exécute scripts/migrate.mjs avant `node dist/index.js` (cf. entrypoint.sh).

# ─── Stage 1 : build ─────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# pnpm via corepack (version pin matchée sur package.json#packageManager)
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /repo

# Manifests d'abord, pour bénéficier du cache Docker quand seules les sources changent
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY services/api/package.json                services/api/
COPY packages/types/package.json              packages/types/
COPY packages/config/package.json             packages/config/

# Install : on filtre sur l'API + ses workspace deps transitives
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter "@sportlocker/api..."

# Sources
COPY services/api  services/api
COPY packages/types packages/types

# Compile TS → JS dans services/api/dist
RUN pnpm --filter @sportlocker/api build

# Bundle autonome (prod deps + dist + package.json) dans /out
RUN pnpm --filter @sportlocker/api --prod deploy /out

# ─── Stage 2 : runtime ───────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# wget pour le HEALTHCHECK Docker (Railway probe via /health/ aussi)
RUN apk add --no-cache wget

WORKDIR /app
ENV NODE_ENV=production

# Application déployée (dist + node_modules + package.json à plat)
COPY --from=builder /out/dist          ./dist
COPY --from=builder /out/node_modules  ./node_modules
COPY --from=builder /out/package.json  ./

# SQL nécessaires au migrateur runtime
COPY --from=builder /repo/database                  ./database
COPY --from=builder /repo/services/api/scripts      ./scripts
COPY --from=builder /repo/services/api/entrypoint.sh ./entrypoint.sh

RUN chmod +x ./entrypoint.sh ./scripts/migrate.mjs && \
    chown -R node:node /app

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:${PORT:-3000}/health/" || exit 1

ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "dist/index.js"]
