#!/bin/sh
set -e

# Railway (et la plupart des PaaS) exposent leur port via $PORT.
# Notre Zod env attend $API_PORT — on remap pour ne pas dupliquer la config.
if [ -n "$PORT" ]; then
  export API_PORT="$PORT"
fi

echo "[entrypoint] running database migrations…"
node ./scripts/migrate.mjs

echo "[entrypoint] starting API on port ${API_PORT:-3000}…"
exec "$@"
