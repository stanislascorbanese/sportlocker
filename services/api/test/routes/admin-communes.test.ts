/**
 * Tests d'intégration pour /v1/admin/communes :
 *   - GET /            (liste, scoping super_admin vs admin vs citizen)
 *   - GET /:id         (404 anti-leak cross-commune)
 *   - POST /           (super_admin only, conflit INSEE)
 *   - PUT /:id         (scoping + 200 + persistance)
 *
 * Stack identique à admin-auth.test.ts (testcontainers Postgres + Redis,
 * app.inject, TRUNCATE entre tests). Firebase est mocké car le boot de l'app
 * l'initialise — ici on n'utilise pas verifyIdToken, on signe directement
 * un JWT session via fastify-jwt.
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

describe('GET /v1/admin/communes', () => {
  it('super_admin → voit toutes les communes', async () => {
    const a = await seedCommune(pgSql, 'Lille')
    const b = await seedCommune(pgSql, 'Marseille')
    const c = await seedCommune(pgSql, 'Nantes')
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/communes/',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })

    expect(res.statusCode).toBe(200)
    const ids = (res.json().items as { id: string }[]).map((i) => i.id)
    expect(ids).toEqual(expect.arrayContaining([a, b, c]))
    expect(ids).toHaveLength(3)
  })

  it('admin scoped → voit uniquement sa commune', async () => {
    const a = await seedCommune(pgSql, 'CommuneA')
    const b = await seedCommune(pgSql, 'CommuneB')
    const adminA = await seedUser(pgSql, { role: 'admin', communeId: a })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/communes/',
      headers: { authorization: signSession(app, adminA.id, 'admin', a) },
    })

    expect(res.statusCode).toBe(200)
    const items = res.json().items as { id: string; name: string }[]
    expect(items).toHaveLength(1)
    expect(items[0]!.id).toBe(a)
    expect(items.find((i) => i.id === b)).toBeUndefined()
  })

  it('citizen → 403 forbidden_admin_required', async () => {
    await seedCommune(pgSql)
    const citizen = await seedUser(pgSql, { role: 'citizen' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/communes/',
      headers: { authorization: signSession(app, citizen.id, 'citizen') },
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('forbidden_admin_required')
  })

  it('sans token → 401 unauthorized', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/communes/',
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('GET /v1/admin/communes/:id', () => {
  it('super_admin → 200 sur n\'importe quelle commune', async () => {
    const id = await seedCommune(pgSql, 'Bordeaux')
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/communes/${id}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().id).toBe(id)
    expect(res.json().name).toBe('Bordeaux')
  })

  it('admin scoped sur SA commune → 200', async () => {
    const a = await seedCommune(pgSql, 'CommuneA')
    const adminA = await seedUser(pgSql, { role: 'admin', communeId: a })

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/communes/${a}`,
      headers: { authorization: signSession(app, adminA.id, 'admin', a) },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().id).toBe(a)
  })

  it('admin scoped sur AUTRE commune → 404 (anti-leak, pas 403)', async () => {
    const a = await seedCommune(pgSql, 'CommuneA')
    const b = await seedCommune(pgSql, 'CommuneB')
    const adminA = await seedUser(pgSql, { role: 'admin', communeId: a })

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/communes/${b}`,
      headers: { authorization: signSession(app, adminA.id, 'admin', a) },
    })
    // 404 et pas 403 : ne pas confirmer l'existence de la commune cible.
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('commune_not_found')
  })

  it('id inconnu → 404', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/communes/${randomUUID()}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('commune_not_found')
  })

  it('citizen → 403', async () => {
    const id = await seedCommune(pgSql)
    const citizen = await seedUser(pgSql, { role: 'citizen' })

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/communes/${id}`,
      headers: { authorization: signSession(app, citizen.id, 'citizen') },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('POST /v1/admin/communes', () => {
  it('super_admin → 201 + persistance', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/communes/',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: {
        inseeCode: '69001',
        name: 'Lyon 1er',
        postalCode: '69001',
        department: '69',
        region: 'AURA',
        population: 30000,
        monthlyFeeCents: 49900,
      },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.inseeCode).toBe('69001')
    expect(body.name).toBe('Lyon 1er')
    expect(body.population).toBe(30000)
    expect(body.monthlyFeeCents).toBe(49900)
    expect(body.distributorCount).toBe(0)

    const rows = await pgSql`SELECT name, insee_code FROM communes WHERE id = ${body.id}`
    expect(rows).toHaveLength(1)
    expect(rows[0]!.name).toBe('Lyon 1er')
    expect(rows[0]!.insee_code).toBe('69001')
  })

  it('admin scoped → 403 forbidden_super_admin_required', async () => {
    const a = await seedCommune(pgSql, 'CommuneA')
    const adminA = await seedUser(pgSql, { role: 'admin', communeId: a })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/communes/',
      headers: { authorization: signSession(app, adminA.id, 'admin', a) },
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

  it('citizen → 403', async () => {
    const citizen = await seedUser(pgSql, { role: 'citizen' })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/communes/',
      headers: { authorization: signSession(app, citizen.id, 'citizen') },
      payload: {
        inseeCode: '75999',
        name: 'Tentative',
        postalCode: '75001',
        department: '75',
        region: 'IDF',
      },
    })
    expect(res.statusCode).toBe(403)
  })

  it('INSEE dupliqué → 409 insee_code_conflict', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })
    // Première commune via insert direct (l'helper seedCommune génère un
    // INSEE aléatoire, on veut un INSEE déterministe ici pour le conflit).
    await pgSql`INSERT INTO communes (id, insee_code, name, postal_code, department, region)
      VALUES (${randomUUID()}, '13001', 'Marseille 1', '13001', '13', 'PACA')`

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/communes/',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: {
        inseeCode: '13001',
        name: 'Doublon',
        postalCode: '13001',
        department: '13',
        region: 'PACA',
      },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('insee_code_conflict')
  })

  it('payload invalide (inseeCode 4 chiffres) → 400 validation_error', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/communes/',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: {
        inseeCode: '7501',
        name: 'Trop court',
        postalCode: '75001',
        department: '75',
        region: 'IDF',
      },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('PUT /v1/admin/communes/:id', () => {
  it('super_admin → 200 et persistance des nouveaux champs', async () => {
    const id = await seedCommune(pgSql, 'Ancien Nom')
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/communes/${id}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: {
        name: 'Nouveau Nom',
        monthlyFeeCents: 59900,
        contactEmail: 'mairie@example.fr',
      },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.name).toBe('Nouveau Nom')
    expect(body.monthlyFeeCents).toBe(59900)
    expect(body.contactEmail).toBe('mairie@example.fr')

    const rows = await pgSql`SELECT name, monthly_fee_cents, contact_email FROM communes WHERE id = ${id}`
    expect(rows[0]!.name).toBe('Nouveau Nom')
    expect(rows[0]!.monthly_fee_cents).toBe(59900)
    expect(rows[0]!.contact_email).toBe('mairie@example.fr')
  })

  it('admin scoped sur SA commune → 200', async () => {
    const a = await seedCommune(pgSql, 'CommuneA')
    const adminA = await seedUser(pgSql, { role: 'admin', communeId: a })

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/communes/${a}`,
      headers: { authorization: signSession(app, adminA.id, 'admin', a) },
      payload: { name: 'CommuneA renommée' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('CommuneA renommée')
  })

  it('admin scoped sur AUTRE commune → 404 (anti-leak)', async () => {
    const a = await seedCommune(pgSql, 'CommuneA')
    const b = await seedCommune(pgSql, 'CommuneB')
    const adminA = await seedUser(pgSql, { role: 'admin', communeId: a })

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/communes/${b}`,
      headers: { authorization: signSession(app, adminA.id, 'admin', a) },
      payload: { name: 'Tentative cross-tenant' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('commune_not_found')

    // Garde-fou : la commune B n'a PAS été modifiée.
    const rows = await pgSql`SELECT name FROM communes WHERE id = ${b}`
    expect(rows[0]!.name).toBe('CommuneB')
  })

  it('id inconnu en super_admin → 404', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/communes/${randomUUID()}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: { name: 'Ghost' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('body vide → 400 (au moins un champ requis)', async () => {
    const id = await seedCommune(pgSql)
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/communes/${id}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })

  it('citizen → 403', async () => {
    const id = await seedCommune(pgSql)
    const citizen = await seedUser(pgSql, { role: 'citizen' })

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/communes/${id}`,
      headers: { authorization: signSession(app, citizen.id, 'citizen') },
      payload: { name: 'Pirate' },
    })
    expect(res.statusCode).toBe(403)
  })
})
