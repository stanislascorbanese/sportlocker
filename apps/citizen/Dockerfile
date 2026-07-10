# syntax=docker/dockerfile:1.7
#
# SportLocker Citizen — PWA Next.js 15 (SSR + RSC).
#
# Single-stage (vs apps/web qui sert statique avec `serve`) parce que Next 15
# en SSR a besoin du runtime Node + node_modules pour rendre les pages côté
# serveur via `next start`.
#
# Builder Railway : DOCKERFILE (cf. apps/citizen/railway.json) — on évite
# Railpack qui ne sait pas démarrer un workspace pnpm sans config externe.

FROM node:20-alpine AS app

# pnpm via corepack (version épinglée par packageManager dans package.json racine)
RUN corepack enable

WORKDIR /repo

# Manifests racine + workspaces (cache Docker layer si pas de changement)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json turbo.json ./
COPY apps/citizen/package.json ./apps/citizen/
COPY packages/types/package.json ./packages/types/

# Install scoped sur @sportlocker/citizen + workspace deps (types).
# --ignore-scripts : évite les postinstalls d'apps/mobile (bob/husky absents).
# --prod=false : Railway met NODE_ENV=production, or `next build` a besoin des
#   devDeps (tailwindcss, typescript, postcss…).
RUN corepack prepare pnpm@9.0.0 --activate \
  && pnpm install --filter @sportlocker/citizen... --frozen-lockfile --ignore-scripts --prod=false

# Sources des packages workspace utilisés + de l'app
COPY packages/types ./packages/types
COPY apps/citizen ./apps/citizen

# Compile @sportlocker/types → dist/ (les exports du paquet pointent sur
# ./dist/index.js ; sans ce build, webpack ne résout pas le module au
# `next build` → « Module not found: Can't resolve '@sportlocker/types' »)
RUN pnpm --filter @sportlocker/types build

# NEXT_PUBLIC_* sont bakés dans le bundle client au build par Next.js.
# Railway les injecte comme build args si on les déclare avec ARG ici.
# Sans valeur, le build passe mais l'app ne pourra pas joindre Firebase/API
# côté client → set ces variables dans Service → Variables → "Build Args".
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
# Clé publique Stripe (pk_test_… / pk_live_…). Requise seulement quand l'API
# tourne en PAYMENTS_PROVIDER=stripe ; vide en mode simulate (build OK quand même).
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

RUN pnpm --filter @sportlocker/citizen build

ENV NODE_ENV=production
ENV PORT=3002
EXPOSE 3002

# `sh -c` pour interpoler $PORT au runtime (Railway l'injecte).
CMD ["sh", "-c", "pnpm --filter @sportlocker/citizen start"]
