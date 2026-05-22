#!/usr/bin/env bash
# E2E firmware-sim — Phase 4
#
# Orchestre un test end-to-end SANS hardware physique :
#   1. Démarre la stack docker (postgres + mosquitto + firmware-sim)
#   2. Applique schema + migrations
#   3. Seed un distributeur + casier + résa scheduled (IDs fixes)
#   4. Boot l'API en arrière-plan (MQTT_SUBSCRIBER_ENABLED=true, secrets
#      alignés avec le firmware-sim)
#   5. Simule un scan QR via POST /v1/dev/simulate-scan
#      → vérifie que la résa passe en `active` après le roundtrip MQTT
#   6. Prolonge la résa via PATCH /v1/reservations/:id/extend
#      → vérifie l'incrément extension_count + maj due_at
#   7. Confirme le retour via POST /v1/reservations/:id/return
#      → vérifie la résa `returned`, le casier `idle`
#   8. Vérifie que locker_events contient bien [opened, extended, returned]
#   9. Cleanup propre (API arrêtée, containers stoppés)
#
# Usage :
#   ./scripts/e2e-firmware-sim.sh
#   ./scripts/e2e-firmware-sim.sh --keep-running   # ne stoppe pas les containers
#
# Code retour : 0 si toutes les assertions passent, 1 sinon.

set -euo pipefail

# Couleurs (no-op si pas un terminal).
if [ -t 1 ]; then GREEN='\033[32m'; RED='\033[31m'; CYAN='\033[36m'; OFF='\033[0m'
else GREEN=''; RED=''; CYAN=''; OFF=''
fi

step()  { printf "${CYAN}▶ %s${OFF}\n" "$1"; }
ok()    { printf "${GREEN}✓ %s${OFF}\n" "$1"; }
die()   { printf "${RED}✗ %s${OFF}\n" "$1" >&2; exit 1; }

KEEP_RUNNING=false
[[ "${1:-}" == "--keep-running" ]] && KEEP_RUNNING=true

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
COMPOSE_FILE="$REPO_ROOT/infra/docker/docker-compose.dev.yml"
API_DIR="$REPO_ROOT/services/api"
API_LOG="/tmp/e2e-fw-sim-api.log"
API_PID_FILE="/tmp/e2e-fw-sim-api.pid"

# Secret partagé firmware-sim ↔ API (cf. docker-compose.dev.yml).
export JWT_DEVICE_SECRET=dev-jwt-device-secret-change-me-32+
export JWT_SESSION_SECRET=$(printf 'a%.0s' {1..64})

PG_URL="postgres://sportlocker:devpassword@localhost:5432/sportlocker_dev"
MQTT_URL="mqtt://localhost:1883"
API_URL="http://localhost:3000"

cleanup() {
  local rc=$?
  step "Cleanup"
  if [ -f "$API_PID_FILE" ]; then
    kill "$(cat "$API_PID_FILE")" 2>/dev/null || true
    rm -f "$API_PID_FILE"
  fi
  if ! $KEEP_RUNNING; then
    docker compose -f "$COMPOSE_FILE" stop firmware-sim mosquitto postgres > /dev/null 2>&1 || true
  fi
  exit $rc
}
trap cleanup EXIT

# ─── 1. Stack docker ─────────────────────────────────────────────────────

step "Démarre postgres + mosquitto + firmware-sim"
docker compose -f "$COMPOSE_FILE" up -d postgres mosquitto firmware-sim > /dev/null
ok "containers up"

step "Attend Postgres prêt"
for i in {1..20}; do
  if docker exec sportlocker-postgres pg_isready -U sportlocker -d sportlocker_dev > /dev/null 2>&1; then
    ok "postgres ready"; break
  fi
  sleep 1
  [ "$i" -eq 20 ] && die "postgres pas prêt après 20s"
done

# ─── 2. Schema + migrations ──────────────────────────────────────────────

step "Applique schema + migrations"
docker exec -i sportlocker-postgres psql -U sportlocker -d sportlocker_dev -q \
  < "$REPO_ROOT/database/schema.sql" > /dev/null 2>&1
for m in "$REPO_ROOT"/database/migrations/*.sql; do
  docker exec -i sportlocker-postgres psql -U sportlocker -d sportlocker_dev -q < "$m" > /dev/null 2>&1
done
docker exec -i sportlocker-postgres psql -U sportlocker -d sportlocker_dev -q -c \
  "TRUNCATE TABLE locker_events, distributor_heartbeats, reviews, reservations,
                  lockers, items, item_types, distributors, users, communes
   RESTART IDENTITY CASCADE" > /dev/null
ok "schema + migrations + truncate ok"

# ─── 3. Seed ─────────────────────────────────────────────────────────────

step "Seed démo firmware-sim"
SEED_JSON=$(DATABASE_URL="$PG_URL" JWT_SESSION_SECRET="$JWT_SESSION_SECRET" \
  node "$API_DIR/scripts/seed-firmware-sim.mjs")
RESA_ID=$(echo "$SEED_JSON" | node -e 'process.stdin.on("data",d=>{process.stdout.write(JSON.parse(d).reservationId)})')
LOCKER_ID=$(echo "$SEED_JSON" | node -e 'process.stdin.on("data",d=>{process.stdout.write(JSON.parse(d).lockerId)})')
SESSION_TOKEN=$(echo "$SEED_JSON" | node -e 'process.stdin.on("data",d=>{process.stdout.write(JSON.parse(d).sessionToken)})')
[ -z "$RESA_ID" ] && die "seed n'a pas retourné de reservationId"
ok "seed → résa $RESA_ID, locker $LOCKER_ID"

# ─── 4. Boot API ─────────────────────────────────────────────────────────

step "Boot API (MQTT_SUBSCRIBER_ENABLED=true)"
# Si le port 3000 est déjà pris (autre API qui tourne), kill before.
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
(
  cd "$API_DIR"
  DATABASE_URL="$PG_URL" \
  MQTT_URL="$MQTT_URL" \
  MQTT_SUBSCRIBER_ENABLED=true \
  JWT_SESSION_SECRET="$JWT_SESSION_SECRET" \
  JWT_DEVICE_SECRET="$JWT_DEVICE_SECRET" \
  NODE_ENV=development \
  LOG_LEVEL=info \
  pnpm tsx src/index.ts > "$API_LOG" 2>&1 &
  echo $! > "$API_PID_FILE"
)
# Attend que l'API soit ready + ait subscribed au broker.
for i in {1..30}; do
  if curl -s -o /dev/null -w '%{http_code}' "$API_URL/health/" | grep -q 200; then
    if grep -q 'mqtt_subscribed' "$API_LOG"; then
      ok "api up + mqtt subscribed"; break
    fi
  fi
  sleep 0.5
  [ "$i" -eq 30 ] && { tail -30 "$API_LOG"; die "api pas prêt après 15s"; }
done

# ─── 5. Simulate scan ────────────────────────────────────────────────────

step "POST /v1/dev/simulate-scan"
SCAN_RES=$(curl -s -X POST "$API_URL/v1/dev/simulate-scan" \
  -H "Content-Type: application/json" \
  -d "{\"reservationId\": \"$RESA_ID\"}")
echo "  → $SCAN_RES"
echo "$SCAN_RES" | grep -q '"topic"' || die "simulate-scan a échoué"

# Attend que le roundtrip MQTT (cmd/open → firmware → door_unlocked → API) se termine.
for i in {1..20}; do
  STATUS=$(docker exec -i sportlocker-postgres psql -U sportlocker -d sportlocker_dev -t -A \
    -c "SELECT status FROM reservations WHERE id = '$RESA_ID'")
  if [ "$STATUS" = "active" ]; then
    ok "résa passée en active (${i}/20 cycles)"
    break
  fi
  sleep 0.5
  [ "$i" -eq 20 ] && die "résa n'est pas passée en active (status=$STATUS)"
done

LSTATE=$(docker exec -i sportlocker-postgres psql -U sportlocker -d sportlocker_dev -t -A \
  -c "SELECT state FROM lockers WHERE id = '$LOCKER_ID'")
[ "$LSTATE" = "active" ] || die "locker pas en active (state=$LSTATE)"
ok "locker passé en active"

# ─── 6. Extend ───────────────────────────────────────────────────────────

step "PATCH /v1/reservations/:id/extend (Prolonger)"
DUE_BEFORE=$(docker exec -i sportlocker-postgres psql -U sportlocker -d sportlocker_dev -t -A \
  -c "SELECT extract(epoch FROM due_at)::int FROM reservations WHERE id = '$RESA_ID'")
EXTEND_RES=$(curl -s -X PATCH "$API_URL/v1/reservations/$RESA_ID/extend" \
  -H "Authorization: Bearer $SESSION_TOKEN")
echo "  → $EXTEND_RES"
echo "$EXTEND_RES" | grep -q '"id"' || die "extend a échoué : $EXTEND_RES"

DUE_AFTER=$(docker exec -i sportlocker-postgres psql -U sportlocker -d sportlocker_dev -t -A \
  -c "SELECT extract(epoch FROM due_at)::int FROM reservations WHERE id = '$RESA_ID'")
EXT_COUNT=$(docker exec -i sportlocker-postgres psql -U sportlocker -d sportlocker_dev -t -A \
  -c "SELECT extension_count FROM reservations WHERE id = '$RESA_ID'")
[ "$EXT_COUNT" = "1" ] || die "extension_count attendu 1, reçu $EXT_COUNT"
[ "$DUE_AFTER" -gt "$DUE_BEFORE" ] || die "due_at pas étendu ($DUE_BEFORE → $DUE_AFTER)"
DELTA=$((DUE_AFTER - DUE_BEFORE))
ok "extension_count=1, due_at +${DELTA}s (~60min attendu)"

# ─── 7. Return ───────────────────────────────────────────────────────────

step "POST /v1/reservations/:id/return"
# returnLockerId = même que lockerId (le citoyen rend dans le même casier).
RETURN_RES=$(curl -s -X POST "$API_URL/v1/reservations/$RESA_ID/return" \
  -H "Authorization: Bearer $SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"returnLockerId\": \"$LOCKER_ID\", \"returnDistributorId\": \"00000000-0000-0000-0000-000000000000\"}")
echo "  → $RETURN_RES"
echo "$RETURN_RES" | grep -q '"id"' || die "return a échoué : $RETURN_RES"

RSTATUS=$(docker exec -i sportlocker-postgres psql -U sportlocker -d sportlocker_dev -t -A \
  -c "SELECT status FROM reservations WHERE id = '$RESA_ID'")
[ "$RSTATUS" = "returned" ] || die "résa pas returned (status=$RSTATUS)"
LSTATE2=$(docker exec -i sportlocker-postgres psql -U sportlocker -d sportlocker_dev -t -A \
  -c "SELECT state FROM lockers WHERE id = '$LOCKER_ID'")
[ "$LSTATE2" = "idle" ] || die "locker pas idle après return (state=$LSTATE2)"
ok "résa returned + locker idle"

# ─── 8. Audit locker_events ──────────────────────────────────────────────

step "Vérifie locker_events"
EVENTS=$(docker exec -i sportlocker-postgres psql -U sportlocker -d sportlocker_dev -t -A \
  -c "SELECT string_agg(event_type::text, ',' ORDER BY created_at)
       FROM locker_events WHERE reservation_id = '$RESA_ID'")
[ "$EVENTS" = "opened,extended,returned" ] || die "events attendus 'opened,extended,returned', reçu '$EVENTS'"
ok "locker_events = $EVENTS"

printf "\n${GREEN}═══════════════════════════════════════════════════════${OFF}\n"
printf "${GREEN}  E2E firmware-sim : SUCCÈS COMPLET${OFF}\n"
printf "${GREEN}═══════════════════════════════════════════════════════${OFF}\n\n"
