/**
 * Tests d'intégration multi-tenant admin :
 *   - POST /v1/admin/auth/login (Firebase exchange → JWT session)
 *   - POST /v1/admin/invites (super_admin only, génère token+URL)
 *   - POST /v1/admin/invites/accept (consomme token, crée user, JWT session)
 *
 * Stack identique aux autres tests (testcontainers, app.inject, TRUNCATE).
 * firebase-admin est mocké au niveau du fichier.
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

type Role = 'citizen' | 'operator' | 'admin' | 'super_admin'

async function seedCommune(name = 'Paris Test'): Promise<string> {
  const id = randomUUID()
  const insee = String(70000 + Math.floor(Math.random() * 9999))
  await pgSql`INSERT INTO communes (id, insee_code, name, postal_code, department, region)
    VALUES (${id}, ${insee}, ${name}, '75001', '75', 'IDF')`
  return id
}

async function seedUser(opts: {
  role?: Role
  email?: string
  firebaseUid?: string
  communeId?: string
}): Promise<{ id: string; firebaseUid: string; email: string }> {
  const id = randomUUID()
  const firebaseUid = opts.firebaseUid ?? 'fb-' + id.slice(0, 8)
  const email = opts.email ?? id.slice(0, 8) + '@test.local'
  const role: Role = opts.role ?? 'citizen'
  await pgSql`INSERT INTO users (id, firebase_uid, email, role, commune_id)
    VALUES (${id}, ${firebaseUid}, ${email}, ${role}, ${opts.communeId ?? null})`
  return { id, firebaseUid, email }
}

function authHeader(userId: string, role: Role = 'citizen', communeId?: string): string {
  const token = app.jwt.sign({
    sub: userId,
    role,
    ...(communeId ? { communeId } : {}),
  })
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

  const admin = (await import('firebase-admin')).default
  ;(admin.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockReset()
})

describe('POST /v1/admin/auth/login', () => {
  it('admin existant → 200 + JWT session avec role + communeId', async () => {
    const communeId = await seedCommune('Lyon')
    const u = await seedUser({
      role: 'admin',
      email: 'admin@lyon.fr',
      firebaseUid: 'fb-admin-lyon',
      communeId,
    })

    const firebase = (await import('firebase-admin')).default
    ;(firebase.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      uid: 'fb-admin-lyon',
      email: 'admin@lyon.fr',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/auth/login',
      payload: { firebaseIdToken: 'a'.repeat(30) },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.user.id).toBe(u.id)
    expect(body.user.role).toBe('admin')
    expect(body.user.communeId).toBe(communeId)
    expect(typeof body.sessionToken).toBe('string')

    // Le JWT signé doit contenir le communeId pour le scoping.
    const decoded = app.jwt.verify(body.sessionToken) as { sub: string; role: string; communeId?: string }
    expect(decoded.sub).toBe(u.id)
    expect(decoded.role).toBe('admin')
    expect(decoded.communeId).toBe(communeId)
  })

  it('super_admin existant → 200 + JWT session sans communeId', async () => {
    const u = await seedUser({
      role: 'super_admin',
      email: 'stan@sportlocker.fr',
      firebaseUid: 'fb-stan',
    })

    const firebase = (await import('firebase-admin')).default
    ;(firebase.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      uid: 'fb-stan',
      email: 'stan@sportlocker.fr',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/auth/login',
      payload: { firebaseIdToken: 'a'.repeat(30) },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.user.id).toBe(u.id)
    expect(body.user.role).toBe('super_admin')
    expect(body.user.communeId).toBeNull()
  })

  it('citizen (pas admin) → 401 not_an_admin', async () => {
    await seedUser({
      role: 'citizen',
      email: 'citoyen@test.local',
      firebaseUid: 'fb-citizen',
    })

    const firebase = (await import('firebase-admin')).default
    ;(firebase.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      uid: 'fb-citizen',
      email: 'citoyen@test.local',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/auth/login',
      payload: { firebaseIdToken: 'a'.repeat(30) },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('not_an_admin')
  })

  it('Firebase UID inexistant en DB → 401 admin_user_not_found', async () => {
    const firebase = (await import('firebase-admin')).default
    ;(firebase.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      uid: 'fb-ghost',
      email: 'ghost@nowhere.com',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/auth/login',
      payload: { firebaseIdToken: 'a'.repeat(30) },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('admin_user_not_found')
  })

  it('admin banni → 401 user_banned', async () => {
    const communeId = await seedCommune()
    await seedUser({
      role: 'admin',
      email: 'banned@admin.com',
      firebaseUid: 'fb-banned',
      communeId,
    })
    await pgSql`UPDATE users SET is_banned = TRUE WHERE firebase_uid = 'fb-banned'`

    const firebase = (await import('firebase-admin')).default
    ;(firebase.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      uid: 'fb-banned',
      email: 'banned@admin.com',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/auth/login',
      payload: { firebaseIdToken: 'a'.repeat(30) },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('user_banned')
  })

  it('Firebase verify échoue + token non décodable → 401 invalid_id_token', async () => {
    const firebase = (await import('firebase-admin')).default
    ;(firebase.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('bad signature'),
    )

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/auth/login',
      payload: { firebaseIdToken: 'only.two-segments' },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('invalid_id_token')
  })
})

describe('POST /v1/admin/invites', () => {
  it('super_admin crée un invite → 201 + token + inviteUrl', async () => {
    const communeId = await seedCommune('Marseille')
    const su = await seedUser({ role: 'super_admin' })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/',
      headers: { authorization: authHeader(su.id, 'super_admin') },
      payload: {
        email: 'newadmin@marseille.fr',
        communeId,
        expiresInHours: 48,
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(typeof body.token).toBe('string')
    expect(body.token.length).toBeGreaterThan(20)
    expect(body.inviteUrl).toContain('https://app.sportlocker.fr/accept-invite?token=')
    expect(body.communeId).toBe(communeId)
    expect(body.email).toBe('newadmin@marseille.fr')

    // Persistance DB
    const rows = await pgSql`SELECT token, email, commune_id, expires_at, accepted_at
      FROM admin_invites WHERE token = ${body.token}`
    expect(rows).toHaveLength(1)
    expect(rows[0]!.commune_id).toBe(communeId)
    expect(rows[0]!.accepted_at).toBeNull()
  })

  it('admin (pas super) → 403 forbidden_super_admin_required', async () => {
    const communeId = await seedCommune()
    const adminUser = await seedUser({ role: 'admin', communeId })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/',
      headers: { authorization: authHeader(adminUser.id, 'admin', communeId) },
      payload: {
        email: 'someone@test.local',
        communeId,
      },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('forbidden_super_admin_required')
  })

  it('commune inconnue → 404 commune_not_found', async () => {
    const su = await seedUser({ role: 'super_admin' })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/',
      headers: { authorization: authHeader(su.id, 'super_admin') },
      payload: {
        email: 'who@where.fr',
        communeId: randomUUID(),
      },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('commune_not_found')
  })

  it('sans token de session → 401', async () => {
    const communeId = await seedCommune()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/',
      payload: { email: 'x@y.fr', communeId },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('POST /v1/admin/invites/accept', () => {
  async function createInvite(communeId: string, email = 'invited@test.local', hours = 72): Promise<string> {
    const su = await seedUser({ role: 'super_admin', firebaseUid: 'fb-su-' + randomUUID().slice(0, 6) })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/',
      headers: { authorization: authHeader(su.id, 'super_admin') },
      payload: { email, communeId, expiresInHours: hours },
    })
    expect(res.statusCode).toBe(201)
    return res.json().token
  }

  it('invite valide + Firebase token valide → 200 + user créé role=admin + commune_id', async () => {
    const communeId = await seedCommune('Nice')
    const token = await createInvite(communeId, 'nouveau@nice.fr')

    const firebase = (await import('firebase-admin')).default
    ;(firebase.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      uid: 'fb-new-admin',
      email: 'nouveau@nice.fr',
      name: 'Nouveau Admin',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/accept',
      payload: { token, firebaseIdToken: 'a'.repeat(30) },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.user.role).toBe('admin')
    expect(body.user.communeId).toBe(communeId)
    expect(body.user.email).toBe('nouveau@nice.fr')
    expect(typeof body.sessionToken).toBe('string')

    // User créé en DB avec le bon rôle + commune
    const users = await pgSql`SELECT role, commune_id FROM users WHERE firebase_uid = 'fb-new-admin'`
    expect(users).toHaveLength(1)
    expect(users[0]!.role).toBe('admin')
    expect(users[0]!.commune_id).toBe(communeId)

    // Invite flagué accepted
    const invites = await pgSql`SELECT accepted_at FROM admin_invites WHERE token = ${token}`
    expect(invites[0]!.accepted_at).not.toBeNull()
  })

  it('invite expiré → 410 invite_expired', async () => {
    const communeId = await seedCommune()
    const token = await createInvite(communeId, 'expired@test.local', 72)
    // Force expires_at dans le passé
    await pgSql`UPDATE admin_invites SET expires_at = NOW() - INTERVAL '1 hour'
      WHERE token = ${token}`

    const firebase = (await import('firebase-admin')).default
    ;(firebase.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      uid: 'fb-expired',
      email: 'expired@test.local',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/accept',
      payload: { token, firebaseIdToken: 'a'.repeat(30) },
    })
    expect(res.statusCode).toBe(410)
    expect(res.json().error).toBe('invite_expired')
  })

  it('invite déjà accepté → 409 invite_already_accepted', async () => {
    const communeId = await seedCommune()
    const token = await createInvite(communeId, 'used@test.local')
    await pgSql`UPDATE admin_invites SET accepted_at = NOW() WHERE token = ${token}`

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/accept',
      payload: { token, firebaseIdToken: 'a'.repeat(30) },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('invite_already_accepted')
  })

  it('token inconnu → 404 invite_not_found', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/accept',
      payload: { token: 'aaaaaaaaaaaaaaaaaaaaaaaaaa', firebaseIdToken: 'a'.repeat(30) },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('invite_not_found')
  })
})

describe('Multi-tenant isolation : un admin commune A ne voit pas les data commune B', () => {
  it('GET /v1/admin/communes : admin commune A ne voit que sa commune', async () => {
    const communeA = await seedCommune('CommuneA')
    const communeB = await seedCommune('CommuneB')
    const adminA = await seedUser({ role: 'admin', communeId: communeA })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/communes/',
      headers: { authorization: authHeader(adminA.id, 'admin', communeA) },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe(communeA)
    expect(items.find((c: { id: string }) => c.id === communeB)).toBeUndefined()
  })

  it('GET /v1/admin/communes : super_admin voit toutes les communes', async () => {
    const communeA = await seedCommune('CommuneA')
    const communeB = await seedCommune('CommuneB')
    const su = await seedUser({ role: 'super_admin' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/communes/',
      headers: { authorization: authHeader(su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const items: { id: string }[] = res.json().items
    const ids = items.map((c) => c.id)
    expect(ids).toContain(communeA)
    expect(ids).toContain(communeB)
  })

  it('GET /v1/admin/communes/:id (commune B) par admin A → 404', async () => {
    const communeA = await seedCommune('CommuneA')
    const communeB = await seedCommune('CommuneB')
    const adminA = await seedUser({ role: 'admin', communeId: communeA })

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/communes/${communeB}`,
      headers: { authorization: authHeader(adminA.id, 'admin', communeA) },
    })
    expect(res.statusCode).toBe(404)
  })

  it('POST /v1/admin/communes par admin (pas super) → 403', async () => {
    const communeA = await seedCommune('CommuneA')
    const adminA = await seedUser({ role: 'admin', communeId: communeA })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/communes/',
      headers: { authorization: authHeader(adminA.id, 'admin', communeA) },
      payload: {
        inseeCode: '75999',
        name: 'Tentative',
        postalCode: '75001',
        department: '75',
        region: 'IDF',
      },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('forbidden_super_admin_required')
  })
})
