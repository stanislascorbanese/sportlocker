/**
 * Tests d'intégration pour /v1/users/me (citoyen).
 *
 * Périmètre :
 *   - GET /me : profil du user courant (dont trustScore + état RGPD).
 *              401 sans auth, 404 si le user n'existe plus.
 *   - DELETE /me : demande de suppression RGPD (soft-delete).
 *              Pose gdpr_delete_requested_at, idempotent, 409 si résa vivante,
 *              n'est pas bloquée par une résa terminale, 404 si user absent.
 *
 * On monte l'app Fastify réelle sur un Postgres + Redis testcontainers
 * (même pattern que push-subscriptions.test.ts).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { GenericContainer, type StartedTestContainer } from 'testcontainers'
import postgres from 'postgres'
import IORedis from 'ioredis'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

import type { FastifyInstance } from 'fastify'

import { seedUser, signSession } from '../helpers/seed.js'

vi.mock('firebase-admin', () => {
  const auth = { verifyIdToken: vi.fn() }
  return {
    default: {
      apps: [],
      initializeApp: vi.fn(),
      credential: { cert: vi.fn() },
      auth: () => auth,
    },
  }
})

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..', '..', '..')
const SCHEMA_PATH = join(REPO_ROOT, 'database', 'schema.sql')
const MIGRATION_PATH = join(REPO_ROOT, 'database', 'migrations', '0001_fn_locker_is_available.sql')

let pgContainer: StartedPostgreSqlContainer
let redisContainer: StartedTestContainer
let pgSql: ReturnType<typeof postgres>
let redisClient: IORedis
let app: FastifyInstance

/**
 * Seed d'une réservation « vivante » pour un user donné : crée la chaîne de FK
 * minimale (commune → distributeur → locker + item_type → item) puis la résa.
 * Un seul locker/item par appel suffit pour tester le blocage de suppression.
 */
async function seedReservationForUser(
  userId: string,
  status: 'pending_payment' | 'scheduled' | 'pending' | 'active' | 'overdue' | 'returned' | 'cancelled' | 'expired',
): Promise<string> {
  const communeId = randomUUID()
  const insee = String(10000 + Math.floor(Math.random() * 70000))
  await pgSql`INSERT INTO communes (id, insee_code, name, postal_code, department, region)
    VALUES (${communeId}, ${insee}, 'Test', '75001', '75', 'IDF')`

  const distId = randomUUID()
  await pgSql`INSERT INTO distributors
    (id, serial_number, commune_id, name, latitude, longitude, locker_count)
    VALUES (${distId}, ${'SN-' + distId.slice(0, 8)}, ${communeId}, 'Dist', 48.85, 2.35, 4)`

  const lockerId = randomUUID()
  await pgSql`INSERT INTO lockers (id, distributor_id, position, state)
    VALUES (${lockerId}, ${distId}, 0, 'idle')`

  const itemTypeId = randomUUID()
  await pgSql`INSERT INTO item_types (id, slug, name, category)
    VALUES (${itemTypeId}, ${'slug-' + itemTypeId.slice(0, 8)}, 'Ballon', 'sport')`

  const itemId = randomUUID()
  await pgSql`INSERT INTO items (id, item_type_id, rfid_tag)
    VALUES (${itemId}, ${itemTypeId}, ${'RFID-' + itemId.slice(0, 8)})`

  const resId = randomUUID()
  await pgSql`INSERT INTO reservations
    (id, user_id, locker_id, item_id, distributor_id, status, qr_jti, expires_at)
    VALUES (${resId}, ${userId}, ${lockerId}, ${itemId}, ${distId},
            ${status}::reservation_status, ${randomUUID()}, NOW() + INTERVAL '15 minutes')`
  return resId
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
  process.env.FIREBASE_PROJECT_ID = 'sportlocker-test'
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{"type":"service_account","project_id":"sportlocker-test"}'
  process.env.DASHBOARD_INVITE_BASE_URL = 'https://app.sportlocker.fr'
  process.env.LOG_LEVEL = 'fatal'

  pgSql = postgres(process.env.DATABASE_URL!, { onnotice: () => {} })
  await pgSql.unsafe(readFileSync(SCHEMA_PATH, 'utf-8'))
  await pgSql.unsafe(readFileSync(MIGRATION_PATH, 'utf-8'))

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
    admin_invites
    RESTART IDENTITY CASCADE`
  await redisClient.flushdb()
})

// ──────────────────────────────────────────────────────────────────────────
// GET /v1/users/me
// ──────────────────────────────────────────────────────────────────────────

describe('GET /v1/users/me', () => {
  it('sans auth → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/users/me' })
    expect(res.statusCode).toBe(401)
  })

  it('renvoie le profil du user courant avec trustScore', async () => {
    const u = await seedUser(pgSql, { role: 'citizen', displayName: 'Alice' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/users/me',
      headers: { authorization: signSession(app, u.id, 'citizen') },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.id).toBe(u.id)
    expect(body.email).toBe(u.email)
    expect(body.displayName).toBe('Alice')
    expect(body.role).toBe('citizen')
    // Default trust_score = 100 (cf. schema).
    expect(body.trustScore).toBe(100)
    expect(body.gdprDeleteRequestedAt).toBeNull()
  })

  it('reflète le trustScore réel du user', async () => {
    const u = await seedUser(pgSql, { role: 'citizen' })
    await pgSql`UPDATE users SET trust_score = 42 WHERE id = ${u.id}`

    const res = await app.inject({
      method: 'GET',
      url: '/v1/users/me',
      headers: { authorization: signSession(app, u.id, 'citizen') },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().trustScore).toBe(42)
  })

  it('expose gdprDeleteRequestedAt si une demande est en cours', async () => {
    const u = await seedUser(pgSql, { role: 'citizen' })
    await pgSql`UPDATE users SET gdpr_delete_requested_at = NOW() WHERE id = ${u.id}`

    const res = await app.inject({
      method: 'GET',
      url: '/v1/users/me',
      headers: { authorization: signSession(app, u.id, 'citizen') },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().gdprDeleteRequestedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('404 si le user du JWT n\'existe plus', async () => {
    const ghostId = randomUUID()
    const res = await app.inject({
      method: 'GET',
      url: '/v1/users/me',
      headers: { authorization: signSession(app, ghostId, 'citizen') },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('user_not_found')
  })
})

// ──────────────────────────────────────────────────────────────────────────
// DELETE /v1/users/me
// ──────────────────────────────────────────────────────────────────────────

describe('DELETE /v1/users/me', () => {
  it('sans auth → 401', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/v1/users/me' })
    expect(res.statusCode).toBe(401)
  })

  it('pose gdpr_delete_requested_at et renvoie l\'horodatage', async () => {
    const u = await seedUser(pgSql, { role: 'citizen' })

    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/users/me',
      headers: { authorization: signSession(app, u.id, 'citizen') },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.ok).toBe(true)
    expect(body.gdprDeleteRequestedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    const [row] = await pgSql`SELECT gdpr_delete_requested_at, gdpr_deleted_at
      FROM users WHERE id = ${u.id}`
    expect(row!.gdpr_delete_requested_at).not.toBeNull()
    // Soft-delete uniquement : pas d'anonymisation immédiate.
    expect(row!.gdpr_deleted_at).toBeNull()
  })

  it('est idempotent : un 2e appel ne repousse pas le compte à rebours', async () => {
    const u = await seedUser(pgSql, { role: 'citizen' })
    const headers = { authorization: signSession(app, u.id, 'citizen') }

    const first = await app.inject({ method: 'DELETE', url: '/v1/users/me', headers })
    const firstTs = first.json().gdprDeleteRequestedAt

    const second = await app.inject({ method: 'DELETE', url: '/v1/users/me', headers })
    expect(second.statusCode).toBe(200)
    // Même horodatage que le 1er appel : on ne réinitialise pas la date.
    expect(second.json().gdprDeleteRequestedAt).toBe(firstTs)
  })

  it.each(['pending_payment', 'scheduled', 'pending', 'active', 'overdue'] as const)(
    'refuse 409 si une réservation %s est vivante',
    async (status) => {
      const u = await seedUser(pgSql, { role: 'citizen' })
      await seedReservationForUser(u.id, status)

      const res = await app.inject({
        method: 'DELETE',
        url: '/v1/users/me',
        headers: { authorization: signSession(app, u.id, 'citizen') },
      })
      expect(res.statusCode).toBe(409)
      expect(res.json().error).toBe('active_reservation')

      // Rien n'a été posé côté DB : la demande est refusée, pas différée.
      const [row] = await pgSql`SELECT gdpr_delete_requested_at FROM users WHERE id = ${u.id}`
      expect(row!.gdpr_delete_requested_at).toBeNull()
    },
  )

  it('n\'est pas bloquée par une réservation terminale (returned)', async () => {
    const u = await seedUser(pgSql, { role: 'citizen' })
    await seedReservationForUser(u.id, 'returned')

    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/users/me',
      headers: { authorization: signSession(app, u.id, 'citizen') },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().ok).toBe(true)
  })

  it('404 si le user du JWT n\'existe plus', async () => {
    const ghostId = randomUUID()
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/users/me',
      headers: { authorization: signSession(app, ghostId, 'citizen') },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('user_not_found')
  })
})
