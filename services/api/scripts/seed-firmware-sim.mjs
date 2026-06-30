#!/usr/bin/env node
/**
 * Seed dédié à la démo firmware-sim (Phase 4).
 *
 * Reproduit en une commande l'état DB que le smoke test E2E utilise :
 *   - distributeur fixe ``00000000-0000-0000-0000-000000000000`` (matche
 *     DEVICE_ID du firmware-sim dans docker-compose.dev.yml)
 *   - 4 casiers ``11111111…``, ``22222222…``, ``33333333…``, ``44444444…``
 *     (matche infra/docker/firmware-sim/calibration.json)
 *   - 1 user citoyen avec firebase_uid ``demo-fw-sim-citizen``
 *   - 1 résa scheduled sur le casier ``11111111…`` avec dueAt +30min
 *     (prêt à recevoir un simulate-scan)
 *
 * Idempotent : ON CONFLICT DO UPDATE sur clés naturelles. Re-runnable sans
 * crash.
 *
 * Output : un JSON `{ reservationId, userId, lockerId, distributorId,
 *                     sessionToken }` sur stdout, prêt à être piped vers
 * `jq` dans un script bash. Le sessionToken est un JWT @fastify/jwt forgé
 * directement via jose pour pouvoir appeler /v1/reservations/:id/extend
 * et /return sans passer par Firebase.
 */
import postgres from 'postgres'
import { SignJWT } from 'jose'

const url = process.env.DATABASE_URL
const sessionSecret = process.env.JWT_SESSION_SECRET
if (!url) { console.error('[seed-fw-sim] DATABASE_URL not set'); process.exit(1) }
if (!sessionSecret) { console.error('[seed-fw-sim] JWT_SESSION_SECRET not set'); process.exit(1) }

const sql = postgres(url, { max: 1, onnotice: () => undefined, connect_timeout: 10 })

// ─── IDs fixes (à matcher avec firmware-sim) ───────────────────────────────

const DISTRIBUTOR_ID = '00000000-0000-0000-0000-000000000000'
const LOCKER_IDS = [
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444',
]
const COMMUNE_INSEE = '75056'
const ITEM_TYPE_SLUG = 'demo-fw-sim-ballon'
const ITEM_RFID = 'demo-fw-sim-rfid-1'
const USER_FB_UID = 'demo-fw-sim-citizen'

async function main() {
  // 1. Commune
  const [commune] = await sql`
    INSERT INTO communes (insee_code, name, postal_code, department, region)
    VALUES (${COMMUNE_INSEE}, 'Paris (demo fw-sim)', '75001', '75', 'Île-de-France')
    ON CONFLICT (insee_code) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `
  const communeId = commune.id

  // 2. Distributeur (id fixe = DEVICE_ID firmware-sim)
  await sql`
    INSERT INTO distributors (id, serial_number, commune_id, name, locker_count, status)
    VALUES (${DISTRIBUTOR_ID}, 'FW-SIM-DEMO', ${communeId}, 'Demo firmware-sim', 4, 'offline')
    ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status
  `

  // 3. Item type + 1 item
  const [itemType] = await sql`
    INSERT INTO item_types (slug, name, category, max_duration_minutes)
    VALUES (${ITEM_TYPE_SLUG}, 'Ballon de démo', 'ballon', 60)
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `
  const [item] = await sql`
    INSERT INTO items (item_type_id, rfid_tag)
    VALUES (${itemType.id}, ${ITEM_RFID})
    ON CONFLICT (rfid_tag) DO UPDATE SET item_type_id = EXCLUDED.item_type_id
    RETURNING id
  `
  const itemId = item.id

  // 4. 4 casiers — id fixes, position 0..3. Le casier 0 contient l'item.
  for (let i = 0; i < LOCKER_IDS.length; i++) {
    const id = LOCKER_IDS[i]
    const state = i === 0 ? 'reserved' : 'idle'
    const currentItem = i === 0 ? itemId : null
    await sql`
      INSERT INTO lockers (id, distributor_id, position, state, current_item_id)
      VALUES (${id}, ${DISTRIBUTOR_ID}, ${i}, ${state}::locker_state, ${currentItem})
      ON CONFLICT (id) DO UPDATE
        SET state = EXCLUDED.state, current_item_id = EXCLUDED.current_item_id
    `
  }

  // 5. User citoyen
  const [user] = await sql`
    INSERT INTO users (firebase_uid, email, display_name, role)
    VALUES (${USER_FB_UID}, 'demo-fw-sim@sportlocker.test', 'Demo Citoyen fw-sim', 'citizen')
    ON CONFLICT (firebase_uid) DO UPDATE SET display_name = EXCLUDED.display_name
    RETURNING id
  `
  const userId = user.id

  // 6. Reset éventuelle ancienne résa du user → propre pour rejouer le smoke.
  await sql`
    DELETE FROM reservations
    WHERE user_id = ${userId} AND status IN ('scheduled', 'pending', 'active', 'returned')
  `

  // 7. Réservation scheduled (résa qu'on va "scanner" via simulate-scan).
  // dueAt = +30 min pour que /extend ait un dueAt à prolonger.
  const dueAt = new Date(Date.now() + 30 * 60 * 1000)
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000)  // pour le QR
  const [resa] = await sql`
    INSERT INTO reservations
      (user_id, locker_id, item_id, distributor_id, status, qr_jti, expires_at, due_at)
    VALUES
      (${userId}, ${LOCKER_IDS[0]}, ${itemId}, ${DISTRIBUTOR_ID},
       'scheduled', ${'demo-fw-sim-' + Date.now()}, ${expiresAt}, ${dueAt})
    RETURNING id
  `

  // 8. Sign un JWT session @fastify/jwt-compatible pour pouvoir appeler
  // /extend et /return dans le script bash sans passer par Firebase.
  // (fast-jwt en backend utilise HS256 + le claim "sub" = userId + "role")
  const sessionToken = await new SignJWT({ sub: userId, role: 'citizen' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(sessionSecret))

  process.stdout.write(JSON.stringify({
    reservationId: resa.id,
    userId,
    lockerId: LOCKER_IDS[0],
    distributorId: DISTRIBUTOR_ID,
    sessionToken,
  }) + '\n')

  await sql.end()
}

main().catch((err) => { console.error(err); process.exit(1) })
