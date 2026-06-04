/**
 * Tests d'intégration pour /v1/admin/item-types.
 *
 * Périmètre :
 *   - GET / : tri ASC name, tous les rôles admin voient TOUT (catalogue global,
 *             pas scopé commune) — vérifié super_admin + admin scoped.
 *   - GET /:id : 404 si inconnu.
 *   - POST / : super_admin only → 403 pour admin scoped ; 409 slug conflict ;
 *              400 slug pas en kebab-case.
 *   - PUT /:id : super_admin only ; slug immuable (champ non accepté par le schema).
 *   - DELETE /:id : super_admin only + 409 in_use_by_items si items référencent.
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

async function seedItemTypeRaw(opts: {
  slug?: string
  name?: string
  category?: string
  cautionCents?: number
  maxDurationMinutes?: number
}): Promise<string> {
  const id = randomUUID()
  const slug = opts.slug ?? 'slug-' + id.slice(0, 8)
  await pgSql`INSERT INTO item_types
    (id, slug, name, category, caution_cents, max_duration_minutes)
    VALUES (${id}, ${slug}, ${opts.name ?? 'Type ' + slug}, ${opts.category ?? 'ballon'},
            ${opts.cautionCents ?? 1000}, ${opts.maxDurationMinutes ?? 240})`
  return id
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

describe('GET /v1/admin/item-types — catalogue global', () => {
  it('super_admin → voit tous les types triés ASC par name', async () => {
    await seedItemTypeRaw({ slug: 'zeppelin', name: 'Zeppelin' })
    await seedItemTypeRaw({ slug: 'ballon', name: 'Ballon' })
    await seedItemTypeRaw({ slug: 'raquette', name: 'Raquette' })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/item-types/',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { items: { name: string }[] }
    expect(body.items.map((i) => i.name)).toEqual(['Ballon', 'Raquette', 'Zeppelin'])
  })

  it('admin scoped → voit aussi tout le catalogue (item_types globaux, pas scopés commune)', async () => {
    await seedItemTypeRaw({ slug: 'frisbee', name: 'Frisbee' })
    await seedItemTypeRaw({ slug: 'gant-boxe', name: 'Gant de boxe' })
    const commune = await seedCommune(pgSql)
    const admin = await seedUser(pgSql, { role: 'admin', communeId: commune })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/item-types/',
      headers: { authorization: signSession(app, admin.id, 'admin', commune) },
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { items: unknown[] }).items).toHaveLength(2)
  })

  it('citizen → 403', async () => {
    const citizen = await seedUser(pgSql, { role: 'citizen' })
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/item-types/',
      headers: { authorization: signSession(app, citizen.id, 'citizen') },
    })
    expect(res.statusCode).toBe(403)
  })

  it('sans token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/item-types/' })
    expect(res.statusCode).toBe(401)
  })

  it('activeItemCount et totalReservations sont retournés', async () => {
    const t = await seedItemTypeRaw({ slug: 'count-test', name: 'CountTest' })
    // Distributeur minimal pour pouvoir attacher des items
    const communeId = await seedCommune(pgSql)
    const distId = randomUUID()
    await pgSql`INSERT INTO distributors (id, serial_number, commune_id, name, locker_count)
      VALUES (${distId}, 'SN-CNT', ${communeId}, 'D', 1)`
    const lockerId = randomUUID()
    await pgSql`INSERT INTO lockers (id, distributor_id, position, state)
      VALUES (${lockerId}, ${distId}, 0, 'idle')`
    // 3 items du type
    for (let i = 0; i < 3; i++) {
      await pgSql`INSERT INTO items (id, item_type_id, rfid_tag, current_locker_id)
        VALUES (${randomUUID()}, ${t}, ${'RFID-CNT-' + i}, ${lockerId})`
    }
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/item-types/',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { items: { id: string; activeItemCount: number }[] }
    const row = body.items.find((i) => i.id === t)
    expect(row).toBeDefined()
    expect(row!.activeItemCount).toBe(3)
  })
})

describe('GET /v1/admin/item-types/:id', () => {
  it('200 sur id existant', async () => {
    const t = await seedItemTypeRaw({ slug: 'getone', name: 'GetOne' })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/item-types/${t}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().id).toBe(t)
    expect(res.json().slug).toBe('getone')
  })

  it('admin scoped peut aussi GET /:id (catalogue global)', async () => {
    const t = await seedItemTypeRaw({ slug: 'admin-view', name: 'AdminView' })
    const commune = await seedCommune(pgSql)
    const admin = await seedUser(pgSql, { role: 'admin', communeId: commune })

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/item-types/${t}`,
      headers: { authorization: signSession(app, admin.id, 'admin', commune) },
    })
    expect(res.statusCode).toBe(200)
  })

  it('404 si id inconnu', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/item-types/${randomUUID()}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('item_type_not_found')
  })
})

describe('POST /v1/admin/item-types — super_admin only', () => {
  it('super_admin → 201 + persistance', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/item-types/',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: {
        slug: 'ballon-foot',
        name: 'Ballon de foot',
        category: 'ballon',
        cautionCents: 1500,
        maxDurationMinutes: 240,
      },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.slug).toBe('ballon-foot')
    expect(body.cautionCents).toBe(1500)
    expect(body.maxDurationMinutes).toBe(240)
    expect(body.activeItemCount).toBe(0)

    const rows = await pgSql`SELECT slug, name FROM item_types WHERE id = ${body.id}`
    expect(rows).toHaveLength(1)
    expect(rows[0]!.slug).toBe('ballon-foot')
  })

  it('admin scoped → 403 forbidden_super_admin_required', async () => {
    const commune = await seedCommune(pgSql)
    const admin = await seedUser(pgSql, { role: 'admin', communeId: commune })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/item-types/',
      headers: { authorization: signSession(app, admin.id, 'admin', commune) },
      payload: {
        slug: 'tentative',
        name: 'Tentative',
        category: 'autre',
        cautionCents: 500,
        maxDurationMinutes: 60,
      },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('forbidden_super_admin_required')
  })

  it('citizen → 403', async () => {
    const citizen = await seedUser(pgSql, { role: 'citizen' })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/item-types/',
      headers: { authorization: signSession(app, citizen.id, 'citizen') },
      payload: {
        slug: 'ko', name: 'KO', category: 'x', cautionCents: 0, maxDurationMinutes: 60,
      },
    })
    expect(res.statusCode).toBe(403)
  })

  it('slug pas en kebab-case → 400', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/item-types/',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: {
        slug: 'Ballon Foot', // espace + majuscules → invalide
        name: 'Bad',
        category: 'ballon',
        cautionCents: 0,
        maxDurationMinutes: 60,
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('slug avec underscore → 400 (must_be_kebab_case)', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/item-types/',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: {
        slug: 'ballon_foot',
        name: 'Bad',
        category: 'ballon',
        cautionCents: 0,
        maxDurationMinutes: 60,
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('slug dupliqué → 409 slug_conflict', async () => {
    await seedItemTypeRaw({ slug: 'doublon', name: 'Existant' })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/item-types/',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: {
        slug: 'doublon',
        name: 'Doublon',
        category: 'x',
        cautionCents: 0,
        maxDurationMinutes: 60,
      },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('slug_conflict')
  })

  it('cautionCents négatif → 400', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/item-types/',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: {
        slug: 'negative',
        name: 'Negative',
        category: 'x',
        cautionCents: -10,
        maxDurationMinutes: 60,
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('maxDurationMinutes < 15 → 400', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/item-types/',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: {
        slug: 'fast',
        name: 'Fast',
        category: 'x',
        cautionCents: 0,
        maxDurationMinutes: 5,
      },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('PUT /v1/admin/item-types/:id — super_admin only, slug immuable', () => {
  it('super_admin update name + cautionCents → 200', async () => {
    const t = await seedItemTypeRaw({ slug: 'put-target', name: 'Ancien' })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/item-types/${t}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: { name: 'Nouveau Nom', cautionCents: 2500 },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('Nouveau Nom')
    expect(res.json().cautionCents).toBe(2500)

    const rows = await pgSql`SELECT name, caution_cents, slug FROM item_types WHERE id = ${t}`
    expect(rows[0]!.name).toBe('Nouveau Nom')
    expect(rows[0]!.caution_cents).toBe(2500)
    // slug n'a pas bougé
    expect(rows[0]!.slug).toBe('put-target')
  })

  it('slug n\'est pas dans le schema PUT → ignoré (Fastify zod strict)', async () => {
    const t = await seedItemTypeRaw({ slug: 'immutable-slug', name: 'Avant' })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/item-types/${t}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: { name: 'Après', slug: 'tentative-de-rename' },
    })
    // Zod parse en mode strip par défaut : champs inconnus ignorés (200 + slug
    // inchangé). On valide donc juste l'invariance.
    expect([200, 400]).toContain(res.statusCode)
    const rows = await pgSql`SELECT slug FROM item_types WHERE id = ${t}`
    expect(rows[0]!.slug).toBe('immutable-slug')
  })

  it('admin scoped → 403 forbidden_super_admin_required', async () => {
    const t = await seedItemTypeRaw({ slug: 'put-admin', name: 'X' })
    const commune = await seedCommune(pgSql)
    const admin = await seedUser(pgSql, { role: 'admin', communeId: commune })

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/item-types/${t}`,
      headers: { authorization: signSession(app, admin.id, 'admin', commune) },
      payload: { name: 'Tentative' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('forbidden_super_admin_required')
  })

  it('id inconnu (super_admin) → 404', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/item-types/${randomUUID()}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: { name: 'Ghost' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('body vide → 400 (at_least_one_field_required)', async () => {
    const t = await seedItemTypeRaw({ slug: 'put-empty', name: 'Empty' })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/item-types/${t}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('DELETE /v1/admin/item-types/:id — super_admin only, 409 si items', () => {
  it('super_admin delete type non utilisé → 204', async () => {
    const t = await seedItemTypeRaw({ slug: 'to-delete', name: 'ToDelete' })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/item-types/${t}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(204)
    expect(res.body).toBe('')

    const rows = await pgSql`SELECT id FROM item_types WHERE id = ${t}`
    expect(rows).toHaveLength(0)
  })

  it('type utilisé par au moins 1 item → 409 in_use_by_items', async () => {
    const t = await seedItemTypeRaw({ slug: 'in-use', name: 'InUse' })
    // 1 item référence le type → DELETE doit refuser
    await pgSql`INSERT INTO items (id, item_type_id, rfid_tag)
      VALUES (${randomUUID()}, ${t}, 'RFID-USE')`
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/item-types/${t}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('in_use_by_items')

    // Le type est toujours là
    const rows = await pgSql`SELECT id FROM item_types WHERE id = ${t}`
    expect(rows).toHaveLength(1)
  })

  it('admin scoped → 403 forbidden_super_admin_required', async () => {
    const t = await seedItemTypeRaw({ slug: 'del-admin', name: 'X' })
    const commune = await seedCommune(pgSql)
    const admin = await seedUser(pgSql, { role: 'admin', communeId: commune })

    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/item-types/${t}`,
      headers: { authorization: signSession(app, admin.id, 'admin', commune) },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('forbidden_super_admin_required')
  })

  it('citizen → 403', async () => {
    const t = await seedItemTypeRaw({ slug: 'del-citizen', name: 'X' })
    const citizen = await seedUser(pgSql, { role: 'citizen' })
    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/item-types/${t}`,
      headers: { authorization: signSession(app, citizen.id, 'citizen') },
    })
    expect(res.statusCode).toBe(403)
  })

  it('id inconnu → 404', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/item-types/${randomUUID()}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('item_type_not_found')
  })

  it('sans token → 401', async () => {
    const t = await seedItemTypeRaw({ slug: 'no-auth', name: 'X' })
    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/item-types/${t}`,
    })
    expect(res.statusCode).toBe(401)
  })
})
