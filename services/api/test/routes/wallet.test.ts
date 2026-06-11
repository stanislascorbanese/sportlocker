/**
 * Tests d'intégration du porte-monnaie prépayé (carnet/pass — Phase 1).
 *
 * Couvre : recharge simulate + confirmation (crédite le solde), bornes de
 * recharge, paiement d'une location via le solde (résa → scheduled, débit),
 * solde insuffisant (402), historique GET /wallet, et gardes d'auth.
 *
 * Même stack que payments/admin-payments : Postgres + Redis via testcontainers,
 * schema.sql (qui contient désormais wallet_topups) + migrations 0001/0005.
 * PAYMENTS_PROVIDER non défini → l'env retombe sur `simulate`.
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

async function seedTenant(): Promise<Fixtures> {
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
  await pgSql`UPDATE items SET current_locker_id = ${lockerId} WHERE id = ${itemId}`
  await pgSql`INSERT INTO pricing_rules (id, commune_id, item_type_id, duration_minutes, price_cents)
    VALUES (${randomUUID()}, ${communeId}, ${itemTypeId}, ${DURATION}, ${PRICE_CENTS})`

  return { userId, communeId, distributorId, itemTypeId, itemId, lockerId }
}

function citizenHeader(userId: string): string {
  return `Bearer ${app.jwt.sign({ sub: userId, role: 'citizen' })}`
}

/** Prochain slot aligné :00 UTC, demain à 10:00 (futur + dans la fenêtre J+7). */
function futureSlotIso(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000)
  d.setUTCHours(10, 0, 0, 0)
  return d.toISOString()
}

async function createSlot(f: Fixtures): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/reservations/slots',
    headers: { authorization: citizenHeader(f.userId) },
    payload: {
      distributorId: f.distributorId,
      itemTypeId: f.itemTypeId,
      slotStartAt: futureSlotIso(),
      durationMinutes: DURATION,
    },
  })
  expect(res.statusCode).toBe(201)
  return res.json().id as string
}

/** Recharge simulate confirmée → crédite le solde. */
async function topup(userId: string, amountCents: number): Promise<void> {
  const init = await app.inject({
    method: 'POST',
    url: '/v1/wallet/topup',
    headers: { authorization: citizenHeader(userId) },
    payload: { amountCents },
  })
  expect(init.statusCode).toBe(200)
  const { topupId, provider, clientSecret } = init.json()
  expect(provider).toBe('simulate')
  expect(clientSecret).toBeNull()
  const confirm = await app.inject({
    method: 'POST',
    url: `/v1/wallet/topup/${topupId}/confirm-simulated`,
    headers: { authorization: citizenHeader(userId) },
  })
  expect(confirm.statusCode).toBe(200)
}

beforeAll(async () => {
  pgContainer = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('sportlocker_test').withUsername('test').withPassword('test').start()
  redisContainer = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start()

  process.env.NODE_ENV = 'test'
  process.env.DATABASE_URL = pgContainer.getConnectionUri()
  process.env.REDIS_URL = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`
  process.env.JWT_SESSION_SECRET = 'a'.repeat(64)
  process.env.JWT_DEVICE_SECRET = 'b'.repeat(64)
  process.env.LOG_LEVEL = 'fatal'

  pgSql = postgres(process.env.DATABASE_URL!, { onnotice: () => {} })
  await pgSql.unsafe(readFileSync(SCHEMA_PATH, 'utf-8'))
  for (const p of MIGRATION_PATHS) await pgSql.unsafe(readFileSync(p, 'utf-8'))
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
  } catch { /* ignore */ }
  try {
    const { redis } = await import('../../src/redis/client.js')
    await redis.quit()
  } catch { /* ignore */ }
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
    pricing_rules, payments, wallet_topups
    RESTART IDENTITY CASCADE`
  await redisClient.flushdb()
})

describe('Porte-monnaie prépayé', () => {
  it('solde initial = 0', async () => {
    const f = await seedTenant()
    const res = await app.inject({ method: 'GET', url: '/v1/wallet', headers: { authorization: citizenHeader(f.userId) } })
    expect(res.statusCode).toBe(200)
    expect(res.json().balanceCents).toBe(0)
  })

  it('recharge simulate confirmée crédite le solde', async () => {
    const f = await seedTenant()
    await topup(f.userId, 1000)
    const res = await app.inject({ method: 'GET', url: '/v1/wallet', headers: { authorization: citizenHeader(f.userId) } })
    const body = res.json()
    expect(body.balanceCents).toBe(1000)
    expect(body.topups).toHaveLength(1)
    expect(body.topups[0].status).toBe('succeeded')
  })

  it('rejette une recharge sous le minimum (400)', async () => {
    const f = await seedTenant()
    const res = await app.inject({
      method: 'POST', url: '/v1/wallet/topup',
      headers: { authorization: citizenHeader(f.userId) },
      payload: { amountCents: 100 },
    })
    expect(res.statusCode).toBe(400)
  })

  it('paye une location avec le solde → scheduled + débit', async () => {
    const f = await seedTenant()
    await topup(f.userId, 1000)
    const rid = await createSlot(f)

    const pay = await app.inject({
      method: 'POST', url: `/v1/reservations/${rid}/pay/wallet`,
      headers: { authorization: citizenHeader(f.userId) },
    })
    expect(pay.statusCode).toBe(200)
    const body = pay.json()
    expect(body.paymentStatus).toBe('succeeded')
    expect(body.reservationStatus).toBe('scheduled')
    expect(body.balanceCents).toBe(1000 - PRICE_CENTS)

    // La résa est bien scheduled (QR délivrable)
    const active = await app.inject({ method: 'GET', url: '/v1/reservations/active', headers: { authorization: citizenHeader(f.userId) } })
    expect(active.statusCode).toBe(200)
    expect(active.json().status).toBe('scheduled')

    // Le solde et l'historique reflètent le débit
    const wallet = await app.inject({ method: 'GET', url: '/v1/wallet', headers: { authorization: citizenHeader(f.userId) } })
    expect(wallet.json().balanceCents).toBe(500)
    expect(wallet.json().spends).toHaveLength(1)
    expect(wallet.json().spends[0].amountCents).toBe(PRICE_CENTS)
  })

  it('refuse le paiement wallet si solde insuffisant (402)', async () => {
    const f = await seedTenant()
    const rid = await createSlot(f)   // solde 0 < prix 500
    const pay = await app.inject({
      method: 'POST', url: `/v1/reservations/${rid}/pay/wallet`,
      headers: { authorization: citizenHeader(f.userId) },
    })
    expect(pay.statusCode).toBe(402)
    expect(pay.json().error).toBe('insufficient_balance')
  })

  it('double paiement wallet sur la même résa → 409 already_paid', async () => {
    const f = await seedTenant()
    await topup(f.userId, 2000)
    const rid = await createSlot(f)
    const first = await app.inject({ method: 'POST', url: `/v1/reservations/${rid}/pay/wallet`, headers: { authorization: citizenHeader(f.userId) } })
    expect(first.statusCode).toBe(200)
    const second = await app.inject({ method: 'POST', url: `/v1/reservations/${rid}/pay/wallet`, headers: { authorization: citizenHeader(f.userId) } })
    expect(second.statusCode).toBe(409)
  })

  it('401 sans token', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/wallet' })
    expect(res.statusCode).toBe(401)
  })
})

describe('Porte-monnaie — branches d\'erreur / sérialisation', () => {
  it('GET / : recharge pending sérialisée avec paidAt null', async () => {
    const f = await seedTenant()
    await app.inject({
      method: 'POST', url: '/v1/wallet/topup',
      headers: { authorization: citizenHeader(f.userId) },
      payload: { amountCents: 1000 },
    })
    const res = await app.inject({ method: 'GET', url: '/v1/wallet', headers: { authorization: citizenHeader(f.userId) } })
    expect(res.statusCode).toBe(200)
    const pending = res.json().topups.find((t: { status: string }) => t.status === 'pending')
    expect(pending).toBeTruthy()
    expect(pending.paidAt).toBeNull()
  })

  it('GET / : dépense wallet sans paidAt sérialisée avec paidAt null', async () => {
    const f = await seedTenant()
    // Paiement wallet succeeded mais paid_at NULL (cas limite de sérialisation).
    const rid = randomUUID()
    await pgSql`INSERT INTO reservations
      (id, user_id, locker_id, item_id, distributor_id, status, qr_jti, expires_at)
      VALUES (${rid}, ${f.userId}, ${f.lockerId}, ${f.itemId}, ${f.distributorId},
              'scheduled', ${'jti-' + rid.slice(0, 12)}, NOW())`
    await pgSql`INSERT INTO payments (id, reservation_id, user_id, amount_cents, status, provider, paid_at)
      VALUES (${randomUUID()}, ${rid}, ${f.userId}, 500, 'succeeded', 'wallet', NULL)`
    const res = await app.inject({ method: 'GET', url: '/v1/wallet', headers: { authorization: citizenHeader(f.userId) } })
    expect(res.statusCode).toBe(200)
    expect(res.json().spends).toHaveLength(1)
    expect(res.json().spends[0].paidAt).toBeNull()
  })

  it('confirm-simulated : 404 si la recharge est inconnue', async () => {
    const f = await seedTenant()
    const res = await app.inject({
      method: 'POST', url: `/v1/wallet/topup/${randomUUID()}/confirm-simulated`,
      headers: { authorization: citizenHeader(f.userId) },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('topup_not_found')
  })

  it('confirm-simulated : 403 si la recharge appartient à un autre user', async () => {
    const f = await seedTenant()
    const topup = await app.inject({
      method: 'POST', url: '/v1/wallet/topup',
      headers: { authorization: citizenHeader(f.userId) },
      payload: { amountCents: 1000 },
    })
    const topupId = topup.json().topupId
    const other = randomUUID()
    await pgSql`INSERT INTO users (id, firebase_uid, email)
      VALUES (${other}, ${'fb-' + other.slice(0, 8)}, ${other.slice(0, 8) + '@test.local'})`
    const res = await app.inject({
      method: 'POST', url: `/v1/wallet/topup/${topupId}/confirm-simulated`,
      headers: { authorization: citizenHeader(other) },
    })
    expect(res.statusCode).toBe(403)
  })

  it('confirm-simulated : 409 not_simulated si la recharge est en provider stripe', async () => {
    const f = await seedTenant()
    const topupId = randomUUID()
    await pgSql`INSERT INTO wallet_topups (id, user_id, amount_cents, currency, provider, status)
      VALUES (${topupId}, ${f.userId}, 1000, 'EUR', 'stripe', 'pending')`
    const res = await app.inject({
      method: 'POST', url: `/v1/wallet/topup/${topupId}/confirm-simulated`,
      headers: { authorization: citizenHeader(f.userId) },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('not_simulated')
  })
})
