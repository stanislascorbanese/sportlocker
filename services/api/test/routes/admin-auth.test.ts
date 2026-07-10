/**
 * Tests d'intégration multi-tenant admin :
 *   - POST /v1/admin/auth/login (Firebase exchange → JWT session)
 *   - POST /v1/admin/invites (admin scopé sur sa commune ou super_admin, génère token+URL)
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
      // 2 segments seulement (pas 3) → indécodable comme JWT, mais ≥ 20 chars
      // pour passer la validation Zod min(20).
      payload: { firebaseIdToken: 'aaaaaaaaaa.bbbbbbbbbbb' },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('invalid_id_token')
  })

  it('admin sans communeId → 401 admin_missing_commune (fix sécurité multi-tenant)', async () => {
    // Garde-fou anti bypass scope multi-tenant : un user role=admin avec
    // communeId NULL recevait avant un JWT sans communeId et bypass
    // requireAdminScope (fallback scope=null). Fix dans #42 : login refusé.
    await seedUser({
      role: 'admin',
      email: 'orphan-admin@test.local',
      firebaseUid: 'fb-orphan-admin',
      // pas de communeId
    })

    const firebase = (await import('firebase-admin')).default
    ;(firebase.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      uid: 'fb-orphan-admin',
      email: 'orphan-admin@test.local',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/auth/login',
      payload: { firebaseIdToken: 'a'.repeat(30) },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('admin_missing_commune')
  })

  it('user role=operator (DEPRECATED) → 401 not_an_admin', async () => {
    const communeId = await seedCommune('CommuneOp')
    await seedUser({
      role: 'operator',
      email: 'op@test.local',
      firebaseUid: 'fb-operator',
      communeId,
    })

    const firebase = (await import('firebase-admin')).default
    ;(firebase.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      uid: 'fb-operator',
      email: 'op@test.local',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/auth/login',
      payload: { firebaseIdToken: 'a'.repeat(30) },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('not_an_admin')
  })

  it('réponse 200 contient bien { sessionToken, user{id,email,role,communeId} }', async () => {
    const communeId = await seedCommune('CompletShape')
    const u = await seedUser({
      role: 'admin',
      email: 'shape@test.local',
      firebaseUid: 'fb-shape',
      communeId,
    })

    const firebase = (await import('firebase-admin')).default
    ;(firebase.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      uid: 'fb-shape',
      email: 'shape@test.local',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/auth/login',
      payload: { firebaseIdToken: 'a'.repeat(30) },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Object.keys(body).sort()).toEqual(['sessionToken', 'user'])
    expect(Object.keys(body.user).sort()).toEqual(['communeId', 'email', 'id', 'role'])
    expect(body.user.id).toBe(u.id)
    expect(body.user.email).toBe('shape@test.local')
    expect(body.user.role).toBe('admin')
    expect(body.user.communeId).toBe(communeId)
    expect(typeof body.sessionToken).toBe('string')
    expect(body.sessionToken.split('.')).toHaveLength(3)
  })

  it('Firebase secure échoue + JWT décodable + NODE_ENV=test → fallback unsafe accepte', async () => {
    // Quand verifyIdToken rejette, le code essaie decodeFirebaseTokenUnsafe
    // tant que NODE_ENV !== 'production'. On forge un JWT base64url valide
    // avec sub correspondant à un admin DB → login accepté.
    const communeId = await seedCommune('Fallback')
    const u = await seedUser({
      role: 'admin',
      email: 'fallback@test.local',
      firebaseUid: 'fb-fallback-dev',
      communeId,
    })

    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({
      sub: 'fb-fallback-dev',
      email: 'fallback@test.local',
    })).toString('base64url')
    const forgedToken = `${header}.${payload}.sigsigsigsigsigsig`

    const firebase = (await import('firebase-admin')).default
    ;(firebase.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('bad signature'),
    )

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/auth/login',
      payload: { firebaseIdToken: forgedToken },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.user.id).toBe(u.id)
    expect(body.user.communeId).toBe(communeId)
  })

  it('Firebase secure échoue + NODE_ENV=production → pas de fallback → 401', async () => {
    // On force temporairement env.NODE_ENV='production' pour vérifier que
    // le fallback decodeFirebaseTokenUnsafe est désactivé en prod.
    const { env } = await import('../../src/config/env.js')
    const previousEnv = env.NODE_ENV
    ;(env as { NODE_ENV: string }).NODE_ENV = 'production'

    try {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
      const payload = Buffer.from(JSON.stringify({
        sub: 'fb-prod-attacker',
        email: 'attacker@evil.com',
      })).toString('base64url')
      const forgedToken = `${header}.${payload}.sig`

      const firebase = (await import('firebase-admin')).default
      ;(firebase.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('bad signature'),
      )

      const res = await app.inject({
        method: 'POST',
        url: '/v1/admin/auth/login',
        payload: { firebaseIdToken: forgedToken },
      })
      expect(res.statusCode).toBe(401)
      expect(res.json().error).toBe('invalid_id_token')
    } finally {
      ;(env as { NODE_ENV: string }).NODE_ENV = previousEnv
    }
  })

  it('JWT décodable mais payload sans sub → 401 invalid_id_token', async () => {
    // decodeFirebaseTokenUnsafe exige typeof sub === 'string'. Sans sub →
    // retourne null → 401.
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({
      email: 'no-sub@test.local',
    })).toString('base64url')
    const forgedToken = `${header}.${payload}.sig`

    const firebase = (await import('firebase-admin')).default
    ;(firebase.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('bad signature'),
    )

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/auth/login',
      payload: { firebaseIdToken: forgedToken },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('invalid_id_token')
  })

  it('Firebase rejette (token expiré côté Firebase) + token non décodable → 401', async () => {
    // Simule un cas réel : Firebase rejette pour token expiré (auth/id-token-expired)
    // et le payload n'est pas un JWT valide → 401.
    const firebase = (await import('firebase-admin')).default
    ;(firebase.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error('Firebase ID token has expired'), { code: 'auth/id-token-expired' }),
    )

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/auth/login',
      payload: { firebaseIdToken: 'not-a-jwt-just-padding-to-pass-min20' },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('invalid_id_token')
  })

  it('admin avec gdpr_deleted_at non null → 401 user_deleted (RGPD)', async () => {
    // Un user dont les données ont été anonymisées par le cron RGPD
    // (gdpr_deleted_at posé 30j après la demande) ne peut plus se
    // reconnecter même si son compte Firebase est encore actif (fix #42).
    const communeId = await seedCommune('GdprBug')
    const u = await seedUser({
      role: 'admin',
      email: 'gdpr@test.local',
      firebaseUid: 'fb-gdpr-deleted',
      communeId,
    })
    await pgSql`UPDATE users SET gdpr_deleted_at = NOW() WHERE id = ${u.id}`

    const firebase = (await import('firebase-admin')).default
    ;(firebase.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      uid: 'fb-gdpr-deleted',
      email: 'gdpr@test.local',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/auth/login',
      payload: { firebaseIdToken: 'a'.repeat(30) },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('user_deleted')
  })

  it('body sans firebaseIdToken → 400 validation_error', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/auth/login',
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })

  it('firebaseIdToken trop court (< 20 chars) → 400 validation_error', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/auth/login',
      payload: { firebaseIdToken: 'short' },
    })
    expect(res.statusCode).toBe(400)
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

  it('admin → 201 : peut inviter dans SA commune', async () => {
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
    expect(res.statusCode).toBe(201)
    expect(res.json().communeId).toBe(communeId)
  })

  it('admin visant une autre commune → 403 forbidden_cross_commune', async () => {
    const own = await seedCommune()
    const other = await seedCommune()
    const adminUser = await seedUser({ role: 'admin', communeId: own })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/',
      headers: { authorization: authHeader(adminUser.id, 'admin', own) },
      payload: {
        email: 'someone@test.local',
        communeId: other,
      },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('forbidden_cross_commune')
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

  it('Firebase verify échoue + token indécodable → 401 invalid_id_token', async () => {
    const communeId = await seedCommune('FbFail')
    const token = await createInvite(communeId, 'fbfail@test.local')

    const firebase = (await import('firebase-admin')).default
    ;(firebase.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('bad signature'),
    )

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/accept',
      // 2 segments → indécodable JWT, ≥ 20 chars pour passer Zod
      payload: { token, firebaseIdToken: 'aaaaaaaaaa.bbbbbbbbbbb' },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('invalid_id_token')
  })

  it('Firebase claims sans email → 400 missing_email_claim', async () => {
    const communeId = await seedCommune('NoEmail')
    const token = await createInvite(communeId, 'noemail@test.local')

    const firebase = (await import('firebase-admin')).default
    ;(firebase.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      uid: 'fb-no-email',
      // pas d'email — Firebase peut omettre si pas vérifié ou compte téléphone
    })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/accept',
      payload: { token, firebaseIdToken: 'a'.repeat(30) },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('missing_email_claim')
  })

  it('email mismatch invite vs claims Firebase → 200 (tolérance documentée)', async () => {
    // Comportement documenté dans admin-invites.ts : Firebase est source de
    // vérité pour l'identité, l'email de l'invite est juste l'adresse
    // destination du lien. On accepte donc le mismatch.
    const communeId = await seedCommune('Mismatch')
    const token = await createInvite(communeId, 'invited@expected.fr')

    const firebase = (await import('firebase-admin')).default
    ;(firebase.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      uid: 'fb-different-account',
      email: 'actually-using@different.fr',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/accept',
      payload: { token, firebaseIdToken: 'a'.repeat(30) },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    // User créé avec l'email Firebase, pas celui de l'invite
    expect(body.user.email).toBe('actually-using@different.fr')
    expect(body.user.communeId).toBe(communeId)
    expect(body.user.role).toBe('admin')
  })

  it('user existant role=citizen accepte invite → promu admin', async () => {
    const communeId = await seedCommune('Promo')
    const existing = await seedUser({
      role: 'citizen',
      email: 'citoyen-promu@test.local',
      firebaseUid: 'fb-citizen-promo',
    })
    const token = await createInvite(communeId, 'citoyen-promu@test.local')

    const firebase = (await import('firebase-admin')).default
    ;(firebase.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      uid: 'fb-citizen-promo',
      email: 'citoyen-promu@test.local',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/accept',
      payload: { token, firebaseIdToken: 'a'.repeat(30) },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.user.id).toBe(existing.id)
    expect(body.user.role).toBe('admin')
    expect(body.user.communeId).toBe(communeId)

    const rows = await pgSql`SELECT role, commune_id FROM users WHERE id = ${existing.id}`
    expect(rows[0]!.role).toBe('admin')
    expect(rows[0]!.commune_id).toBe(communeId)

    const invites = await pgSql`SELECT accepted_at FROM admin_invites WHERE token = ${token}`
    expect(invites[0]!.accepted_at).not.toBeNull()
  })

  it('user existant role=super_admin accepte invite → reste super_admin (pas dégradé)', async () => {
    // Garantie de sécurité explicite : un super_admin qui accepterait par
    // erreur un invite admin ne doit pas être rétrogradé.
    const communeId = await seedCommune('NoDowngrade')
    const existing = await seedUser({
      role: 'super_admin',
      email: 'su@sportlocker.fr',
      firebaseUid: 'fb-su-existing',
    })
    const token = await createInvite(communeId, 'su@sportlocker.fr')

    const firebase = (await import('firebase-admin')).default
    ;(firebase.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      uid: 'fb-su-existing',
      email: 'su@sportlocker.fr',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/accept',
      payload: { token, firebaseIdToken: 'a'.repeat(30) },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.user.id).toBe(existing.id)
    expect(body.user.role).toBe('super_admin')
    // communeId du user est cependant mis à jour par le upsert (cf. set:{communeId})
    expect(body.user.communeId).toBe(communeId)

    const rows = await pgSql`SELECT role FROM users WHERE id = ${existing.id}`
    expect(rows[0]!.role).toBe('super_admin')

    const invites = await pgSql`SELECT accepted_at FROM admin_invites WHERE token = ${token}`
    expect(invites[0]!.accepted_at).not.toBeNull()
  })

  it('body sans token → 400 validation_error', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/accept',
      payload: { firebaseIdToken: 'a'.repeat(30) },
    })
    expect(res.statusCode).toBe(400)
  })

  it('token trop court (< 20 chars) → 400 validation_error', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/accept',
      payload: { token: 'short', firebaseIdToken: 'a'.repeat(30) },
    })
    expect(res.statusCode).toBe(400)
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
