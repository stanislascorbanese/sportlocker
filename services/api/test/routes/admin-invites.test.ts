/**
 * Tests d'intégration pour /v1/admin/invites (POST / + POST /accept).
 *
 * Périmètre :
 *   - POST / : super_admin crée invite (201 + token + inviteUrl)
 *              admin tenant 403, citizen 403, sans auth 401, commune inconnue 404,
 *              défauts Zod, persistance DB.
 *   - POST /accept : token valide → user créé/promu admin avec communeId ;
 *                    409 si déjà accepté, 410 si expiré, 404 si inconnu,
 *                    401 si Firebase token invalide, 400 si missing email claim,
 *                    400 sur body invalide (token absent, token < 20),
 *                    email mismatch toléré (Firebase = source de vérité).
 *
 * NB : certains cas de bord (promotion citizen → admin, super_admin pas dégradé)
 * sont déjà testés dans admin-auth.test.ts. Ce fichier est focalisé sur le
 * contrat externe du module invites et les invariants de sécurité.
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

/** Helper minimal pour fabriquer un invite directement en DB sans passer par POST /. */
async function insertInvite(opts: {
  communeId: string
  email?: string
  expiresInHours?: number
  acceptedAt?: Date | null
}): Promise<string> {
  const token = 'tk-' + randomUUID().replaceAll('-', '') + randomUUID().slice(0, 8)
  const email = opts.email ?? 'invited@test.local'
  const expiresAt = new Date(Date.now() + (opts.expiresInHours ?? 72) * 3_600_000)
  await pgSql`INSERT INTO admin_invites (token, email, commune_id, expires_at, accepted_at)
    VALUES (${token}, ${email}, ${opts.communeId}, ${expiresAt.toISOString()},
            ${opts.acceptedAt ? opts.acceptedAt.toISOString() : null})`
  return token
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

describe('POST /v1/admin/invites — création scopée', () => {
  it('super_admin crée invite → 201 + token + inviteUrl + email lowercased + expiresAt cohérent', async () => {
    const communeId = await seedCommune(pgSql, 'Marseille Invite')
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: {
        email: 'Marie@Marseille.FR',
        communeId,
        expiresInHours: 48,
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(typeof body.token).toBe('string')
    expect(body.token.length).toBeGreaterThan(20)
    expect(body.email).toBe('marie@marseille.fr')
    expect(body.communeId).toBe(communeId)
    expect(body.inviteUrl).toContain('https://app.sportlocker.fr/accept-invite?token=')
    expect(body.inviteUrl).toContain(encodeURIComponent(body.token))
    // expiresAt ≈ now + 48h
    const expiresAt = new Date(body.expiresAt).getTime()
    const expected = Date.now() + 48 * 3_600_000
    expect(Math.abs(expiresAt - expected)).toBeLessThan(60_000)

    const rows = await pgSql`SELECT token, email, commune_id, accepted_at
      FROM admin_invites WHERE token = ${body.token}`
    expect(rows).toHaveLength(1)
    expect(rows[0]!.email).toBe('marie@marseille.fr')
    expect(rows[0]!.accepted_at).toBeNull()
  })

  it('expiresInHours par défaut = 72h si non fourni', async () => {
    const communeId = await seedCommune(pgSql, 'DefaultExp')
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: { email: 'default@expiry.fr', communeId },
    })
    expect(res.statusCode).toBe(201)
    const expiresAt = new Date(res.json().expiresAt).getTime()
    const expected = Date.now() + 72 * 3_600_000
    expect(Math.abs(expiresAt - expected)).toBeLessThan(60_000)
  })

  it('admin scoped → 201 : peut inviter dans SA commune', async () => {
    const communeId = await seedCommune(pgSql)
    const admin = await seedUser(pgSql, { role: 'admin', communeId })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/',
      headers: { authorization: signSession(app, admin.id, 'admin', communeId) },
      payload: { email: 'other@test.local', communeId },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().communeId).toBe(communeId)
  })

  it('admin scoped sans communeId dans le body → 201 : forcé à sa commune', async () => {
    const communeId = await seedCommune(pgSql)
    const admin = await seedUser(pgSql, { role: 'admin', communeId })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/',
      headers: { authorization: signSession(app, admin.id, 'admin', communeId) },
      payload: { email: 'scoped@test.local' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().communeId).toBe(communeId)
  })

  it('admin qui vise une AUTRE commune → 403 forbidden_cross_commune', async () => {
    const own = await seedCommune(pgSql, 'Own')
    const other = await seedCommune(pgSql, 'Other')
    const admin = await seedUser(pgSql, { role: 'admin', communeId: own })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/',
      headers: { authorization: signSession(app, admin.id, 'admin', own) },
      payload: { email: 'cross@test.local', communeId: other },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('forbidden_cross_commune')
  })

  it('super_admin sans communeId → 400 commune_id_required', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: { email: 'nocommune@test.local' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('commune_id_required')
  })

  it('citizen → 403', async () => {
    const communeId = await seedCommune(pgSql)
    const citizen = await seedUser(pgSql, { role: 'citizen' })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/',
      headers: { authorization: signSession(app, citizen.id, 'citizen') },
      payload: { email: 'cit@test.local', communeId },
    })
    expect(res.statusCode).toBe(403)
  })

  it('sans token → 401', async () => {
    const communeId = await seedCommune(pgSql)
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/',
      payload: { email: 'no-auth@test.local', communeId },
    })
    expect(res.statusCode).toBe(401)
  })

  it('commune inconnue → 404 commune_not_found', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: { email: 'ghost@nowhere.fr', communeId: randomUUID() },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('commune_not_found')
  })

  it('email invalide → 400', async () => {
    const communeId = await seedCommune(pgSql)
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: { email: 'pas-un-email', communeId },
    })
    expect(res.statusCode).toBe(400)
  })

  it('expiresInHours > 720 → 400 (max 30j)', async () => {
    const communeId = await seedCommune(pgSql)
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: { email: 'too@long.fr', communeId, expiresInHours: 1000 },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('POST /v1/admin/invites/accept — flow complet', () => {
  it('invite valide + Firebase OK → 200 + user créé role=admin + commune_id + sessionToken JWT', async () => {
    const communeId = await seedCommune(pgSql, 'NewAdminCommune')
    const token = await insertInvite({ communeId, email: 'newadmin@test.local' })

    const firebase = (await import('firebase-admin')).default
    ;(firebase.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      uid: 'fb-newadmin',
      email: 'newadmin@test.local',
      name: 'Nouvel Admin',
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
    expect(body.user.email).toBe('newadmin@test.local')
    expect(typeof body.sessionToken).toBe('string')
    expect(body.sessionToken.split('.')).toHaveLength(3)

    // Le JWT contient bien role + communeId
    const decoded = app.jwt.verify(body.sessionToken) as { sub: string; role: string; communeId?: string }
    expect(decoded.role).toBe('admin')
    expect(decoded.communeId).toBe(communeId)

    // User créé en DB
    const users = await pgSql`SELECT role, commune_id, display_name
      FROM users WHERE firebase_uid = 'fb-newadmin'`
    expect(users).toHaveLength(1)
    expect(users[0]!.role).toBe('admin')
    expect(users[0]!.commune_id).toBe(communeId)
    expect(users[0]!.display_name).toBe('Nouvel Admin')

    // Invite marqué accepted_at
    const invites = await pgSql`SELECT accepted_at FROM admin_invites WHERE token = ${token}`
    expect(invites[0]!.accepted_at).not.toBeNull()
  })

  it('token inconnu → 404 invite_not_found', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/accept',
      payload: {
        token: 'unknown-' + randomUUID().replaceAll('-', ''),
        firebaseIdToken: 'a'.repeat(30),
      },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('invite_not_found')
  })

  it('invite déjà accepté (idempotence anti-replay) → 409 invite_already_accepted', async () => {
    const communeId = await seedCommune(pgSql)
    const token = await insertInvite({ communeId, acceptedAt: new Date() })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/accept',
      payload: { token, firebaseIdToken: 'a'.repeat(30) },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('invite_already_accepted')
  })

  it('invite expiré → 410 invite_expired', async () => {
    const communeId = await seedCommune(pgSql)
    const token = 'expired-' + randomUUID().replaceAll('-', '')
    const expiredAt = new Date(Date.now() - 3600_000)
    await pgSql`INSERT INTO admin_invites (token, email, commune_id, expires_at)
      VALUES (${token}, 'past@test.local', ${communeId}, ${expiredAt.toISOString()})`

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/accept',
      payload: { token, firebaseIdToken: 'a'.repeat(30) },
    })
    expect(res.statusCode).toBe(410)
    expect(res.json().error).toBe('invite_expired')
  })

  it('Firebase verify rejette + token indécodable → 401 invalid_id_token', async () => {
    const communeId = await seedCommune(pgSql)
    const token = await insertInvite({ communeId })

    const firebase = (await import('firebase-admin')).default
    ;(firebase.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('bad signature'),
    )

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/accept',
      // 2 segments → indécodable JWT, ≥ 20 chars pour passer Zod
      payload: { token, firebaseIdToken: 'aaaaaaaaaaa.bbbbbbbbbbb' },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('invalid_id_token')
  })

  it('Firebase claims sans email → 400 missing_email_claim', async () => {
    const communeId = await seedCommune(pgSql)
    const token = await insertInvite({ communeId })

    const firebase = (await import('firebase-admin')).default
    ;(firebase.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      uid: 'fb-noemail',
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

  it('email mismatch invite ≠ Firebase → 200 (Firebase = source de vérité)', async () => {
    // Documentation explicite côté route : on tolère le mismatch.
    const communeId = await seedCommune(pgSql, 'Mismatch')
    const token = await insertInvite({ communeId, email: 'destinataire@expected.fr' })

    const firebase = (await import('firebase-admin')).default
    ;(firebase.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      uid: 'fb-different',
      email: 'real-user@somewhere-else.fr',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/accept',
      payload: { token, firebaseIdToken: 'a'.repeat(30) },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    // User créé avec l'email Firebase, PAS celui de l'invite
    expect(body.user.email).toBe('real-user@somewhere-else.fr')
    expect(body.user.role).toBe('admin')
    expect(body.user.communeId).toBe(communeId)
  })

  it('email Firebase normalisé en lowercase à l\'insertion user', async () => {
    const communeId = await seedCommune(pgSql)
    const token = await insertInvite({ communeId })

    const firebase = (await import('firebase-admin')).default
    ;(firebase.auth().verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      uid: 'fb-mixedcase',
      email: 'Mixed.CASE@Sample.FR',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/accept',
      payload: { token, firebaseIdToken: 'a'.repeat(30) },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().user.email).toBe('mixed.case@sample.fr')
    const rows = await pgSql`SELECT email FROM users WHERE firebase_uid = 'fb-mixedcase'`
    expect(rows[0]!.email).toBe('mixed.case@sample.fr')
  })
})

describe('POST /v1/admin/invites/accept — validation Zod', () => {
  it('body sans token → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/accept',
      payload: { firebaseIdToken: 'a'.repeat(30) },
    })
    expect(res.statusCode).toBe(400)
  })

  it('token trop court (< 20 chars) → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/accept',
      payload: { token: 'too-short', firebaseIdToken: 'a'.repeat(30) },
    })
    expect(res.statusCode).toBe(400)
  })

  it('body sans firebaseIdToken → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/accept',
      payload: { token: 'a'.repeat(40) },
    })
    expect(res.statusCode).toBe(400)
  })

  it('firebaseIdToken trop court (< 20 chars) → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/accept',
      payload: { token: 'a'.repeat(40), firebaseIdToken: 'short' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('body vide → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/invites/accept',
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('GET /v1/admin/invites — liste + statut dérivé', () => {
  it('super_admin voit toutes les invites avec statut pending/accepted/expired', async () => {
    const commune = await seedCommune(pgSql, 'ListCommune')
    await insertInvite({ communeId: commune, email: 'pending@test.local' })
    await insertInvite({ communeId: commune, email: 'accepted@test.local', acceptedAt: new Date() })
    await insertInvite({ communeId: commune, email: 'expired@test.local', expiresInHours: -1 })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/invites/',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as { email: string; status: string; communeName: string }[]
    expect(items).toHaveLength(3)
    const byEmail = Object.fromEntries(items.map((i) => [i.email, i.status]))
    expect(byEmail['pending@test.local']).toBe('pending')
    expect(byEmail['accepted@test.local']).toBe('accepted')
    expect(byEmail['expired@test.local']).toBe('expired')
    expect(items[0]!.communeName).toBe('ListCommune')
  })

  it('admin scoped → uniquement les invites de sa commune', async () => {
    const a = await seedCommune(pgSql, 'A')
    const b = await seedCommune(pgSql, 'B')
    await insertInvite({ communeId: a, email: 'a@test.local' })
    await insertInvite({ communeId: b, email: 'b@test.local' })
    const adminA = await seedUser(pgSql, { role: 'admin', communeId: a })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/invites/',
      headers: { authorization: signSession(app, adminA.id, 'admin', a) },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as { email: string }[]
    expect(items).toHaveLength(1)
    expect(items[0]!.email).toBe('a@test.local')
  })

  it('super_admin filtre par communeId', async () => {
    const a = await seedCommune(pgSql, 'A')
    const b = await seedCommune(pgSql, 'B')
    await insertInvite({ communeId: a })
    await insertInvite({ communeId: b })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/invites/?communeId=${a}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as { communeId: string }[]
    expect(items).toHaveLength(1)
    expect(items[0]!.communeId).toBe(a)
  })

  it('citizen → 403, sans token → 401', async () => {
    const citizen = await seedUser(pgSql, { role: 'citizen' })
    const r403 = await app.inject({
      method: 'GET', url: '/v1/admin/invites/',
      headers: { authorization: signSession(app, citizen.id, 'citizen') },
    })
    expect(r403.statusCode).toBe(403)
    const r401 = await app.inject({ method: 'GET', url: '/v1/admin/invites/' })
    expect(r401.statusCode).toBe(401)
  })
})

describe('POST /v1/admin/invites/:token/resend — régénération', () => {
  it('régénère le token + repousse l\'expiration, l\'ancien token disparaît', async () => {
    const commune = await seedCommune(pgSql)
    const oldToken = await insertInvite({ communeId: commune, email: 'resend@test.local' })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'POST',
      url: `/v1/admin/invites/${oldToken}/resend`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: { expiresInHours: 48 },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.token).not.toBe(oldToken)
    expect(body.email).toBe('resend@test.local')
    expect(body.inviteUrl).toContain(encodeURIComponent(body.token))

    // L'ancien token n'existe plus, le nouveau oui
    const oldRows = await pgSql`SELECT token FROM admin_invites WHERE token = ${oldToken}`
    expect(oldRows).toHaveLength(0)
    const newRows = await pgSql`SELECT token FROM admin_invites WHERE token = ${body.token}`
    expect(newRows).toHaveLength(1)
  })

  it('invite déjà acceptée → 409', async () => {
    const commune = await seedCommune(pgSql)
    const token = await insertInvite({ communeId: commune, acceptedAt: new Date() })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'POST',
      url: `/v1/admin/invites/${token}/resend`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: {},
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('invite_already_accepted')
  })

  it('token inconnu → 404', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const res = await app.inject({
      method: 'POST',
      url: `/v1/admin/invites/${'zz-' + randomUUID().replaceAll('-', '')}/resend`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: {},
    })
    expect(res.statusCode).toBe(404)
  })

  it('admin d\'une autre commune → 404 (scope)', async () => {
    const a = await seedCommune(pgSql, 'A')
    const b = await seedCommune(pgSql, 'B')
    const token = await insertInvite({ communeId: a })
    const adminB = await seedUser(pgSql, { role: 'admin', communeId: b })

    const res = await app.inject({
      method: 'POST',
      url: `/v1/admin/invites/${token}/resend`,
      headers: { authorization: signSession(app, adminB.id, 'admin', b) },
      payload: {},
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('DELETE /v1/admin/invites/:token — révocation', () => {
  it('supprime l\'invite → 204, disparaît de la liste', async () => {
    const commune = await seedCommune(pgSql)
    const token = await insertInvite({ communeId: commune })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const del = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/invites/${token}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(del.statusCode).toBe(204)

    const rows = await pgSql`SELECT token FROM admin_invites WHERE token = ${token}`
    expect(rows).toHaveLength(0)
  })

  it('token inconnu → 404', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/invites/${'zz-' + randomUUID().replaceAll('-', '')}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(404)
  })

  it('admin d\'une autre commune → 404 (scope) et l\'invite reste', async () => {
    const a = await seedCommune(pgSql, 'A')
    const b = await seedCommune(pgSql, 'B')
    const token = await insertInvite({ communeId: a })
    const adminB = await seedUser(pgSql, { role: 'admin', communeId: b })

    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/invites/${token}`,
      headers: { authorization: signSession(app, adminB.id, 'admin', b) },
    })
    expect(res.statusCode).toBe(404)
    const rows = await pgSql`SELECT token FROM admin_invites WHERE token = ${token}`
    expect(rows).toHaveLength(1)
  })

  it('citizen → 403', async () => {
    const commune = await seedCommune(pgSql)
    const token = await insertInvite({ communeId: commune })
    const citizen = await seedUser(pgSql, { role: 'citizen' })

    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/invites/${token}`,
      headers: { authorization: signSession(app, citizen.id, 'citizen') },
    })
    expect(res.statusCode).toBe(403)
  })
})
