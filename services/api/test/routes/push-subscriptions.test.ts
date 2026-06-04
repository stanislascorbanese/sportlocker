/**
 * Tests d'intégration pour /v1/push-subscriptions (citoyen).
 *
 * Périmètre :
 *   - GET /config : route publique (pas d'auth), expose VAPID_PUBLIC_KEY ou null.
 *   - POST / : enregistre une subscription, idempotent sur l'endpoint
 *              (re-subscribe UPDATE au lieu de dupliquer).
 *   - POST / : préférence `reminderMinutesBefore` propage côté users
 *              (préférence partagée entre tous les devices du user).
 *   - GET /preferences : lit la préférence courante, défaut 15 si jamais set.
 *   - DELETE / : désinscrit. Idempotent (200 même si row n'existait pas,
 *                ou si l'endpoint appartient à un autre user — anti-leak).
 *
 * `VAPID_PUBLIC_KEY` est posé en env au boot pour avoir un cas non-null
 * sur GET /config. On teste séparément le cas où il est absent.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { GenericContainer, type StartedTestContainer } from 'testcontainers'
import postgres from 'postgres'
import IORedis from 'ioredis'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

// Endpoint factice du push service browser (FCM, Mozilla, …). Format Web Push.
function fakeEndpoint(id: string): string {
  return `https://fcm.googleapis.com/fcm/send/${id}-${Math.random().toString(36).slice(2, 10)}`
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
  // VAPID keys factices (clé publique = chaîne base64url de 87 chars typique
  // — ici on met juste une string non-vide pour tester le retour de /config).
  process.env.VAPID_PUBLIC_KEY = 'BFakePublicVapidKey_'
    + 'ForIntegrationTests_'
    + 'NotARealKey_'
    + 'OnlyForChecking_'
    + 'NonNullReturn'
  process.env.VAPID_PRIVATE_KEY = 'BFakePrivateVapidKey_ForIntegrationTests'
  process.env.VAPID_SUBJECT = 'mailto:test@sportlocker.fr'
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
// GET /config — route publique
// ──────────────────────────────────────────────────────────────────────────

describe('GET /v1/push-subscriptions/config', () => {
  it('expose la VAPID public key (route publique, pas d\'auth requise)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/push-subscriptions/config',
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.vapidPublicKey).toBe(process.env.VAPID_PUBLIC_KEY)
  })
})

// ──────────────────────────────────────────────────────────────────────────
// POST / — subscribe
// ──────────────────────────────────────────────────────────────────────────

describe('POST /v1/push-subscriptions', () => {
  it('sans auth → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/push-subscriptions',
      payload: {
        endpoint: fakeEndpoint('a'),
        keys: { p256dh: 'p'.repeat(50), auth: 'a'.repeat(20) },
      },
    })
    expect(res.statusCode).toBe(401)
  })

  it('enregistre une nouvelle subscription → 201 + row en DB', async () => {
    const u = await seedUser(pgSql, { role: 'citizen' })
    const endpoint = fakeEndpoint('a')

    const res = await app.inject({
      method: 'POST',
      url: '/v1/push-subscriptions',
      headers: { authorization: signSession(app, u.id, 'citizen') },
      payload: {
        endpoint,
        keys: { p256dh: 'p'.repeat(50), auth: 'a'.repeat(20) },
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.endpoint).toBe(endpoint)
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    const rows = await pgSql<{ user_id: string; p256dh_key: string }[]>`
      SELECT user_id, p256dh_key FROM push_tokens WHERE endpoint = ${endpoint}`
    expect(rows).toHaveLength(1)
    expect(rows[0]?.user_id).toBe(u.id)
    expect(rows[0]?.p256dh_key).toBe('p'.repeat(50))
  })

  it('idempotent : re-subscribe même endpoint UPDATE au lieu de duplique', async () => {
    const u = await seedUser(pgSql, { role: 'citizen' })
    const endpoint = fakeEndpoint('a')

    const first = await app.inject({
      method: 'POST',
      url: '/v1/push-subscriptions',
      headers: { authorization: signSession(app, u.id, 'citizen') },
      payload: {
        endpoint,
        keys: { p256dh: 'p'.repeat(50), auth: 'a'.repeat(20) },
      },
    })
    expect(first.statusCode).toBe(201)
    const firstId = first.json().id

    // Re-subscribe : le browser a renouvelé sa key p256dh (cas FCM)
    const second = await app.inject({
      method: 'POST',
      url: '/v1/push-subscriptions',
      headers: { authorization: signSession(app, u.id, 'citizen') },
      payload: {
        endpoint,
        keys: { p256dh: 'q'.repeat(50), auth: 'b'.repeat(20) },
      },
    })
    expect(second.statusCode).toBe(201)
    expect(second.json().id).toBe(firstId)

    const rows = await pgSql<{ p256dh_key: string }[]>`
      SELECT p256dh_key FROM push_tokens WHERE endpoint = ${endpoint}`
    expect(rows).toHaveLength(1)
    expect(rows[0]?.p256dh_key).toBe('q'.repeat(50))  // key mise à jour
  })

  it('reminderMinutesBefore optionnel propage côté users (préférence cross-device)', async () => {
    const u = await seedUser(pgSql, { role: 'citizen' })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/push-subscriptions',
      headers: { authorization: signSession(app, u.id, 'citizen') },
      payload: {
        endpoint: fakeEndpoint('a'),
        keys: { p256dh: 'p'.repeat(50), auth: 'a'.repeat(20) },
        reminderMinutesBefore: 60,
      },
    })
    expect(res.statusCode).toBe(201)

    const rows = await pgSql<{ reminder_minutes_before: number }[]>`
      SELECT reminder_minutes_before FROM users WHERE id = ${u.id}`
    expect(rows[0]?.reminder_minutes_before).toBe(60)
  })

  it('reminderMinutesBefore hors liste autorisée (45) → 400', async () => {
    const u = await seedUser(pgSql, { role: 'citizen' })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/push-subscriptions',
      headers: { authorization: signSession(app, u.id, 'citizen') },
      payload: {
        endpoint: fakeEndpoint('a'),
        keys: { p256dh: 'p'.repeat(50), auth: 'a'.repeat(20) },
        reminderMinutesBefore: 45,
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('endpoint vide / invalide → 400', async () => {
    const u = await seedUser(pgSql, { role: 'citizen' })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/push-subscriptions',
      headers: { authorization: signSession(app, u.id, 'citizen') },
      payload: {
        endpoint: 'not-a-url',
        keys: { p256dh: 'p'.repeat(50), auth: 'a'.repeat(20) },
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('keys.p256dh trop courte (<20) → 400', async () => {
    const u = await seedUser(pgSql, { role: 'citizen' })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/push-subscriptions',
      headers: { authorization: signSession(app, u.id, 'citizen') },
      payload: {
        endpoint: fakeEndpoint('a'),
        keys: { p256dh: 'short', auth: 'a'.repeat(20) },
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('deviceInfo arbitraire (objet) accepté et stocké tel quel', async () => {
    const u = await seedUser(pgSql, { role: 'citizen' })
    const endpoint = fakeEndpoint('a')
    const res = await app.inject({
      method: 'POST',
      url: '/v1/push-subscriptions',
      headers: { authorization: signSession(app, u.id, 'citizen') },
      payload: {
        endpoint,
        keys: { p256dh: 'p'.repeat(50), auth: 'a'.repeat(20) },
        deviceInfo: { ua: 'iPhone Safari', os: 'iOS 17.4' },
      },
    })
    expect(res.statusCode).toBe(201)

    const rows = await pgSql<{ device_info: { ua: string; os: string } }[]>`
      SELECT device_info FROM push_tokens WHERE endpoint = ${endpoint}`
    expect(rows[0]?.device_info).toEqual({ ua: 'iPhone Safari', os: 'iOS 17.4' })
  })

  it('un autre user re-subscribe sur le même endpoint → la row change de owner', async () => {
    // Cas pratique : un device partagé (tablette familiale) où user A se
    // déconnecte et user B se connecte. Le SW renvoie le même endpoint.
    const a = await seedUser(pgSql, { role: 'citizen' })
    const b = await seedUser(pgSql, { role: 'citizen' })
    const endpoint = fakeEndpoint('shared')

    await app.inject({
      method: 'POST',
      url: '/v1/push-subscriptions',
      headers: { authorization: signSession(app, a.id, 'citizen') },
      payload: {
        endpoint,
        keys: { p256dh: 'p'.repeat(50), auth: 'a'.repeat(20) },
      },
    })
    await app.inject({
      method: 'POST',
      url: '/v1/push-subscriptions',
      headers: { authorization: signSession(app, b.id, 'citizen') },
      payload: {
        endpoint,
        keys: { p256dh: 'p'.repeat(50), auth: 'a'.repeat(20) },
      },
    })

    const rows = await pgSql<{ user_id: string }[]>`
      SELECT user_id FROM push_tokens WHERE endpoint = ${endpoint}`
    expect(rows).toHaveLength(1)
    expect(rows[0]?.user_id).toBe(b.id)  // b a "pris" l'endpoint
  })
})

// ──────────────────────────────────────────────────────────────────────────
// GET /preferences
// ──────────────────────────────────────────────────────────────────────────

describe('GET /v1/push-subscriptions/preferences', () => {
  it('sans auth → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/push-subscriptions/preferences',
    })
    expect(res.statusCode).toBe(401)
  })

  it('user fresh (jamais set) → renvoie le default 15', async () => {
    const u = await seedUser(pgSql, { role: 'citizen' })
    const res = await app.inject({
      method: 'GET',
      url: '/v1/push-subscriptions/preferences',
      headers: { authorization: signSession(app, u.id, 'citizen') },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ reminderMinutesBefore: 15 })
  })

  it('user qui a déjà set une préférence → renvoie sa valeur', async () => {
    const u = await seedUser(pgSql, { role: 'citizen' })
    await pgSql`UPDATE users SET reminder_minutes_before = 120 WHERE id = ${u.id}`

    const res = await app.inject({
      method: 'GET',
      url: '/v1/push-subscriptions/preferences',
      headers: { authorization: signSession(app, u.id, 'citizen') },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ reminderMinutesBefore: 120 })
  })
})

// ──────────────────────────────────────────────────────────────────────────
// DELETE / — unsubscribe
// ──────────────────────────────────────────────────────────────────────────

describe('DELETE /v1/push-subscriptions', () => {
  it('sans auth → 401', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/push-subscriptions',
      payload: { endpoint: fakeEndpoint('a') },
    })
    expect(res.statusCode).toBe(401)
  })

  it('endpoint existant pour le user courant → 200 + row supprimée', async () => {
    const u = await seedUser(pgSql, { role: 'citizen' })
    const endpoint = fakeEndpoint('a')
    await app.inject({
      method: 'POST',
      url: '/v1/push-subscriptions',
      headers: { authorization: signSession(app, u.id, 'citizen') },
      payload: {
        endpoint,
        keys: { p256dh: 'p'.repeat(50), auth: 'a'.repeat(20) },
      },
    })

    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/push-subscriptions',
      headers: { authorization: signSession(app, u.id, 'citizen') },
      payload: { endpoint },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })

    const rows = await pgSql`SELECT count(*)::int as c FROM push_tokens WHERE endpoint = ${endpoint}`
    expect(rows[0]?.c).toBe(0)
  })

  it('idempotent : delete d\'un endpoint inexistant → 200', async () => {
    // Cas pratique : le user a clear ses données browser → la sub est
    // déjà retirée localement mais le client tente quand même un unsubscribe.
    const u = await seedUser(pgSql, { role: 'citizen' })
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/push-subscriptions',
      headers: { authorization: signSession(app, u.id, 'citizen') },
      payload: { endpoint: fakeEndpoint('never-existed') },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
  })

  it('user A ne peut PAS supprimer l\'endpoint d\'un user B (anti-leak)', async () => {
    const a = await seedUser(pgSql, { role: 'citizen' })
    const b = await seedUser(pgSql, { role: 'citizen' })
    const endpointB = fakeEndpoint('b')
    await app.inject({
      method: 'POST',
      url: '/v1/push-subscriptions',
      headers: { authorization: signSession(app, b.id, 'citizen') },
      payload: {
        endpoint: endpointB,
        keys: { p256dh: 'p'.repeat(50), auth: 'a'.repeat(20) },
      },
    })

    // A tente de supprimer la sub de B → 200 silencieux (idempotent) mais
    // la row de B reste intacte.
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/push-subscriptions',
      headers: { authorization: signSession(app, a.id, 'citizen') },
      payload: { endpoint: endpointB },
    })
    expect(res.statusCode).toBe(200)

    const rows = await pgSql`SELECT count(*)::int as c FROM push_tokens WHERE endpoint = ${endpointB}`
    expect(rows[0]?.c).toBe(1)
  })
})
