/**
 * Tests d'intégration POST /v1/auth/register.
 *
 * Stack identique à reservations.test.ts (testcontainers Postgres + Redis,
 * app.inject, TRUNCATE entre tests). On mock `firebase-admin` au niveau du
 * fichier pour pouvoir tester aussi bien le path "vérification sécurisée"
 * que le fallback dev "décodage sans signature".
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

/**
 * Mock firebase-admin : auth().verifyIdToken est une vi.fn() qu'on configure
 * par test. initializeApp et credential.cert sont des no-ops.
 */
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

/** Forge un token type-JWT avec payload base64url-encodé (signature factice). */
function craftToken(payload: Record<string, unknown>): string {
  const head = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${head}.${body}.signature-placeholder`
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
  // FIREBASE_* doivent être set AVANT le chargement de env.ts pour que
  // verifyFirebaseTokenSecure tente la vérification (sinon il return null
  // immédiatement et la branche firebase-admin n'est jamais couverte).
  process.env.FIREBASE_PROJECT_ID = 'sportlocker-test'
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{"type":"service_account","project_id":"sportlocker-test"}'
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
  } catch {
    /* ignore */
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

  // Reset le mock firebase-admin entre tests (chaque test contrôle son verdict).
  const admin = (await import('firebase-admin')).default
  ;(admin.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockReset()
})

describe('POST /v1/auth/register — vérification Firebase sécurisée', () => {
  it('échange un Firebase idToken valide contre un JWT de session (201)', async () => {
    const admin = (await import('firebase-admin')).default
    ;(admin.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      uid: 'firebase-uid-abc',
      email: 'verified@firebase.com',
      name: 'Verified User',
      email_verified: true,
    })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { idToken: 'a'.repeat(30) },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.sessionToken).toEqual(expect.any(String))
    expect(body.user.email).toBe('verified@firebase.com')
    expect(body.user.displayName).toBe('Verified User')
    expect(body.user.role).toBe('citizen')
    expect(body.user.trustScore).toBe(100)
    expect(body.user.communeId).toBeNull()

    // Persistance DB
    const rows = await pgSql`SELECT id, email, firebase_uid FROM users WHERE id = ${body.user.id}`
    expect(rows).toHaveLength(1)
    expect(rows[0]!.firebase_uid).toBe('firebase-uid-abc')
  })

  it('upsert : 2 appels successifs avec le même firebase_uid renvoient le même user.id', async () => {
    const admin = (await import('firebase-admin')).default
    const verify = admin.auth().verifyIdToken as ReturnType<typeof vi.fn>
    verify.mockResolvedValue({
      uid: 'firebase-uid-stable',
      email: 'stable@firebase.com',
      name: 'Stable User',
    })

    const first = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { idToken: 'a'.repeat(30) },
    })
    const second = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { idToken: 'b'.repeat(30) },
    })

    expect(first.statusCode).toBe(201)
    expect(second.statusCode).toBe(201)
    expect(second.json().user.id).toBe(first.json().user.id)

    const rows = await pgSql`SELECT COUNT(*)::int AS n FROM users WHERE firebase_uid = 'firebase-uid-stable'`
    expect(rows[0]!.n).toBe(1)
  })

  it('renvoie 400 missing_email_claim quand le claim email est absent', async () => {
    const admin = (await import('firebase-admin')).default
    ;(admin.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      uid: 'firebase-uid-noemail',
      // pas d'email
    })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { idToken: 'a'.repeat(30) },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('missing_email_claim')
  })
})

describe('POST /v1/auth/register — fallback dev (décodage sans signature)', () => {
  it("accepte un token forgé quand firebase-admin throw (mode test → unsafe decode)", async () => {
    const admin = (await import('firebase-admin')).default
    ;(admin.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('firebase_signature_invalid'),
    )

    const token = craftToken({ sub: 'dev-uid-1', email: 'dev1@test.local', name: 'Dev 1' })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { idToken: token },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().user.email).toBe('dev1@test.local')
  })

  it("renvoie 401 invalid_id_token quand le token a moins de 3 segments", async () => {
    const admin = (await import('firebase-admin')).default
    ;(admin.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('bad'))

    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { idToken: 'only.two-segments-here' }, // 2 segments
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('invalid_id_token')
  })

  it("renvoie 401 invalid_id_token quand le payload n'est pas du JSON parseable", async () => {
    const admin = (await import('firebase-admin')).default
    ;(admin.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('bad'))

    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      // 3 segments mais le payload n'est pas du base64url JSON valide
      payload: { idToken: 'aaa.!!!notbase64!!!.bbb' },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('invalid_id_token')
  })

  it("renvoie 401 invalid_id_token quand le payload n'a pas de sub", async () => {
    const admin = (await import('firebase-admin')).default
    ;(admin.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('bad'))

    const token = craftToken({ email: 'orphan@test.local' }) // sub manquant
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { idToken: token },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('invalid_id_token')
  })

  it("renvoie 401 invalid_id_token quand sub n'est pas une string", async () => {
    const admin = (await import('firebase-admin')).default
    ;(admin.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('bad'))

    const token = craftToken({ sub: 123 }) // sub numérique
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { idToken: token },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('invalid_id_token')
  })
})

describe('POST /v1/auth/register — mode production', () => {
  it("renvoie 401 invalid_id_token quand verifyFirebaseTokenSecure échoue (pas de fallback dev)", async () => {
    const envMod = await import('../../src/config/env.js')
    const original = envMod.env.NODE_ENV
    ;(envMod.env as { NODE_ENV: string }).NODE_ENV = 'production'

    const admin = (await import('firebase-admin')).default
    ;(admin.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('firebase_signature_invalid'),
    )

    try {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: { idToken: craftToken({ sub: 'prod-uid', email: 'prod@test.local' }) },
      })
      expect(res.statusCode).toBe(401)
      expect(res.json().error).toBe('invalid_id_token')
    } finally {
      ;(envMod.env as { NODE_ENV: string }).NODE_ENV = original
    }
  })
})

describe('POST /v1/auth/register — validation Zod', () => {
  it('renvoie 400 quand idToken est trop court (< 20 caractères)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { idToken: 'too-short' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('renvoie 400 quand idToken est absent du body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })
})
