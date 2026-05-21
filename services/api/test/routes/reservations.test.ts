/**
 * Tests d'intégration POST/GET/POST /v1/reservations.
 *
 * Stack :
 *   - Postgres 16 vanilla (postgres:16-alpine) via testcontainers — DB isolée
 *     par run, indépendante de la DB de dev.
 *   - Redis 7 via testcontainers.
 *   - schema.sql + migrations 0001 (fonction PL/pgSQL) et 0005 (index partiel
 *     unique sur user_id pour les statuts pending/active) appliqués au boot.
 *     Les migrations 0002-0004 sont déjà reflétées dans schema.sql.
 *   - TRUNCATE entre tests, flushdb Redis entre tests.
 *
 * `app.inject(...)` (pas de port bindé) pour gagner en vitesse.
 * Le JWT de session est forgé via `app.jwt.sign(...)` (plugin @fastify/jwt).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { GenericContainer, type StartedTestContainer } from 'testcontainers'
import postgres from 'postgres'
import IORedis from 'ioredis'
import { jwtVerify, SignJWT } from 'jose'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..', '..', '..')
const SCHEMA_PATH = join(REPO_ROOT, 'database', 'schema.sql')
// schema.sql ne contient PAS la fonction PL/pgSQL (migration 0001) ni l'index
// partiel unique d'unicité de la réservation vivante (migration 0005). Les
// autres migrations (0002-0004) sont déjà reflétées dans schema.sql.
const MIGRATION_PATHS = [
  join(REPO_ROOT, 'database', 'migrations', '0001_fn_locker_is_available.sql'),
  join(REPO_ROOT, 'database', 'migrations', '0005_reservations_unique_active.sql'),
]

let pgContainer: StartedPostgreSqlContainer
let redisContainer: StartedTestContainer
let pgSql: ReturnType<typeof postgres>
let redisClient: IORedis
let app: FastifyInstance

interface Fixtures {
  userId: string
  communeId: string
  distributorId: string
  itemTypeId: string
  itemId: string
  lockerId: string
  returnLockerId: string
}

async function seedAll(): Promise<Fixtures> {
  const userId = randomUUID()
  const communeId = randomUUID()
  const distributorId = randomUUID()
  const itemTypeId = randomUUID()
  const itemId = randomUUID()
  const lockerId = randomUUID()
  const returnLockerId = randomUUID()

  await pgSql`INSERT INTO users (id, firebase_uid, email)
    VALUES (${userId}, ${'fb-' + userId.slice(0, 8)}, ${userId.slice(0, 8) + '@test.local'})`

  await pgSql`INSERT INTO communes (id, insee_code, name, postal_code, department, region)
    VALUES (${communeId}, ${'7' + Math.floor(Math.random() * 9000 + 1000)},
            'Paris Test', '75001', '75', 'IDF')`

  await pgSql`INSERT INTO distributors (id, serial_number, commune_id, name, latitude, longitude, locker_count)
    VALUES (${distributorId}, ${'TEST-' + distributorId.slice(0, 8)}, ${communeId},
            'Test Distributor', 48.8566, 2.3522, 4)`

  await pgSql`INSERT INTO item_types (id, slug, name, category)
    VALUES (${itemTypeId}, ${'slug-' + itemTypeId.slice(0, 8)}, 'Ballon de foot', 'ballon')`

  await pgSql`INSERT INTO items (id, item_type_id, rfid_tag)
    VALUES (${itemId}, ${itemTypeId}, ${'RFID-' + itemId.slice(0, 8)})`

  await pgSql`INSERT INTO lockers (id, distributor_id, position, state, current_item_id)
    VALUES (${lockerId}, ${distributorId}, 0, 'idle', ${itemId})`

  await pgSql`INSERT INTO lockers (id, distributor_id, position, state)
    VALUES (${returnLockerId}, ${distributorId}, 1, 'idle')`

  return { userId, communeId, distributorId, itemTypeId, itemId, lockerId, returnLockerId }
}

function authHeader(userId: string, opts: { expiresIn?: string | number } = {}): string {
  const token = app.jwt.sign({ sub: userId, role: 'citizen' }, opts)
  return `Bearer ${token}`
}

/**
 * Forge un JWT déjà expiré pour tester le path 401.
 * On contourne @fastify/jwt (fast-jwt) qui interdit `expiresIn` négatif —
 * on signe nous-même via jose avec un `exp` dans le passé.
 */
async function expiredAuthHeader(userId: string): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SESSION_SECRET!)
  const now = Math.floor(Date.now() / 1000)
  const token = await new SignJWT({ sub: userId, role: 'citizen' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now - 3600)
    .setExpirationTime(now - 10)
    .sign(secret)
  return `Bearer ${token}`
}

beforeAll(async () => {
  pgContainer = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('sportlocker_test')
    .withUsername('test')
    .withPassword('test')
    .start()

  redisContainer = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .start()

  // Env DOIT être set avant l'import de l'app (env.ts valide au chargement).
  process.env.NODE_ENV = 'test'
  process.env.DATABASE_URL = pgContainer.getConnectionUri()
  process.env.REDIS_URL = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`
  process.env.JWT_SESSION_SECRET = 'a'.repeat(64)
  process.env.JWT_DEVICE_SECRET = 'b'.repeat(64)
  process.env.LOG_LEVEL = 'fatal'

  pgSql = postgres(process.env.DATABASE_URL!, { onnotice: () => {} })
  await pgSql.unsafe(readFileSync(SCHEMA_PATH, 'utf-8'))
  for (const p of MIGRATION_PATHS) {
    await pgSql.unsafe(readFileSync(p, 'utf-8'))
  }

  redisClient = new IORedis(process.env.REDIS_URL!)

  const { buildApp } = await import('../../src/app.js')
  app = await buildApp()
}, 120_000)

afterAll(async () => {
  await app?.close()

  // BullMQ instancie des Queue au chargement de queues/index.ts — il faut les fermer
  // pour ne pas bloquer la sortie du process.
  try {
    const { queues } = await import('../../src/queues/index.js')
    await Promise.all([
      queues.expireReservations.close(),
      queues.detectOverdue.close(),
      queues.heartbeatWatchdog.close(),
      queues.rgpdAnonymize.close(),
    ])
  } catch {
    // module possiblement non chargé si buildApp a échoué
  }
  try {
    const { redis } = await import('../../src/redis/client.js')
    await redis.quit()
  } catch {
    /* ignore */
  }

  await pgSql?.end({ timeout: 5 })
  await redisClient?.quit()
  await pgContainer?.stop()
  await redisContainer?.stop()
})

beforeEach(async () => {
  await pgSql`TRUNCATE TABLE
    communes, users, distributors, lockers, items, item_types,
    reservations, token_nonces, locker_events, distributor_heartbeats,
    maintenance_tickets, push_tokens, notification_logs, reviews
    RESTART IDENTITY CASCADE`
  await redisClient.flushdb()
})

describe('POST /v1/reservations', () => {
  it('crée une réservation valide et renvoie 201 avec le nonce', async () => {
    const f = await seedAll()

    const res = await app.inject({
      method: 'POST',
      url: '/v1/reservations',
      headers: { authorization: authHeader(f.userId) },
      payload: { lockerId: f.lockerId, itemId: f.itemId, communeId: f.communeId },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.status).toBe('pending')
    expect(body.lockerId).toBe(f.lockerId)
    expect(body.itemId).toBe(f.itemId)
    expect(body.distributorId).toBe(f.distributorId)
    expect(body.nonce).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now())

    // État DB
    const reservationRows = await pgSql`SELECT status, qr_jti FROM reservations WHERE id = ${body.id}`
    expect(reservationRows).toHaveLength(1)
    expect(reservationRows[0]!.status).toBe('pending')
    expect(reservationRows[0]!.qr_jti).toBe(body.nonce)

    const nonceRows = await pgSql`SELECT reservation_id FROM token_nonces WHERE nonce = ${body.nonce}`
    expect(nonceRows).toHaveLength(1)
    expect(nonceRows[0]!.reservation_id).toBe(body.id)

    const lockerRows = await pgSql`SELECT state FROM lockers WHERE id = ${f.lockerId}`
    expect(lockerRows[0]!.state).toBe('reserved')

    const eventRows = await pgSql`SELECT event_type FROM locker_events WHERE reservation_id = ${body.id}`
    expect(eventRows).toHaveLength(1)
    expect(eventRows[0]!.event_type).toBe('reserved')
  })

  it("renvoie 409 quand le casier est déjà réservé (state != 'idle')", async () => {
    const f = await seedAll()
    await pgSql`UPDATE lockers SET state = 'reserved' WHERE id = ${f.lockerId}`

    const res = await app.inject({
      method: 'POST',
      url: '/v1/reservations',
      headers: { authorization: authHeader(f.userId) },
      payload: { lockerId: f.lockerId, itemId: f.itemId, communeId: f.communeId },
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('locker_not_available')
  })

  it("renvoie 404 quand le casier n'existe pas", async () => {
    const f = await seedAll()
    const ghostLockerId = randomUUID()

    const res = await app.inject({
      method: 'POST',
      url: '/v1/reservations',
      headers: { authorization: authHeader(f.userId) },
      payload: { lockerId: ghostLockerId, itemId: f.itemId, communeId: f.communeId },
    })

    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('locker_not_found')
  })

  it('renvoie 400 quand le body est invalide', async () => {
    const f = await seedAll()

    const res = await app.inject({
      method: 'POST',
      url: '/v1/reservations',
      headers: { authorization: authHeader(f.userId) },
      payload: { lockerId: 'not-a-uuid', itemId: f.itemId }, // communeId manquant + format
    })

    expect(res.statusCode).toBe(400)
  })

  it('renvoie 401 quand le token de session est expiré', async () => {
    const f = await seedAll()
    const expired = await expiredAuthHeader(f.userId)

    const res = await app.inject({
      method: 'POST',
      url: '/v1/reservations',
      headers: { authorization: expired },
      payload: { lockerId: f.lockerId, itemId: f.itemId, communeId: f.communeId },
    })

    expect(res.statusCode).toBe(401)
  })

  it("renvoie 409 item_mismatch si l'item demandé n'est pas dans ce casier", async () => {
    const f = await seedAll()
    const otherItemId = randomUUID()
    await pgSql`INSERT INTO items (id, item_type_id, rfid_tag)
      VALUES (${otherItemId}, ${f.itemTypeId}, ${'RFID-' + otherItemId.slice(0, 8)})`

    const res = await app.inject({
      method: 'POST',
      url: '/v1/reservations',
      headers: { authorization: authHeader(f.userId) },
      payload: { lockerId: f.lockerId, itemId: otherItemId, communeId: f.communeId },
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('item_mismatch')
  })

  it('renvoie 409 commune_mismatch si la commune ne correspond pas au distributeur', async () => {
    const f = await seedAll()
    const otherCommuneId = randomUUID()
    await pgSql`INSERT INTO communes (id, insee_code, name, postal_code, department, region)
      VALUES (${otherCommuneId}, '13001', 'Marseille', '13001', '13', 'PACA')`

    const res = await app.inject({
      method: 'POST',
      url: '/v1/reservations',
      headers: { authorization: authHeader(f.userId) },
      payload: { lockerId: f.lockerId, itemId: f.itemId, communeId: otherCommuneId },
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('commune_mismatch')
  })

  it('renvoie 409 locker_being_processed quand le verrou Redis est déjà pris', async () => {
    const f = await seedAll()
    await redisClient.set(`lock:locker:${f.lockerId}`, 'someone-else', 'EX', 30)

    const res = await app.inject({
      method: 'POST',
      url: '/v1/reservations',
      headers: { authorization: authHeader(f.userId) },
      payload: { lockerId: f.lockerId, itemId: f.itemId, communeId: f.communeId },
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('locker_being_processed')
  })

  it('renvoie un deviceToken JWT HS256 (jti=nonce, exp 15min, claims cohérents)', async () => {
    const f = await seedAll()

    const res = await app.inject({
      method: 'POST',
      url: '/v1/reservations',
      headers: { authorization: authHeader(f.userId) },
      payload: { lockerId: f.lockerId, itemId: f.itemId, communeId: f.communeId },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(typeof body.deviceToken).toBe('string')
    expect(body.deviceToken.split('.')).toHaveLength(3) // header.payload.signature

    // Le firmware utilise la même clé partagée JWT_DEVICE_SECRET pour vérifier offline.
    const secret = new TextEncoder().encode(process.env.JWT_DEVICE_SECRET!)
    const { payload, protectedHeader } = await jwtVerify(body.deviceToken, secret, {
      issuer: 'sportlocker.app',
      audience: 'sportlocker.device',
    })
    expect(protectedHeader.alg).toBe('HS256')
    expect(payload.jti).toBe(body.nonce) // jti aligné sur le nonce stocké en DB
    expect(payload.reservationId).toBe(body.id)
    expect(payload.lockerId).toBe(f.lockerId)
    expect(payload.distributorId).toBe(f.distributorId)
    const nowSec = Math.floor(Date.now() / 1000)
    expect(payload.exp).toBeGreaterThan(nowSec)
    expect(payload.exp).toBeLessThanOrEqual(nowSec + 15 * 60 + 5) // marge horloge
  })

  it("renvoie 409 already_active si le user a déjà une réservation pending", async () => {
    const f = await seedAll()

    const first = await app.inject({
      method: 'POST',
      url: '/v1/reservations',
      headers: { authorization: authHeader(f.userId) },
      payload: { lockerId: f.lockerId, itemId: f.itemId, communeId: f.communeId },
    })
    expect(first.statusCode).toBe(201)

    // 2e tentative sur un AUTRE locker (idle) → doit être bloquée pour cause de
    // résa pending déjà en cours par le même user.
    const otherItemId = randomUUID()
    const otherLockerId = randomUUID()
    await pgSql`INSERT INTO items (id, item_type_id, rfid_tag)
      VALUES (${otherItemId}, ${f.itemTypeId}, ${'RFID-' + otherItemId.slice(0, 8)})`
    await pgSql`INSERT INTO lockers (id, distributor_id, position, state, current_item_id)
      VALUES (${otherLockerId}, ${f.distributorId}, 2, 'idle', ${otherItemId})`

    const second = await app.inject({
      method: 'POST',
      url: '/v1/reservations',
      headers: { authorization: authHeader(f.userId) },
      payload: { lockerId: otherLockerId, itemId: otherItemId, communeId: f.communeId },
    })
    expect(second.statusCode).toBe(409)
    expect(second.json().error).toBe('already_active')

    // L'autre casier reste idle (pas de pollution de state suite au refus).
    const otherLockerState = await pgSql`SELECT state FROM lockers WHERE id = ${otherLockerId}`
    expect(otherLockerState[0]!.state).toBe('idle')
  })

  it("autorise une nouvelle résa après cancel de la précédente (statut 'cancelled' sort de l'index)", async () => {
    const f = await seedAll()

    const first = await app.inject({
      method: 'POST',
      url: '/v1/reservations',
      headers: { authorization: authHeader(f.userId) },
      payload: { lockerId: f.lockerId, itemId: f.itemId, communeId: f.communeId },
    })
    expect(first.statusCode).toBe(201)
    const firstId = first.json().id

    const cancel = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${firstId}/cancel`,
      headers: { authorization: authHeader(f.userId) },
    })
    expect(cancel.statusCode).toBe(200)

    // Le casier est repassé en idle → on peut re-réserver.
    const second = await app.inject({
      method: 'POST',
      url: '/v1/reservations',
      headers: { authorization: authHeader(f.userId) },
      payload: { lockerId: f.lockerId, itemId: f.itemId, communeId: f.communeId },
    })
    expect(second.statusCode).toBe(201)
  })

  it("Idempotency-Key : un retry avec la même clé renvoie la même réponse sans dupliquer en DB", async () => {
    const f = await seedAll()
    const key = randomUUID()

    const first = await app.inject({
      method: 'POST',
      url: '/v1/reservations',
      headers: { authorization: authHeader(f.userId), 'idempotency-key': key },
      payload: { lockerId: f.lockerId, itemId: f.itemId, communeId: f.communeId },
    })
    expect(first.statusCode).toBe(201)
    const firstBody = first.json()

    // Replay : même body, même clé. Doit renvoyer la même réponse cachée.
    const second = await app.inject({
      method: 'POST',
      url: '/v1/reservations',
      headers: { authorization: authHeader(f.userId), 'idempotency-key': key },
      payload: { lockerId: f.lockerId, itemId: f.itemId, communeId: f.communeId },
    })
    expect(second.statusCode).toBe(201)
    expect(second.json()).toEqual(firstBody)

    // Une seule résa en DB (pas de doublon).
    const rows = await pgSql`SELECT COUNT(*)::int AS c FROM reservations WHERE user_id = ${f.userId}`
    expect(rows[0]!.c).toBe(1)
  })

  it("Idempotency-Key vide ou absent : aucune mise en cache (chaque requête est traitée)", async () => {
    const f = await seedAll()

    // 1ère requête sans header
    const first = await app.inject({
      method: 'POST',
      url: '/v1/reservations',
      headers: { authorization: authHeader(f.userId) },
      payload: { lockerId: f.lockerId, itemId: f.itemId, communeId: f.communeId },
    })
    expect(first.statusCode).toBe(201)

    // 2e avec key vide : doit être traitée (et donc déclencher already_active)
    const second = await app.inject({
      method: 'POST',
      url: '/v1/reservations',
      headers: { authorization: authHeader(f.userId), 'idempotency-key': '   ' },
      payload: { lockerId: f.lockerId, itemId: f.itemId, communeId: f.communeId },
    })
    expect(second.statusCode).toBe(409)
    expect(second.json().error).toBe('already_active')
  })
})

describe('GET /v1/reservations/me', () => {
  it("renvoie les réservations actives de l'utilisateur", async () => {
    const f = await seedAll()

    // crée une réservation pending
    const created = await app.inject({
      method: 'POST',
      url: '/v1/reservations',
      headers: { authorization: authHeader(f.userId) },
      payload: { lockerId: f.lockerId, itemId: f.itemId, communeId: f.communeId },
    })
    expect(created.statusCode).toBe(201)

    const res = await app.inject({
      method: 'GET',
      url: '/v1/reservations/me',
      headers: { authorization: authHeader(f.userId) },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.items).toHaveLength(1)
    expect(body.items[0].status).toBe('pending')
  })
})

describe('GET /v1/reservations/active', () => {
  it('renvoie la réservation pending courante du user', async () => {
    const f = await seedAll()

    const created = await app.inject({
      method: 'POST',
      url: '/v1/reservations',
      headers: { authorization: authHeader(f.userId) },
      payload: { lockerId: f.lockerId, itemId: f.itemId, communeId: f.communeId },
    })
    expect(created.statusCode).toBe(201)
    const createdId = created.json().id

    const res = await app.inject({
      method: 'GET',
      url: '/v1/reservations/active',
      headers: { authorization: authHeader(f.userId) },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.id).toBe(createdId)
    expect(body.status).toBe('pending')
    expect(body.lockerId).toBe(f.lockerId)
  })

  it("renvoie 404 no_active_reservation quand le user n'a aucune résa vivante", async () => {
    const f = await seedAll()

    const res = await app.inject({
      method: 'GET',
      url: '/v1/reservations/active',
      headers: { authorization: authHeader(f.userId) },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('no_active_reservation')
  })

  it("renvoie 404 si la seule résa du user est 'returned' (sortie de l'index actif)", async () => {
    const f = await seedAll()
    await pgSql`INSERT INTO reservations
      (id, user_id, locker_id, item_id, distributor_id, status, qr_jti, expires_at, returned_at)
      VALUES (${randomUUID()}, ${f.userId}, ${f.lockerId}, ${f.itemId}, ${f.distributorId},
              'returned', ${randomUUID()}, NOW() - INTERVAL '1 hour', NOW() - INTERVAL '30 minutes')`

    const res = await app.inject({
      method: 'GET',
      url: '/v1/reservations/active',
      headers: { authorization: authHeader(f.userId) },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('POST /v1/reservations/:id/cancel', () => {
  it('annule une réservation pending et remet le casier en idle', async () => {
    const f = await seedAll()
    const created = await app.inject({
      method: 'POST',
      url: '/v1/reservations',
      headers: { authorization: authHeader(f.userId) },
      payload: { lockerId: f.lockerId, itemId: f.itemId, communeId: f.communeId },
    })
    const reservationId = created.json().id

    const res = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${reservationId}/cancel`,
      headers: { authorization: authHeader(f.userId) },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })

    const r = await pgSql`SELECT status FROM reservations WHERE id = ${reservationId}`
    expect(r[0]!.status).toBe('cancelled')

    const l = await pgSql`SELECT state FROM lockers WHERE id = ${f.lockerId}`
    expect(l[0]!.state).toBe('idle')
  })

  it("renvoie 404 quand la réservation n'est pas annulable", async () => {
    const f = await seedAll()
    const res = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${randomUUID()}/cancel`,
      headers: { authorization: authHeader(f.userId) },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('POST /v1/reservations/:id/return', () => {
  it('confirme le retour et passe le statut à returned', async () => {
    const f = await seedAll()
    const reservationId = randomUUID()
    const jti = randomUUID()
    await pgSql`INSERT INTO reservations
      (id, user_id, locker_id, item_id, distributor_id, status, qr_jti, expires_at, opened_at)
      VALUES (${reservationId}, ${f.userId}, ${f.lockerId}, ${f.itemId}, ${f.distributorId},
              'active', ${jti}, NOW() + INTERVAL '15 minutes', NOW())`

    const res = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${reservationId}/return`,
      headers: { authorization: authHeader(f.userId) },
      payload: {
        returnLockerId: f.returnLockerId,
        returnDistributorId: f.distributorId,
      },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('returned')
    expect(body.wasOverdue).toBe(false)
    expect(body.id).toBe(reservationId)

    const rows = await pgSql`SELECT status, returned_at, return_locker_id
                              FROM reservations WHERE id = ${reservationId}`
    expect(rows[0]!.status).toBe('returned')
    expect(rows[0]!.returned_at).not.toBeNull()
    expect(rows[0]!.return_locker_id).toBe(f.returnLockerId)

    const events = await pgSql`SELECT event_type FROM locker_events
                                WHERE reservation_id = ${reservationId} AND event_type = 'returned'`
    expect(events).toHaveLength(1)
  })

  it("accepte un retour hors délai (status='overdue' → 'returned' avec wasOverdue=true)", async () => {
    const f = await seedAll()
    const reservationId = randomUUID()
    // Seed une résa overdue : ouverte il y a 30h, due_at dépassé de 26h.
    await pgSql`INSERT INTO reservations
      (id, user_id, locker_id, item_id, distributor_id, status, qr_jti,
       expires_at, opened_at, due_at)
      VALUES (${reservationId}, ${f.userId}, ${f.lockerId}, ${f.itemId}, ${f.distributorId},
              'overdue', ${randomUUID()},
              NOW() - INTERVAL '30 hours', NOW() - INTERVAL '30 hours',
              NOW() - INTERVAL '26 hours')`

    const res = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${reservationId}/return`,
      headers: { authorization: authHeader(f.userId) },
      payload: {
        returnLockerId: f.returnLockerId,
        returnDistributorId: f.distributorId,
      },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('returned')
    expect(body.wasOverdue).toBe(true)

    const rows = await pgSql`SELECT status, returned_at
                              FROM reservations WHERE id = ${reservationId}`
    expect(rows[0]!.status).toBe('returned')
    expect(rows[0]!.returned_at).not.toBeNull()
  })

  it("renvoie 409 si la réservation n'est pas active", async () => {
    const f = await seedAll()
    const reservationId = randomUUID()
    await pgSql`INSERT INTO reservations
      (id, user_id, locker_id, item_id, distributor_id, status, qr_jti, expires_at)
      VALUES (${reservationId}, ${f.userId}, ${f.lockerId}, ${f.itemId}, ${f.distributorId},
              'pending', ${randomUUID()}, NOW() + INTERVAL '15 minutes')`

    const res = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${reservationId}/return`,
      headers: { authorization: authHeader(f.userId) },
      payload: {
        returnLockerId: f.returnLockerId,
        returnDistributorId: f.distributorId,
      },
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('reservation_not_returnable')
  })

  it("renvoie 404 si la réservation n'existe pas", async () => {
    const f = await seedAll()
    const res = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${randomUUID()}/return`,
      headers: { authorization: authHeader(f.userId) },
      payload: {
        returnLockerId: f.returnLockerId,
        returnDistributorId: f.distributorId,
      },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('reservation_not_found')
  })

  it("renvoie 404 quand le user essaie de rendre la résa d'un autre user (anti-énumération)", async () => {
    // Sécurité : on renvoie 404 (pas 403) pour ne pas révéler l'existence
    // de la réservation à un user non propriétaire.
    const f = await seedAll()
    const reservationId = randomUUID()
    await pgSql`INSERT INTO reservations
      (id, user_id, locker_id, item_id, distributor_id, status, qr_jti, expires_at, opened_at)
      VALUES (${reservationId}, ${f.userId}, ${f.lockerId}, ${f.itemId}, ${f.distributorId},
              'active', ${randomUUID()}, NOW() + INTERVAL '15 minutes', NOW())`

    const otherUserId = randomUUID()
    await pgSql`INSERT INTO users (id, firebase_uid, email)
      VALUES (${otherUserId}, ${'fb-' + otherUserId.slice(0, 8)}, ${'attacker@test.local'})`

    const res = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${reservationId}/return`,
      headers: { authorization: authHeader(otherUserId) },
      payload: {
        returnLockerId: f.returnLockerId,
        returnDistributorId: f.distributorId,
      },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('reservation_not_found')

    // La résa originale n'a pas bougé : toujours active, propriétaire inchangé.
    const rows = await pgSql`SELECT status, user_id FROM reservations WHERE id = ${reservationId}`
    expect(rows[0]!.status).toBe('active')
    expect(rows[0]!.user_id).toBe(f.userId)
  })
})

describe('PATCH /v1/reservations/:id/extend', () => {
  // Helper : crée une réservation 'active' avec due_at = +4h (item_types default 240 min).
  async function seedActiveReservation(f: Fixtures, extensionCount = 0): Promise<string> {
    const id = randomUUID()
    await pgSql`INSERT INTO reservations
      (id, user_id, locker_id, item_id, distributor_id, status, qr_jti,
       expires_at, opened_at, due_at, extension_count)
      VALUES (${id}, ${f.userId}, ${f.lockerId}, ${f.itemId}, ${f.distributorId},
              'active', ${randomUUID()},
              NOW() + INTERVAL '15 minutes',
              NOW() - INTERVAL '30 minutes',
              NOW() + INTERVAL '4 hours',
              ${extensionCount})`
    return id
  }

  it("prolonge une réservation active et incrémente extension_count + due_at", async () => {
    const f = await seedAll()
    const reservationId = await seedActiveReservation(f, 0)

    const before = await pgSql`SELECT due_at FROM reservations WHERE id = ${reservationId}`
    const dueAtBefore = new Date(before[0]!.due_at as string)

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/reservations/${reservationId}/extend`,
      headers: { authorization: authHeader(f.userId) },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('active')
    expect(body.extensionCount).toBe(1)

    // due_at + 240 min (item_types.max_duration_minutes default)
    const dueAtAfter = new Date(body.dueAt)
    const diffMinutes = (dueAtAfter.getTime() - dueAtBefore.getTime()) / 60_000
    expect(diffMinutes).toBe(240)

    // Event 'extended' tracé
    const events = await pgSql`SELECT event_type FROM locker_events
                                WHERE reservation_id = ${reservationId} AND event_type = 'extended'`
    expect(events).toHaveLength(1)
  })

  it('autorise une 2e prolongation puis bloque la 3e à 409 max_extensions_reached', async () => {
    const f = await seedAll()
    const reservationId = await seedActiveReservation(f, 1) // déjà 1 prolongation

    const second = await app.inject({
      method: 'PATCH',
      url: `/v1/reservations/${reservationId}/extend`,
      headers: { authorization: authHeader(f.userId) },
    })
    expect(second.statusCode).toBe(200)
    expect(second.json().extensionCount).toBe(2)

    const third = await app.inject({
      method: 'PATCH',
      url: `/v1/reservations/${reservationId}/extend`,
      headers: { authorization: authHeader(f.userId) },
    })
    expect(third.statusCode).toBe(409)
    expect(third.json().error).toBe('max_extensions_reached')
  })

  it("renvoie 409 reservation_not_extendable quand status != 'active'", async () => {
    const f = await seedAll()
    const reservationId = randomUUID()
    await pgSql`INSERT INTO reservations
      (id, user_id, locker_id, item_id, distributor_id, status, qr_jti, expires_at)
      VALUES (${reservationId}, ${f.userId}, ${f.lockerId}, ${f.itemId}, ${f.distributorId},
              'pending', ${randomUUID()}, NOW() + INTERVAL '15 minutes')`

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/reservations/${reservationId}/extend`,
      headers: { authorization: authHeader(f.userId) },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('reservation_not_extendable')
  })

  it("renvoie 404 si la réservation appartient à un autre user", async () => {
    const f = await seedAll()
    const reservationId = await seedActiveReservation(f, 0)
    const otherUserId = randomUUID()
    await pgSql`INSERT INTO users (id, firebase_uid, email)
      VALUES (${otherUserId}, ${'fb-' + otherUserId.slice(0, 8)}, ${'other@test.local'})`

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/reservations/${reservationId}/extend`,
      headers: { authorization: authHeader(otherUserId) },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('reservation_not_found')
  })

  it("renvoie 404 si la réservation n'existe pas", async () => {
    const f = await seedAll()
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/reservations/${randomUUID()}/extend`,
      headers: { authorization: authHeader(f.userId) },
    })
    expect(res.statusCode).toBe(404)
  })

  it("renvoie 409 locker_conflict si une autre résa pending/active existe sur le même locker", async () => {
    const f = await seedAll()
    const reservationId = await seedActiveReservation(f, 0)

    // Crée un autre user + une résa pending sur le même locker (cas de corruption d'état)
    const otherUserId = randomUUID()
    await pgSql`INSERT INTO users (id, firebase_uid, email)
      VALUES (${otherUserId}, ${'fb-' + otherUserId.slice(0, 8)}, ${'conflict@test.local'})`
    await pgSql`INSERT INTO reservations
      (id, user_id, locker_id, item_id, distributor_id, status, qr_jti, expires_at)
      VALUES (${randomUUID()}, ${otherUserId}, ${f.lockerId}, ${f.itemId}, ${f.distributorId},
              'pending', ${randomUUID()}, NOW() + INTERVAL '15 minutes')`

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/reservations/${reservationId}/extend`,
      headers: { authorization: authHeader(f.userId) },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('locker_conflict')
  })
})

/**
 * Crons BullMQ — on teste les runners directement (sans passer par BullMQ)
 * pour valider la logique métier sans dépendre du scheduler.
 *
 * Le worker BullMQ se contente d'appeler le runner ; sa cadence (2min /
 * 1min) est configurée dans queues/index.ts et ne fait pas partie du test
 * unitaire de logique.
 */
describe('Cron expire-reservations', () => {
  it("passe les pending dont expires_at < now() en 'expired' et libère le casier", async () => {
    const f = await seedAll()
    const reservationId = randomUUID()
    // Pending depuis 1h, expires_at il y a 45min → doit être expiré.
    await pgSql`INSERT INTO reservations
      (id, user_id, locker_id, item_id, distributor_id, status, qr_jti, expires_at)
      VALUES (${reservationId}, ${f.userId}, ${f.lockerId}, ${f.itemId}, ${f.distributorId},
              'pending', ${randomUUID()}, NOW() - INTERVAL '45 minutes')`
    await pgSql`UPDATE lockers SET state = 'reserved' WHERE id = ${f.lockerId}`

    const { runExpireReservations } = await import('../../src/queues/expire-reservations.js')
    const count = await runExpireReservations(app.log)
    expect(count).toBe(1)

    const rows = await pgSql`SELECT status FROM reservations WHERE id = ${reservationId}`
    expect(rows[0]!.status).toBe('expired')

    const lockerRows = await pgSql`SELECT state FROM lockers WHERE id = ${f.lockerId}`
    expect(lockerRows[0]!.state).toBe('idle')
  })

  it("ne touche pas les pending dont expires_at est dans le futur", async () => {
    const f = await seedAll()
    const reservationId = randomUUID()
    await pgSql`INSERT INTO reservations
      (id, user_id, locker_id, item_id, distributor_id, status, qr_jti, expires_at)
      VALUES (${reservationId}, ${f.userId}, ${f.lockerId}, ${f.itemId}, ${f.distributorId},
              'pending', ${randomUUID()}, NOW() + INTERVAL '15 minutes')`

    const { runExpireReservations } = await import('../../src/queues/expire-reservations.js')
    const count = await runExpireReservations(app.log)
    expect(count).toBe(0)

    const rows = await pgSql`SELECT status FROM reservations WHERE id = ${reservationId}`
    expect(rows[0]!.status).toBe('pending')
  })

  it("idempotent : un 2e run ne retouche pas les déjà-expirées", async () => {
    const f = await seedAll()
    await pgSql`INSERT INTO reservations
      (id, user_id, locker_id, item_id, distributor_id, status, qr_jti, expires_at)
      VALUES (${randomUUID()}, ${f.userId}, ${f.lockerId}, ${f.itemId}, ${f.distributorId},
              'pending', ${randomUUID()}, NOW() - INTERVAL '45 minutes')`

    const { runExpireReservations } = await import('../../src/queues/expire-reservations.js')
    expect(await runExpireReservations(app.log)).toBe(1)
    expect(await runExpireReservations(app.log)).toBe(0)
  })
})

describe('Cron detect-overdue', () => {
  it("passe les active dont due_at est dépassé en 'overdue' (clé : due_at, pas opened_at)", async () => {
    const f = await seedAll()
    const reservationId = randomUUID()
    // Active depuis 30min, due_at dépassé de 5min → overdue.
    await pgSql`INSERT INTO reservations
      (id, user_id, locker_id, item_id, distributor_id, status, qr_jti,
       expires_at, opened_at, due_at)
      VALUES (${reservationId}, ${f.userId}, ${f.lockerId}, ${f.itemId}, ${f.distributorId},
              'active', ${randomUUID()},
              NOW() + INTERVAL '15 minutes',
              NOW() - INTERVAL '30 minutes',
              NOW() - INTERVAL '5 minutes')`

    const { runDetectOverdue } = await import('../../src/queues/detect-overdue.js')
    const count = await runDetectOverdue(app.log)
    expect(count).toBe(1)

    const rows = await pgSql`SELECT status FROM reservations WHERE id = ${reservationId}`
    expect(rows[0]!.status).toBe('overdue')
  })

  it("ne marque pas overdue tant que due_at est dans le futur (cas prolongation)", async () => {
    // Cas critique : une PATCH /extend repousse due_at. Le cron ne doit pas
    // re-marquer overdue à la cadence suivante (1 min) — c'est la garantie
    // que les prolongations sont utiles.
    const f = await seedAll()
    const reservationId = randomUUID()
    await pgSql`INSERT INTO reservations
      (id, user_id, locker_id, item_id, distributor_id, status, qr_jti,
       expires_at, opened_at, due_at)
      VALUES (${reservationId}, ${f.userId}, ${f.lockerId}, ${f.itemId}, ${f.distributorId},
              'active', ${randomUUID()},
              NOW() + INTERVAL '15 minutes',
              NOW() - INTERVAL '5 hours',
              NOW() + INTERVAL '2 hours')`

    const { runDetectOverdue } = await import('../../src/queues/detect-overdue.js')
    expect(await runDetectOverdue(app.log)).toBe(0)

    const rows = await pgSql`SELECT status FROM reservations WHERE id = ${reservationId}`
    expect(rows[0]!.status).toBe('active')
  })

  it("ignore les active dont due_at IS NULL (résa pas encore ouverte)", async () => {
    const f = await seedAll()
    const reservationId = randomUUID()
    await pgSql`INSERT INTO reservations
      (id, user_id, locker_id, item_id, distributor_id, status, qr_jti, expires_at, due_at)
      VALUES (${reservationId}, ${f.userId}, ${f.lockerId}, ${f.itemId}, ${f.distributorId},
              'active', ${randomUUID()}, NOW() + INTERVAL '15 minutes', NULL)`

    const { runDetectOverdue } = await import('../../src/queues/detect-overdue.js')
    expect(await runDetectOverdue(app.log)).toBe(0)
  })

  it("idempotent : un 2e run ne retouche pas les déjà-overdue", async () => {
    const f = await seedAll()
    await pgSql`INSERT INTO reservations
      (id, user_id, locker_id, item_id, distributor_id, status, qr_jti,
       expires_at, opened_at, due_at)
      VALUES (${randomUUID()}, ${f.userId}, ${f.lockerId}, ${f.itemId}, ${f.distributorId},
              'active', ${randomUUID()},
              NOW() + INTERVAL '15 minutes',
              NOW() - INTERVAL '30 minutes',
              NOW() - INTERVAL '5 minutes')`

    const { runDetectOverdue } = await import('../../src/queues/detect-overdue.js')
    expect(await runDetectOverdue(app.log)).toBe(1)
    expect(await runDetectOverdue(app.log)).toBe(0)
  })
})
