/**
 * Tests d'intégration du flux de paiement « payer avant confirmation »
 * (PR Stripe + simulate).
 *
 * Flux couvert (mode simulate, défaut en test — aucun appel Stripe) :
 *   POST /v1/reservations/slots          → résa `pending_payment` + payment `pending`
 *   GET  /v1/reservations/active         → status pending_payment, qrToken null
 *   POST /:id/pay                        → provider simulate, clientSecret null
 *   POST /:id/pay/confirm-simulated      → payment succeeded, résa scheduled
 *   GET  /v1/reservations/active         → status scheduled, qrToken servi
 *
 * Plus : idempotence de la confirmation, garde propriétaire, refus du double
 * paiement, absence de tarif (422), et expiration cron des paniers abandonnés.
 *
 * Même stack que reservations.test.ts : Postgres + Redis via testcontainers,
 * schema.sql + migrations 0001/0005, app.inject. PAYMENTS_PROVIDER n'est pas
 * défini → l'env retombe sur `simulate`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { GenericContainer, type StartedTestContainer } from 'testcontainers'
import postgres from 'postgres'
import IORedis from 'ioredis'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..', '..', '..')
const SCHEMA_PATH = join(REPO_ROOT, 'database', 'schema.sql')
const MIGRATION_PATHS = [
  join(REPO_ROOT, 'database', 'migrations', '0001_fn_locker_is_available.sql'),
  join(REPO_ROOT, 'database', 'migrations', '0018_reservations_unique_active.sql'),
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
}

const DURATION = 60
const PRICE_CENTS = 500

async function seedAll(): Promise<Fixtures> {
  const userId = randomUUID()
  const communeId = randomUUID()
  const distributorId = randomUUID()
  const itemTypeId = randomUUID()
  const itemId = randomUUID()
  const lockerId = randomUUID()

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

  // Le flux slots énumère les items candidats via items.current_locker_id
  // (≠ lockers.current_item_id), donc on relie l'item au casier ici.
  await pgSql`UPDATE items SET current_locker_id = ${lockerId} WHERE id = ${itemId}`

  await pgSql`INSERT INTO pricing_rules (id, commune_id, item_type_id, duration_minutes, price_cents)
    VALUES (${randomUUID()}, ${communeId}, ${itemTypeId}, ${DURATION}, ${PRICE_CENTS})`

  return { userId, communeId, distributorId, itemTypeId, itemId, lockerId }
}

function authHeader(userId: string): string {
  return `Bearer ${app.jwt.sign({ sub: userId, role: 'citizen' })}`
}

/** Prochain slot aligné :00 UTC, demain à 10:00 (futur + dans la fenêtre J+7). */
function futureSlotIso(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000)
  d.setUTCHours(10, 0, 0, 0)
  return d.toISOString()
}

async function createSlot(f: Fixtures) {
  return app.inject({
    method: 'POST',
    url: '/v1/reservations/slots',
    headers: { authorization: authHeader(f.userId) },
    payload: {
      distributorId: f.distributorId,
      itemTypeId: f.itemTypeId,
      slotStartAt: futureSlotIso(),
      durationMinutes: DURATION,
    },
  })
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
  try {
    const { queues } = await import('../../src/queues/index.js')
    await Promise.all([
      queues.expireReservations.close(),
      queues.detectOverdue.close(),
      queues.heartbeatWatchdog.close(),
      queues.rgpdAnonymize.close(),
    ])
  } catch {
    /* module possiblement non chargé si buildApp a échoué */
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
    maintenance_tickets, push_tokens, notification_logs, reviews,
    pricing_rules, payments
    RESTART IDENTITY CASCADE`
  await redisClient.flushdb()
})

describe('POST /v1/reservations/slots (paiement requis)', () => {
  it('crée une résa pending_payment + un payment pending (provider simulate)', async () => {
    const f = await seedAll()

    const res = await createSlot(f)
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.status).toBe('pending_payment')
    expect(body.priceCents).toBe(PRICE_CENTS)
    expect(body.payment.provider).toBe('simulate')
    expect(body.payment.status).toBe('pending')
    expect(body.payment.amountCents).toBe(PRICE_CENTS)
    // Pas de QR ni de deviceToken tant que non payé.
    expect(body.deviceToken).toBeUndefined()

    const rRows = await pgSql`SELECT status FROM reservations WHERE id = ${body.id}`
    expect(rRows[0]!.status).toBe('pending_payment')
    const pRows = await pgSql`SELECT status, provider, amount_cents
                              FROM payments WHERE reservation_id = ${body.id}`
    expect(pRows).toHaveLength(1)
    expect(pRows[0]!.status).toBe('pending')
    expect(pRows[0]!.provider).toBe('simulate')
    expect(pRows[0]!.amount_cents).toBe(PRICE_CENTS)
  })

  it('renvoie 422 no_pricing si aucun tarif ne couvre le triplet', async () => {
    const f = await seedAll()
    await pgSql`DELETE FROM pricing_rules WHERE commune_id = ${f.communeId}`

    const res = await createSlot(f)
    expect(res.statusCode).toBe(422)
    expect(res.json().error).toBe('no_pricing')
  })
})

describe('GET /v1/reservations/active pendant pending_payment', () => {
  it('renvoie la résa avec qrToken null (pas de QR avant paiement)', async () => {
    const f = await seedAll()
    const created = await createSlot(f)
    expect(created.statusCode).toBe(201)

    const res = await app.inject({
      method: 'GET',
      url: '/v1/reservations/active',
      headers: { authorization: authHeader(f.userId) },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('pending_payment')
    expect(body.qrToken).toBeNull()
  })
})

describe('Flux simulate complet → scheduled + QR', () => {
  it('pay (clientSecret null) puis confirm-simulated bascule en scheduled', async () => {
    const f = await seedAll()
    const created = await createSlot(f)
    const id = created.json().id

    const pay = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${id}/pay`,
      headers: { authorization: authHeader(f.userId) },
    })
    expect(pay.statusCode).toBe(200)
    expect(pay.json().provider).toBe('simulate')
    expect(pay.json().clientSecret).toBeNull()

    const confirm = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${id}/pay/confirm-simulated`,
      headers: { authorization: authHeader(f.userId) },
    })
    expect(confirm.statusCode).toBe(200)
    expect(confirm.json().paymentStatus).toBe('succeeded')
    expect(confirm.json().reservationStatus).toBe('scheduled')

    // DB : payment succeeded + paid_at, résa scheduled.
    const pRows = await pgSql`SELECT status, paid_at FROM payments WHERE reservation_id = ${id}`
    expect(pRows[0]!.status).toBe('succeeded')
    expect(pRows[0]!.paid_at).not.toBeNull()
    const rRows = await pgSql`SELECT status FROM reservations WHERE id = ${id}`
    expect(rRows[0]!.status).toBe('scheduled')

    // GET /active sert désormais un QR JWT.
    const active = await app.inject({
      method: 'GET',
      url: '/v1/reservations/active',
      headers: { authorization: authHeader(f.userId) },
    })
    expect(active.json().status).toBe('scheduled')
    expect(active.json().qrToken).toMatch(/^eyJ/)
  })

  it('confirm-simulated est idempotent (2e appel reste succeeded/scheduled)', async () => {
    const f = await seedAll()
    const id = (await createSlot(f)).json().id

    const first = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${id}/pay/confirm-simulated`,
      headers: { authorization: authHeader(f.userId) },
    })
    expect(first.statusCode).toBe(200)

    const second = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${id}/pay/confirm-simulated`,
      headers: { authorization: authHeader(f.userId) },
    })
    expect(second.statusCode).toBe(200)
    expect(second.json().paymentStatus).toBe('succeeded')
    expect(second.json().reservationStatus).toBe('scheduled')
  })

  it('renvoie 409 already_paid sur POST /:id/pay après paiement', async () => {
    const f = await seedAll()
    const id = (await createSlot(f)).json().id
    await app.inject({
      method: 'POST',
      url: `/v1/reservations/${id}/pay/confirm-simulated`,
      headers: { authorization: authHeader(f.userId) },
    })

    const pay = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${id}/pay`,
      headers: { authorization: authHeader(f.userId) },
    })
    expect(pay.statusCode).toBe(409)
    expect(pay.json().error).toBe('already_paid')
  })
})

describe('Gardes propriétaire', () => {
  it('confirm-simulated par un autre user → 403 forbidden', async () => {
    const f = await seedAll()
    const id = (await createSlot(f)).json().id

    const otherUserId = randomUUID()
    await pgSql`INSERT INTO users (id, firebase_uid, email)
      VALUES (${otherUserId}, ${'fb-' + otherUserId.slice(0, 8)}, ${'attacker@test.local'})`

    const res = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${id}/pay/confirm-simulated`,
      headers: { authorization: authHeader(otherUserId) },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('forbidden')

    const rRows = await pgSql`SELECT status FROM reservations WHERE id = ${id}`
    expect(rRows[0]!.status).toBe('pending_payment')
  })

  it('pay sur une résa inexistante → 404 payment_not_found', async () => {
    const f = await seedAll()
    const res = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${randomUUID()}/pay`,
      headers: { authorization: authHeader(f.userId) },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('payment_not_found')
  })

  it('pay par un autre user → 403 forbidden', async () => {
    const f = await seedAll()
    const id = (await createSlot(f)).json().id

    const otherUserId = randomUUID()
    await pgSql`INSERT INTO users (id, firebase_uid, email)
      VALUES (${otherUserId}, ${'fb-' + otherUserId.slice(0, 8)}, ${'thief@test.local'})`

    const res = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${id}/pay`,
      headers: { authorization: authHeader(otherUserId) },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('forbidden')
  })

  it('pay sur une résa déjà scheduled → 409 reservation_not_payable', async () => {
    const f = await seedAll()
    const id = (await createSlot(f)).json().id
    // bascule manuelle pending_payment → scheduled (simule un confirm parallèle)
    await pgSql`UPDATE reservations SET status = 'scheduled' WHERE id = ${id}`

    const res = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${id}/pay`,
      headers: { authorization: authHeader(f.userId) },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('reservation_not_payable')
  })

  it('confirm-simulated sur une résa inexistante → 404 payment_not_found', async () => {
    const f = await seedAll()
    const res = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${randomUUID()}/pay/confirm-simulated`,
      headers: { authorization: authHeader(f.userId) },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('payment_not_found')
  })
})

describe('Cron expire-reservations — paniers abandonnés', () => {
  it('expire un pending_payment plus vieux que PAYMENT_TTL et annule son payment', async () => {
    const f = await seedAll()
    const id = (await createSlot(f)).json().id

    // Vieillit la résa au-delà du TTL (défaut 15 min).
    await pgSql`UPDATE reservations SET created_at = NOW() - INTERVAL '30 minutes' WHERE id = ${id}`

    const { runExpireReservations } = await import('../../src/queues/expire-reservations.js')
    const count = await runExpireReservations(app.log)
    expect(count).toBe(1)

    const rRows = await pgSql`SELECT status FROM reservations WHERE id = ${id}`
    expect(rRows[0]!.status).toBe('expired')
    const pRows = await pgSql`SELECT status FROM payments WHERE reservation_id = ${id}`
    expect(pRows[0]!.status).toBe('cancelled')
  })

  it('ne touche pas un pending_payment récent (dans le TTL)', async () => {
    const f = await seedAll()
    const id = (await createSlot(f)).json().id

    const { runExpireReservations } = await import('../../src/queues/expire-reservations.js')
    expect(await runExpireReservations(app.log)).toBe(0)

    const rRows = await pgSql`SELECT status FROM reservations WHERE id = ${id}`
    expect(rRows[0]!.status).toBe('pending_payment')
  })
})
