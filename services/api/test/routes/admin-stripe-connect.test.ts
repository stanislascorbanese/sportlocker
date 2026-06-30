/**
 * Tests d'intégration pour /v1/admin/stripe-connect :
 *   - GET /status   (3 rôles × scope + 404 anti-leak + 503 si non config)
 *   - POST /onboard (création Account Express + AccountLink)
 *   - POST /refresh (pull status + posent onboardedAt à la première
 *                    transition charges+payouts === true)
 *
 * Stripe SDK est mocké via vi.mock('stripe', ...) — on capture les calls
 * `accounts.create`, `accounts.retrieve`, `accountLinks.create` et on
 * renvoie des réponses canned. STRIPE_SECRET_KEY est posé en env pour que
 * `getStripe()` retourne une instance (et pas null = 503).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { GenericContainer, type StartedTestContainer } from 'testcontainers'
import postgres from 'postgres'
import IORedis from 'ioredis'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

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

// ─── Mock Stripe SDK ──────────────────────────────────────────────────────
// On stocke les comptes Stripe en mémoire pour simuler un vrai SDK.
type MockAccount = {
  id: string
  charges_enabled: boolean
  payouts_enabled: boolean
  email?: string | undefined
}
const mockAccounts = new Map<string, MockAccount>()
let mockAccountCounter = 0
let mockAccountLinkCounter = 0

vi.mock('stripe', () => {
  // La classe par défaut exportée par `import Stripe from 'stripe'`.
  class MockStripe {
    accounts = {
      create: vi.fn(async (params: { email?: string }) => {
        const id = `acct_test_${++mockAccountCounter}`
        const account: MockAccount = {
          id, charges_enabled: false, payouts_enabled: false, email: params?.email,
        }
        mockAccounts.set(id, account)
        return account
      }),
      retrieve: vi.fn(async (id: string) => {
        const account = mockAccounts.get(id)
        if (!account) throw new Error(`No such account: ${id}`)
        return account
      }),
    }
    accountLinks = {
      create: vi.fn(async (params: { account: string }) => {
        ++mockAccountLinkCounter
        return {
          object: 'account_link' as const,
          url: `https://connect.stripe.com/setup/mock/${params.account}/${mockAccountLinkCounter}`,
          expires_at: Math.floor(Date.now() / 1000) + 300,
          created: Math.floor(Date.now() / 1000),
        }
      }),
    }
  }
  return { default: MockStripe }
})

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..', '..', '..')
const SCHEMA_PATH = join(REPO_ROOT, 'database', 'schema.sql')
const MIGRATIONS_DIR = join(REPO_ROOT, 'database', 'migrations')

/**
 * Applique toutes les migrations 0001_*.sql dans l'ordre lexicographique.
 * On reste pragmatique : la 0013 (et plus tard) ajoutent des colonnes à des
 * tables déjà crées par schema.sql → IF NOT EXISTS implicite tant qu'on ne
 * roule pas une migration qui rejoue un ALTER déjà appliqué (mais schema.sql
 * a déjà les colonnes 0013 directement, alors la migration 0013 fail si
 * appliquée par-dessus). Solution : on applique uniquement les migrations
 * qui ne sont PAS encore dans schema.sql. Convention SportLocker : seules
 * les fonctions/triggers/data fixtures vivent dans les migrations, le DDL
 * de structure est dans schema.sql.
 *
 * Pour Stripe Connect, les colonnes sont dans schema.sql ET dans 0013 — donc
 * on ne réapplique pas 0013 ici (testcontainer schema.sql l'inclut déjà).
 */
function applyMigrations(pgSql: ReturnType<typeof postgres>) {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  return Promise.all(
    files
      .filter((f) => f.startsWith('0001_')) // uniquement les fonctions/triggers (cf. admin-communes.test.ts)
      .map((f) => pgSql.unsafe(readFileSync(join(MIGRATIONS_DIR, f), 'utf-8'))),
  )
}

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
  process.env.DASHBOARD_INVITE_BASE_URL = 'https://ops.sportlocker.fr'
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_integration_tests'
  process.env.LOG_LEVEL = 'fatal'

  pgSql = postgres(process.env.DATABASE_URL!, { onnotice: () => {} })
  await pgSql.unsafe(readFileSync(SCHEMA_PATH, 'utf-8'))
  await applyMigrations(pgSql)

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
  mockAccounts.clear()
  mockAccountCounter = 0
  mockAccountLinkCounter = 0

  // Reset le singleton Stripe pour que le mock soit picked up frais
  // (vi.mock est hoisté, donc le module est déjà réécrit ; on flush juste
  // le cache d'instance).
  const { resetStripeForTests } = await import('../../src/lib/stripe.js')
  resetStripeForTests()
})

// ──────────────────────────────────────────────────────────────────────────
// GET /status
// ──────────────────────────────────────────────────────────────────────────

describe('GET /v1/admin/stripe-connect/status', () => {
  it('citizen → 403', async () => {
    const commune = await seedCommune(pgSql, 'A')
    const u = await seedUser(pgSql, { role: 'citizen', communeId: commune })
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stripe-connect/status',
      headers: { authorization: signSession(app, u.id, 'citizen') },
    })
    expect(res.statusCode).toBe(403)
  })

  it('admin scoped, commune sans account → connected: false', async () => {
    const commune = await seedCommune(pgSql, 'A')
    const u = await seedUser(pgSql, { role: 'admin', communeId: commune })
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stripe-connect/status',
      headers: { authorization: signSession(app, u.id, 'admin', commune) },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      connected: false,
      accountId: null,
      chargesEnabled: false,
      payoutsEnabled: false,
      onboardedAt: null,
    })
  })

  it('admin scoped, commune onboardée → connected: true avec flags', async () => {
    const commune = await seedCommune(pgSql, 'A')
    const u = await seedUser(pgSql, { role: 'admin', communeId: commune })
    await pgSql`UPDATE communes SET
      stripe_connect_account_id = 'acct_test_already',
      stripe_connect_charges_enabled = true,
      stripe_connect_payouts_enabled = true,
      stripe_connect_onboarded_at = NOW()
      WHERE id = ${commune}`

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stripe-connect/status',
      headers: { authorization: signSession(app, u.id, 'admin', commune) },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.connected).toBe(true)
    expect(body.accountId).toBe('acct_test_already')
    expect(body.chargesEnabled).toBe(true)
    expect(body.payoutsEnabled).toBe(true)
    expect(body.onboardedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('super_admin sans communeId → 400', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stripe-connect/status',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'super_admin_must_specify_commune_id' })
  })

  it('super_admin avec ?communeId → 200', async () => {
    const commune = await seedCommune(pgSql, 'A')
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/stripe-connect/status?communeId=${commune}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
  })

  it('super_admin avec communeId inexistant → 404 commune_not_found', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/stripe-connect/status?communeId=${randomUUID()}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: 'commune_not_found' })
  })
})

// ──────────────────────────────────────────────────────────────────────────
// POST /onboard
// ──────────────────────────────────────────────────────────────────────────

describe('POST /v1/admin/stripe-connect/onboard', () => {
  it('admin scoped, première fois → crée Account + AccountLink, persiste l\'ID', async () => {
    const commune = await seedCommune(pgSql, 'A')
    const u = await seedUser(pgSql, { role: 'admin', communeId: commune })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/stripe-connect/onboard',
      headers: { authorization: signSession(app, u.id, 'admin', commune) },
      payload: {},
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.accountId).toMatch(/^acct_test_/)
    expect(body.url).toContain('https://connect.stripe.com/setup/mock/')
    expect(body.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000))

    // ID persisté en DB
    const rows = await pgSql<Array<{ id: string }>>`
      SELECT stripe_connect_account_id AS id FROM communes WHERE id = ${commune}`
    expect(rows[0]?.id).toBe(body.accountId)
  })

  it('admin scoped, déjà onboardé → réutilise l\'account existant', async () => {
    const commune = await seedCommune(pgSql, 'A')
    const u = await seedUser(pgSql, { role: 'admin', communeId: commune })
    await pgSql`UPDATE communes SET stripe_connect_account_id = 'acct_test_existing'
      WHERE id = ${commune}`
    mockAccounts.set('acct_test_existing', {
      id: 'acct_test_existing',
      charges_enabled: false,
      payouts_enabled: false,
    })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/stripe-connect/onboard',
      headers: { authorization: signSession(app, u.id, 'admin', commune) },
      payload: {},
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().accountId).toBe('acct_test_existing')
  })

  it('citizen → 403', async () => {
    const commune = await seedCommune(pgSql, 'A')
    const u = await seedUser(pgSql, { role: 'citizen', communeId: commune })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/stripe-connect/onboard',
      headers: { authorization: signSession(app, u.id, 'citizen') },
      payload: {},
    })
    expect(res.statusCode).toBe(403)
  })

  it('super_admin sans communeId → 400', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/stripe-connect/onboard',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'super_admin_must_specify_commune_id' })
  })

  it('super_admin avec communeId inexistant → 404 commune_not_found', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/stripe-connect/onboard',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: { communeId: randomUUID() },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: 'commune_not_found' })
  })

  it('renseigne l\'email de contact de la commune sur l\'Account Stripe créé', async () => {
    const commune = await seedCommune(pgSql, 'A')
    await pgSql`UPDATE communes SET contact_email = 'mairie@ville-test.fr' WHERE id = ${commune}`
    const u = await seedUser(pgSql, { role: 'admin', communeId: commune })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/stripe-connect/onboard',
      headers: { authorization: signSession(app, u.id, 'admin', commune) },
      payload: {},
    })

    expect(res.statusCode).toBe(200)
    // L'Account a bien été créé avec l'email (le mock SDK capture les params).
    const acc = mockAccounts.get(res.json().accountId)
    expect(acc?.email).toBe('mairie@ville-test.fr')
  })
})

// ──────────────────────────────────────────────────────────────────────────
// POST /refresh
// ──────────────────────────────────────────────────────────────────────────

describe('POST /v1/admin/stripe-connect/refresh', () => {
  it('admin, account onboardé Stripe-side → update flags + posent onboardedAt', async () => {
    const commune = await seedCommune(pgSql, 'A')
    const u = await seedUser(pgSql, { role: 'admin', communeId: commune })
    await pgSql`UPDATE communes SET stripe_connect_account_id = 'acct_test_xyz'
      WHERE id = ${commune}`
    // Côté Stripe : tout est OK
    mockAccounts.set('acct_test_xyz', {
      id: 'acct_test_xyz',
      charges_enabled: true,
      payouts_enabled: true,
    })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/stripe-connect/refresh',
      headers: { authorization: signSession(app, u.id, 'admin', commune) },
      payload: {},
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      connected: true,
      accountId: 'acct_test_xyz',
      chargesEnabled: true,
      payoutsEnabled: true,
    })
    expect(res.json().onboardedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    // Persiste en DB
    const rows = await pgSql<Array<{
      charges: boolean
      payouts: boolean
      onboarded_at: Date | null
    }>>`SELECT
      stripe_connect_charges_enabled AS charges,
      stripe_connect_payouts_enabled AS payouts,
      stripe_connect_onboarded_at AS onboarded_at
    FROM communes WHERE id = ${commune}`
    expect(rows[0]?.charges).toBe(true)
    expect(rows[0]?.payouts).toBe(true)
    expect(rows[0]?.onboarded_at).not.toBeNull()
  })

  it('admin, charges enabled mais payouts pending → flag update mais onboardedAt reste null', async () => {
    const commune = await seedCommune(pgSql, 'A')
    const u = await seedUser(pgSql, { role: 'admin', communeId: commune })
    await pgSql`UPDATE communes SET stripe_connect_account_id = 'acct_test_partial'
      WHERE id = ${commune}`
    mockAccounts.set('acct_test_partial', {
      id: 'acct_test_partial',
      charges_enabled: true,
      payouts_enabled: false,
    })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/stripe-connect/refresh',
      headers: { authorization: signSession(app, u.id, 'admin', commune) },
      payload: {},
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.chargesEnabled).toBe(true)
    expect(body.payoutsEnabled).toBe(false)
    expect(body.onboardedAt).toBeNull()
  })

  it('admin, pas d\'account Stripe → 409 not_onboarded', async () => {
    const commune = await seedCommune(pgSql, 'A')
    const u = await seedUser(pgSql, { role: 'admin', communeId: commune })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/stripe-connect/refresh',
      headers: { authorization: signSession(app, u.id, 'admin', commune) },
      payload: {},
    })

    expect(res.statusCode).toBe(409)
    expect(res.json()).toEqual({ error: 'not_onboarded' })
  })

  it('super_admin sans communeId → 400', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/stripe-connect/refresh',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'super_admin_must_specify_commune_id' })
  })

  it('super_admin avec communeId inexistant → 404 commune_not_found', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/stripe-connect/refresh',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: { communeId: randomUUID() },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: 'commune_not_found' })
  })

  it('citizen → 403', async () => {
    const commune = await seedCommune(pgSql, 'A')
    const u = await seedUser(pgSql, { role: 'citizen', communeId: commune })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/stripe-connect/refresh',
      headers: { authorization: signSession(app, u.id, 'citizen') },
      payload: {},
    })
    expect(res.statusCode).toBe(403)
  })
})
