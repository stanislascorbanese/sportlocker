/**
 * Tests d'intégration pour /v1/admin/users :
 *   - GET /            (filtres role/banned/q, scoping admin commune)
 *   - PATCH /:id       (élévation de rôle bloquée pour admin scoped,
 *                       ban + reason, RGPD, scope check 404 anti-leak)
 *
 * Pattern identique aux autres tests admin (testcontainers, app.inject,
 * TRUNCATE entre tests). Firebase mocké au boot (non utilisé ici, on signe
 * directement les JWT session).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { GenericContainer, type StartedTestContainer } from 'testcontainers'
import postgres from 'postgres'
import IORedis from 'ioredis'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'

import { seedCommune, seedUser, signSession } from '../helpers/seed.js'

vi.mock('firebase-admin', () => {
  const auth = { verifyIdToken: vi.fn() }
  return {
    default: {
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

describe('GET /v1/admin/users', () => {
  it('super_admin sans filtre → renvoie tous les users', async () => {
    const c = await seedCommune(pgSql)
    await seedUser(pgSql, { role: 'citizen', email: 'a@a.fr' })
    await seedUser(pgSql, { role: 'admin', email: 'b@b.fr', communeId: c })
    const su = await seedUser(pgSql, { role: 'super_admin', email: 'su@s.fr' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/users/',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })

    expect(res.statusCode).toBe(200)
    const items = res.json().items as { id: string; email: string }[]
    // 3 users seedés
    expect(items).toHaveLength(3)
    const emails = items.map((i) => i.email)
    expect(emails).toEqual(expect.arrayContaining(['a@a.fr', 'b@b.fr', 'su@s.fr']))
  })

  it('filtre role=citizen → ne renvoie que les citoyens', async () => {
    const c = await seedCommune(pgSql)
    await seedUser(pgSql, { role: 'citizen', email: 'cit1@a.fr' })
    await seedUser(pgSql, { role: 'citizen', email: 'cit2@a.fr' })
    await seedUser(pgSql, { role: 'admin', email: 'adm@a.fr', communeId: c })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/users/?role=citizen',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as { email: string; role: string }[]
    // 2 citoyens (su et admin filtrés out)
    expect(items).toHaveLength(2)
    expect(items.every((i) => i.role === 'citizen')).toBe(true)
  })

  it('filtre banned=true → ne renvoie que les bannis', async () => {
    const banned = await seedUser(pgSql, { role: 'citizen', email: 'ban@a.fr' })
    await seedUser(pgSql, { role: 'citizen', email: 'ok@a.fr' })
    await pgSql`UPDATE users SET is_banned = TRUE WHERE id = ${banned.id}`
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/users/?banned=true',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as { id: string; isBanned: boolean }[]
    expect(items).toHaveLength(1)
    expect(items[0]!.id).toBe(banned.id)
    expect(items[0]!.isBanned).toBe(true)
  })

  it('filtre banned=false → ne renvoie que les non-bannis', async () => {
    const banned = await seedUser(pgSql, { role: 'citizen', email: 'ban@a.fr' })
    await seedUser(pgSql, { role: 'citizen', email: 'ok@a.fr' })
    await pgSql`UPDATE users SET is_banned = TRUE WHERE id = ${banned.id}`
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/users/?banned=false',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as { isBanned: boolean; id: string }[]
    // ok@a.fr + le super_admin lui-même
    expect(items).toHaveLength(2)
    expect(items.every((i) => i.isBanned === false)).toBe(true)
    expect(items.find((i) => i.id === banned.id)).toBeUndefined()
  })

  it('filtre q : ILIKE sur email', async () => {
    await seedUser(pgSql, { role: 'citizen', email: 'alice.dupont@example.fr' })
    await seedUser(pgSql, { role: 'citizen', email: 'bob@elsewhere.fr' })
    const su = await seedUser(pgSql, { role: 'super_admin', email: 'su@s.fr' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/users/?q=dupont',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as { email: string }[]
    expect(items).toHaveLength(1)
    expect(items[0]!.email).toBe('alice.dupont@example.fr')
  })

  it('filtre q : ILIKE sur displayName', async () => {
    await seedUser(pgSql, { role: 'citizen', email: 'a@a.fr', displayName: 'Jean Martin' })
    await seedUser(pgSql, { role: 'citizen', email: 'b@b.fr', displayName: 'Paul Durand' })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/users/?q=Martin',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as { displayName: string | null }[]
    expect(items).toHaveLength(1)
    expect(items[0]!.displayName).toBe('Jean Martin')
  })

  it('admin scoped → voit uniquement les users de SA commune', async () => {
    const a = await seedCommune(pgSql, 'A')
    const b = await seedCommune(pgSql, 'B')
    const userA1 = await seedUser(pgSql, { role: 'citizen', communeId: a, email: 'a1@a.fr' })
    const userA2 = await seedUser(pgSql, { role: 'citizen', communeId: a, email: 'a2@a.fr' })
    const userB = await seedUser(pgSql, { role: 'citizen', communeId: b, email: 'b@b.fr' })
    const orphan = await seedUser(pgSql, { role: 'citizen', email: 'orphan@n.fr' })
    const adminA = await seedUser(pgSql, { role: 'admin', communeId: a, email: 'admin@a.fr' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/users/',
      headers: { authorization: signSession(app, adminA.id, 'admin', a) },
    })
    expect(res.statusCode).toBe(200)
    const ids = (res.json().items as { id: string }[]).map((i) => i.id)
    // adminA lui-même + userA1 + userA2 (sa commune)
    expect(ids).toEqual(expect.arrayContaining([adminA.id, userA1.id, userA2.id]))
    expect(ids).not.toContain(userB.id)
    expect(ids).not.toContain(orphan.id)
    expect(ids).toHaveLength(3)
  })

  it('citizen → 403', async () => {
    const citizen = await seedUser(pgSql, { role: 'citizen' })
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/users/',
      headers: { authorization: signSession(app, citizen.id, 'citizen') },
    })
    expect(res.statusCode).toBe(403)
  })

  it('sans token → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/users/',
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('PATCH /v1/admin/users/:id', () => {
  it('admin scoped tentant un changement de role → 403 forbidden_role_change_super_admin_only', async () => {
    const a = await seedCommune(pgSql, 'A')
    const cible = await seedUser(pgSql, { role: 'citizen', communeId: a, email: 'cible@a.fr' })
    const adminA = await seedUser(pgSql, { role: 'admin', communeId: a })

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/users/${cible.id}`,
      headers: { authorization: signSession(app, adminA.id, 'admin', a) },
      payload: { role: 'admin' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('forbidden_role_change_super_admin_only')

    // Garde-fou : le role n'a PAS changé.
    const rows = await pgSql`SELECT role FROM users WHERE id = ${cible.id}`
    expect(rows[0]!.role).toBe('citizen')
  })

  it('admin scoped sur user d\'AUTRE commune → 404 (anti-leak)', async () => {
    const a = await seedCommune(pgSql, 'A')
    const b = await seedCommune(pgSql, 'B')
    const userB = await seedUser(pgSql, { role: 'citizen', communeId: b, email: 'b@b.fr' })
    const adminA = await seedUser(pgSql, { role: 'admin', communeId: a })

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/users/${userB.id}`,
      headers: { authorization: signSession(app, adminA.id, 'admin', a) },
      payload: { isBanned: true, bannedReason: 'tentative cross-tenant' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('user_not_found')

    // Garde-fou : userB n'a PAS été banni.
    const rows = await pgSql`SELECT is_banned, banned_reason FROM users WHERE id = ${userB.id}`
    expect(rows[0]!.is_banned).toBe(false)
    expect(rows[0]!.banned_reason).toBeNull()
  })

  it('admin scoped → ban d\'un user de SA commune avec reason → 200 + persistance', async () => {
    const a = await seedCommune(pgSql, 'A')
    const cible = await seedUser(pgSql, { role: 'citizen', communeId: a, email: 'cible@a.fr' })
    const adminA = await seedUser(pgSql, { role: 'admin', communeId: a })

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/users/${cible.id}`,
      headers: { authorization: signSession(app, adminA.id, 'admin', a) },
      payload: { isBanned: true, bannedReason: 'comportement abusif' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.isBanned).toBe(true)
    expect(body.bannedReason).toBe('comportement abusif')

    const rows = await pgSql`SELECT is_banned, banned_reason FROM users WHERE id = ${cible.id}`
    expect(rows[0]!.is_banned).toBe(true)
    expect(rows[0]!.banned_reason).toBe('comportement abusif')
  })

  it('PATCH gdprDeleteRequestedAt → champ posé en DB', async () => {
    const cible = await seedUser(pgSql, { role: 'citizen' })
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const requestedAt = '2026-05-01T10:00:00.000Z'

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/users/${cible.id}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: { gdprDeleteRequestedAt: requestedAt },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().gdprDeleteRequestedAt).toBe(requestedAt)

    const rows = await pgSql<{ gdpr_delete_requested_at: Date | null }[]>`
      SELECT gdpr_delete_requested_at FROM users WHERE id = ${cible.id}`
    expect(rows[0]!.gdpr_delete_requested_at).not.toBeNull()
    expect(rows[0]!.gdpr_delete_requested_at!.toISOString()).toBe(requestedAt)
  })

  it('PATCH gdprDeleteRequestedAt=null → annule la demande RGPD', async () => {
    const cible = await seedUser(pgSql, { role: 'citizen' })
    const su = await seedUser(pgSql, { role: 'super_admin' })
    await pgSql`UPDATE users SET gdpr_delete_requested_at = NOW() WHERE id = ${cible.id}`

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/users/${cible.id}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: { gdprDeleteRequestedAt: null },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().gdprDeleteRequestedAt).toBeNull()

    const rows = await pgSql`SELECT gdpr_delete_requested_at FROM users WHERE id = ${cible.id}`
    expect(rows[0]!.gdpr_delete_requested_at).toBeNull()
  })

  it('super_admin → changement de role valide → 200 + persistance', async () => {
    const cible = await seedUser(pgSql, { role: 'citizen' })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/users/${cible.id}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: { role: 'admin' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().role).toBe('admin')

    const rows = await pgSql`SELECT role FROM users WHERE id = ${cible.id}`
    expect(rows[0]!.role).toBe('admin')
  })

  it('super_admin → ajustement trustScore → 200', async () => {
    const cible = await seedUser(pgSql, { role: 'citizen' })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/users/${cible.id}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: { trustScore: 42 },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().trustScore).toBe(42)
  })

  it('PATCH body vide → 400', async () => {
    const cible = await seedUser(pgSql, { role: 'citizen' })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/users/${cible.id}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })

  it('PATCH id inconnu en super_admin → 404 user_not_found', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/users/${randomUUID()}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: { isBanned: true },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('user_not_found')
  })

  it('citizen → 403', async () => {
    const cible = await seedUser(pgSql, { role: 'citizen' })
    const attacker = await seedUser(pgSql, { role: 'citizen' })

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/users/${cible.id}`,
      headers: { authorization: signSession(app, attacker.id, 'citizen') },
      payload: { isBanned: true },
    })
    expect(res.statusCode).toBe(403)
  })
})
