/**
 * Tests d'intégration de GET /v1/admin/payments — liste des paiements de
 * location pour le dashboard ops.
 *
 * Couvre : visibilité super_admin (tout), scope multi-tenant admin (sa commune
 * uniquement), filtre status, jointures (user/distributeur/matériel), et les
 * gardes d'auth (401 sans token, 403 pour un citizen).
 *
 * Même stack que payments.test.ts : Postgres + Redis via testcontainers,
 * schema.sql + migrations 0001/0005, app.inject. PAYMENTS_PROVIDER non défini
 * → l'env retombe sur `simulate`.
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
}

const DURATION = 60
const PRICE_CENTS = 500

/**
 * Seed un tenant complet (commune + distributeur + matériel + casier + tarif)
 * et un user citizen. `slug`/codes rendus uniques pour pouvoir seeder
 * plusieurs communes dans le même test (scope multi-tenant).
 */
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

function superAdminHeader(): string {
  return `Bearer ${app.jwt.sign({ sub: randomUUID(), role: 'super_admin' })}`
}

function adminHeader(communeId: string): string {
  return `Bearer ${app.jwt.sign({ sub: randomUUID(), role: 'admin', communeId })}`
}

/** Prochain slot aligné :00 UTC, demain à 10:00 (futur + dans la fenêtre J+7). */
function futureSlotIso(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000)
  d.setUTCHours(10, 0, 0, 0)
  return d.toISOString()
}

/** Crée un slot (résa pending_payment + payment pending). Renvoie l'id résa. */
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

/** Paye un slot en mode simulate → payment succeeded, résa scheduled. */
async function paySlot(f: Fixtures, reservationId: string): Promise<void> {
  const pay = await app.inject({
    method: 'POST',
    url: `/v1/reservations/${reservationId}/pay`,
    headers: { authorization: citizenHeader(f.userId) },
  })
  expect(pay.statusCode).toBe(200)
  const confirm = await app.inject({
    method: 'POST',
    url: `/v1/reservations/${reservationId}/pay/confirm-simulated`,
    headers: { authorization: citizenHeader(f.userId) },
  })
  expect(confirm.statusCode).toBe(200)
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

describe('GET /v1/admin/payments', () => {
  it('super_admin voit tous les paiements (toutes communes)', async () => {
    const a = await seedTenant()
    const b = await seedTenant()
    await createSlot(a)
    await createSlot(b)

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/payments',
      headers: { authorization: superAdminHeader() },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.items).toHaveLength(2)
    expect(body.nextCursor).toBeNull()
  })

  it('expose les jointures user / distributeur / matériel + montant', async () => {
    const f = await seedTenant()
    await createSlot(f)

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/payments',
      headers: { authorization: superAdminHeader() },
    })
    expect(res.statusCode).toBe(200)
    const [p] = res.json().items
    expect(p.amountCents).toBe(PRICE_CENTS)
    expect(p.currency).toBe('EUR')
    expect(p.provider).toBe('simulate')
    expect(p.status).toBe('pending')
    expect(p.paidAt).toBeNull()
    expect(p.user.email).toMatch(/@test\.local$/)
    expect(p.distributor.name).toBe('Test Distributor')
    expect(p.item.typeName).toBe('Ballon de foot')
    expect(p.reservation.status).toBe('pending_payment')
  })

  it('admin scopé ne voit que les paiements de sa commune', async () => {
    const a = await seedTenant()
    const b = await seedTenant()
    await createSlot(a)
    await createSlot(b)

    const resA = await app.inject({
      method: 'GET',
      url: '/v1/admin/payments',
      headers: { authorization: adminHeader(a.communeId) },
    })
    expect(resA.statusCode).toBe(200)
    const bodyA = resA.json()
    expect(bodyA.items).toHaveLength(1)
    expect(bodyA.items[0].distributor.id).toBe(a.distributorId)
  })

  it('un paiement confirmé apparaît en succeeded (filtre status)', async () => {
    const f = await seedTenant()
    const rid = await createSlot(f)
    await paySlot(f, rid)

    const succeeded = await app.inject({
      method: 'GET',
      url: '/v1/admin/payments?status=succeeded',
      headers: { authorization: superAdminHeader() },
    })
    expect(succeeded.statusCode).toBe(200)
    const sBody = succeeded.json()
    expect(sBody.items).toHaveLength(1)
    expect(sBody.items[0].status).toBe('succeeded')
    expect(sBody.items[0].paidAt).not.toBeNull()
    expect(sBody.items[0].reservation.status).toBe('scheduled')

    // Le filtre exclut bien : aucun pending après paiement.
    const pending = await app.inject({
      method: 'GET',
      url: '/v1/admin/payments?status=pending',
      headers: { authorization: superAdminHeader() },
    })
    expect(pending.json().items).toHaveLength(0)
  })

  it('401 sans token', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/payments' })
    expect(res.statusCode).toBe(401)
  })

  it('403 pour un citizen', async () => {
    const f = await seedTenant()
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/payments',
      headers: { authorization: citizenHeader(f.userId) },
    })
    expect(res.statusCode).toBe(403)
  })

  it('400 sur cursor invalide', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/payments?cursor=not-a-valid-cursor',
      headers: { authorization: superAdminHeader() },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('invalid_cursor')
  })
})
