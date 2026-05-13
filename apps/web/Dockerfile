# syntax=docker/dockerfile:1.7
#
# SportLocker Web — site vitrine statique (HTML).
#
# Servi par `serve` (npm package), qui écoute sur le port fourni par Railway
# via $PORT. Image volontairement triviale : pas de build step, pas de SSR.

FROM node:20-alpine

WORKDIR /app

# `serve` v14 — petit serveur HTTP statique, supporte $PORT et SPA fallback.
RUN npm install -g serve@14

# Site = un seul fichier HTML pour le moment.
COPY apps/web/index.html ./

# Railway injecte $PORT à l'exécution ; fallback 4000 en local.
ENV PORT=4000
EXPOSE 4000

# `sh -c` pour que $PORT soit interpolé au runtime, pas au build.
CMD ["sh", "-c", "serve -s . -l ${PORT}"]
