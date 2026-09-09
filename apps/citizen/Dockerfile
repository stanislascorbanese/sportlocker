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
COPY packages/config/package.json ./packages/config/

# Install scoped sur @sportlocker/citizen + ses dépendances d'espace de travail
# (aujourd'hui : @sportlocker/config, qui porte le preset Tailwind partagé).
# --ignore-scripts : évite les postinstalls d'apps/mobile (bob/husky absents).
# --prod=false : Railway met NODE_ENV=production, or `next build` a besoin des
#   devDeps (tailwindcss, typescript, postcss…).
RUN corepack prepare pnpm@9.0.0 --activate \
  && pnpm install --filter @sportlocker/citizen... --frozen-lockfile --ignore-scripts --prod=false

# Sources des packages workspace utilisés + de l'app.
# @sportlocker/config n'a rien à compiler : il expose directement du .cjs et du
# .css, contrairement à @sportlocker/types dont l'app vacancier ne dépend plus.
COPY packages/config ./packages/config
COPY apps/citizen ./apps/citizen

# NEXT_PUBLIC_* sont bakés dans le bundle client au build par Next.js.
# Railway les injecte comme build args si on les déclare avec ARG ici.
# Sans valeur, le build passe mais l'app ne pourra pas joindre Firebase/API
# côté client → set ces variables dans Service → Variables → "Build Args".
# L'app vacancier n'a plus ni Firebase ni Stripe. Il ne reste que deux
# variables, et elles sont bakées dans le bundle client au build — donc à
# déclarer dans Railway → Service → Variables → Build Args, pas seulement en
# variables d'exécution.
#
# NEXT_PUBLIC_DEMO=1 rejoue le parcours en mémoire, sans API. À laisser à 1
# tant que les routes /v1/kiosk/* n'existent pas côté services/api
# (cf. docs/API-VACANCIER.md), sinon l'app se connecte dans le vide.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_DEMO
ARG NEXT_PUBLIC_SENTRY_DSN

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_DEMO=$NEXT_PUBLIC_DEMO \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN

RUN pnpm --filter @sportlocker/citizen build

ENV NODE_ENV=production
ENV PORT=3002
EXPOSE 3002

# `sh -c` pour interpoler $PORT au runtime (Railway l'injecte).
CMD ["sh", "-c", "pnpm --filter @sportlocker/citizen start"]
