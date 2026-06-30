# syntax=docker/dockerfile:1.7
#
# SportLocker Web — site vitrine Astro (build statique).
#
# Build multi-stage :
#   1. builder : Node 20 + pnpm, build du monorepo filtré sur @sportlocker/web
#   2. runtime : Node 20-alpine + `serve` qui sert le dist/ sur $PORT (Railway)

# ── Stage 1 : build Astro ────────────────────────────────────────────
FROM node:20-alpine AS builder

# pnpm via corepack (version épinglée par packageManager dans package.json racine)
RUN corepack enable

WORKDIR /repo

# Manifests racine + workspaces (cache Docker layer si pas de changement)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json turbo.json ./
COPY apps/web/package.json ./apps/web/

# Install scoped sur @sportlocker/web.
# --ignore-scripts : évite de déclencher les postinstalls d'autres workspaces
#   (notamment apps/mobile qui requiert bob/husky absents en runtime web).
# --prod=false : force l'install des devDeps (Railway met parfois NODE_ENV=production,
#   or astro build a besoin de tailwindcss/postcss).
RUN corepack prepare pnpm@9.0.0 --activate \
  && pnpm install --filter @sportlocker/web... --frozen-lockfile --ignore-scripts --prod=false

# Sources du site
COPY apps/web ./apps/web

# Build Astro → apps/web/dist
RUN pnpm --filter @sportlocker/web build

# ── Stage 2 : runtime statique ──────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# `serve` v14 — serveur HTTP statique léger, respecte $PORT injecté par Railway
RUN npm install -g serve@14

# On copie seulement le dist du build
COPY --from=builder /repo/apps/web/dist ./dist

# Railway injecte $PORT à l'exécution ; fallback 4000 en local.
ENV PORT=4000
EXPOSE 4000

# Astro génère un site MULTI-PAGES (dist/contact/index.html, dist/tarifs/index.html…),
# pas une SPA. PAS de flag -s : sinon serve sert dist/index.html (la home) pour
# toute route non trouvée comme un .html littéral, écrasant les rewrites de
# serve.json et cassant /contact, /comment-ca-marche, etc.
# `sh -c` pour que $PORT soit interpolé au runtime, pas au build.
CMD ["sh", "-c", "serve dist -l ${PORT}"]
