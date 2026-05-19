/**
 * Tests d'intégration pour /v1/admin/items.
 *
 * Périmètre :
 *   - GET / : liste + filtres (itemTypeId, condition, currentLockerId, distributorId, q sur RFID)
 *             Multi-tenant : admin scoped → items dont distributor.communeId = sa commune.
 *             super_admin → tout, y compris orphelins (currentLockerId NULL).
 *   - GET /:id : 404 anti-leak cross-commune + orphan masqué pour scoped.
 *   - POST / : super_admin crée libre ; admin scoped → 403 si pas de locker ou
 *              cross-commune, 404 si locker inconnu, 409 si RFID conflit, 404 type inconnu.
 *   - PUT /:id : super_admin OK ; admin scoped 404 cross-commune,
 *                403 sur unassign (currentLockerId=null), 403 sur déplacement cross-commune.
 *
 * NB : pas de DELETE implémenté côté route → pas testé.
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

type ItemCondition = 'new' | 'good' | 'worn' | 'damaged' | 'lost'

interface CommuneStack {
  communeId: string
  distributorId: string
  lockerId: string
}

/** Seed commune + distributor + 1 locker idle. */
async function seedStack(name: string, lockerCount = 2): Promise<CommuneStack> {
  const communeId = await seedCommune(pgSql, name)
  const distributorId = randomUUID()
  await pgSql`INSERT INTO distributors (id, serial_number, commune_id, name, locker_count)
    VALUES (${distributorId}, ${'SN-' + distributorId.slice(0, 8)}, ${communeId},
            ${name + ' Dist'}, ${lockerCount})`
  const lockerId = randomUUID()
  await pgSql`INSERT INTO lockers (id, distributor_id, position, state)
    VALUES (${lockerId}, ${distributorId}, 0, 'idle')`
  return { communeId, distributorId, lockerId }
}

/** Crée un locker supplémentaire dans un distributor existant et retourne son id. */
async function addLocker(distributorId: string): Promise<string> {
  const id = randomUUID()
  const row = await pgSql<{ next_pos: number }[]>`
    SELECT COALESCE(MAX(position), -1) + 1 AS next_pos
    FROM lockers WHERE distributor_id = ${distributorId}`
  await pgSql`INSERT INTO lockers (id, distributor_id, position, state)
    VALUES (${id}, ${distributorId}, ${row[0]!.next_pos}, 'idle')`
  return id
}

async function seedItemType(slug = 'ballon-' + randomUUID().slice(0, 6)): Promise<string> {
  const id = randomUUID()
  await pgSql`INSERT INTO item_types (id, slug, name, category, caution_cents, max_duration_minutes)
    VALUES (${id}, ${slug}, 'Ballon Test', 'ballon', 1000, 240)`
  return id
}

async function seedItem(opts: {
  itemTypeId: string
  rfidTag?: string
  condition?: ItemCondition
  currentLockerId?: string | null
}): Promise<string> {
  const id = randomUUID()
  await pgSql`
    INSERT INTO items (id, item_type_id, rfid_tag, condition, current_locker_id)
    VALUES (${id}, ${opts.itemTypeId}, ${opts.rfidTag ?? 'RFID-' + id.slice(0, 8)},
            ${opts.condition ?? 'new'}, ${opts.currentLockerId ?? null})`
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

describe('GET /v1/admin/items — listing & scope', () => {
  it('super_admin → voit items de toutes communes + orphelins', async () => {
    const a = await seedStack('CommuneA')
    const b = await seedStack('CommuneB')
    const itA = await seedItemType('type-a')
    const itB = await seedItemType('type-b')
    await seedItem({ itemTypeId: itA, currentLockerId: a.lockerId })
    await seedItem({ itemTypeId: itB, currentLockerId: b.lockerId })
    // Item orphelin (sans locker)
    await seedItem({ itemTypeId: itA, currentLockerId: null })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/items/',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { items: { currentLocker: unknown }[] }
    expect(body.items).toHaveLength(3)
    expect(body.items.filter((i) => i.currentLocker === null)).toHaveLength(1)
  })

  it('admin scoped → ne voit que les items dont locker.distributor.commune = sa commune', async () => {
    const a = await seedStack('CommuneA')
    const b = await seedStack('CommuneB')
    const itType = await seedItemType('type-mix')
    await seedItem({ itemTypeId: itType, currentLockerId: a.lockerId })
    await seedItem({ itemTypeId: itType, currentLockerId: a.lockerId, rfidTag: 'RFID-A2' })
    await seedItem({ itemTypeId: itType, currentLockerId: b.lockerId })
    // Orphelin → masqué pour scoped
    await seedItem({ itemTypeId: itType, currentLockerId: null })
    const adminA = await seedUser(pgSql, { role: 'admin', communeId: a.communeId })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/items/',
      headers: { authorization: signSession(app, adminA.id, 'admin', a.communeId) },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      items: { currentLocker: { distributor: { communeId: string } } | null }[]
    }
    expect(body.items).toHaveLength(2)
    for (const item of body.items) {
      expect(item.currentLocker?.distributor.communeId).toBe(a.communeId)
    }
  })

  it('citizen → 403', async () => {
    const citizen = await seedUser(pgSql, { role: 'citizen' })
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/items/',
      headers: { authorization: signSession(app, citizen.id, 'citizen') },
    })
    expect(res.statusCode).toBe(403)
  })

  it('sans auth → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/items/' })
    expect(res.statusCode).toBe(401)
  })

  it('filtre itemTypeId', async () => {
    const stack = await seedStack('CommuneFilter')
    const t1 = await seedItemType('type-1')
    const t2 = await seedItemType('type-2')
    await seedItem({ itemTypeId: t1, currentLockerId: stack.lockerId })
    await seedItem({ itemTypeId: t2, currentLockerId: stack.lockerId, rfidTag: 'RFID-X' })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/items/?itemTypeId=${t1}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { items: { itemType: { id: string } }[] }
    expect(body.items).toHaveLength(1)
    expect(body.items[0]!.itemType.id).toBe(t1)
  })

  it('filtre condition=damaged', async () => {
    const stack = await seedStack('CommuneDamaged')
    const t = await seedItemType()
    await seedItem({ itemTypeId: t, currentLockerId: stack.lockerId, condition: 'new' })
    await seedItem({
      itemTypeId: t, currentLockerId: stack.lockerId, condition: 'damaged', rfidTag: 'RFID-D',
    })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/items/?condition=damaged',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { items: { condition: string }[] }
    expect(body.items).toHaveLength(1)
    expect(body.items[0]!.condition).toBe('damaged')
  })

  it('filtre currentLockerId', async () => {
    const stack = await seedStack('CommuneLockerFilter')
    const otherLocker = await addLocker(stack.distributorId)
    const t = await seedItemType()
    await seedItem({ itemTypeId: t, currentLockerId: stack.lockerId })
    await seedItem({ itemTypeId: t, currentLockerId: otherLocker, rfidTag: 'RFID-OTHER' })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/items/?currentLockerId=${otherLocker}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { items: { currentLocker: { id: string } | null }[] }
    expect(body.items).toHaveLength(1)
    expect(body.items[0]!.currentLocker?.id).toBe(otherLocker)
  })

  it('filtre distributorId', async () => {
    const a = await seedStack('CommuneA')
    const b = await seedStack('CommuneB')
    const t = await seedItemType()
    await seedItem({ itemTypeId: t, currentLockerId: a.lockerId })
    await seedItem({ itemTypeId: t, currentLockerId: b.lockerId, rfidTag: 'RFID-B' })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/items/?distributorId=${a.distributorId}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { items: { currentLocker: { distributor: { id: string } } | null }[] }
    expect(body.items).toHaveLength(1)
    expect(body.items[0]!.currentLocker?.distributor.id).toBe(a.distributorId)
  })

  it('filtre q : ILIKE sur RFID (insensible à la casse, partial match)', async () => {
    const stack = await seedStack('CommuneQ')
    const t = await seedItemType()
    await seedItem({ itemTypeId: t, currentLockerId: stack.lockerId, rfidTag: 'TAG-ABC123' })
    await seedItem({ itemTypeId: t, currentLockerId: stack.lockerId, rfidTag: 'TAG-XYZ999' })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/items/?q=abc',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { items: { rfidTag: string }[] }
    expect(body.items).toHaveLength(1)
    expect(body.items[0]!.rfidTag).toBe('TAG-ABC123')
  })
})

describe('GET /v1/admin/items/:id', () => {
  it('super_admin → 200 sur n\'importe quel item', async () => {
    const stack = await seedStack('CommuneG')
    const t = await seedItemType()
    const itemId = await seedItem({ itemTypeId: t, currentLockerId: stack.lockerId })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/items/${itemId}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().id).toBe(itemId)
  })

  it('admin scoped sur item de SA commune → 200', async () => {
    const a = await seedStack('CommuneA')
    const t = await seedItemType()
    const itemId = await seedItem({ itemTypeId: t, currentLockerId: a.lockerId })
    const adminA = await seedUser(pgSql, { role: 'admin', communeId: a.communeId })

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/items/${itemId}`,
      headers: { authorization: signSession(app, adminA.id, 'admin', a.communeId) },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().id).toBe(itemId)
  })

  it('admin scoped sur item d\'AUTRE commune → 404 anti-leak', async () => {
    const a = await seedStack('CommuneA')
    const b = await seedStack('CommuneB')
    const t = await seedItemType()
    const itemB = await seedItem({ itemTypeId: t, currentLockerId: b.lockerId })
    const adminA = await seedUser(pgSql, { role: 'admin', communeId: a.communeId })

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/items/${itemB}`,
      headers: { authorization: signSession(app, adminA.id, 'admin', a.communeId) },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('item_not_found')
  })

  it('admin scoped sur item orphelin → 404 (orphan masqué)', async () => {
    const a = await seedStack('CommuneA')
    const t = await seedItemType()
    const orphan = await seedItem({ itemTypeId: t, currentLockerId: null })
    const adminA = await seedUser(pgSql, { role: 'admin', communeId: a.communeId })

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/items/${orphan}`,
      headers: { authorization: signSession(app, adminA.id, 'admin', a.communeId) },
    })
    expect(res.statusCode).toBe(404)
  })

  it('id inconnu → 404', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/items/${randomUUID()}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('POST /v1/admin/items', () => {
  it('super_admin crée un item orphan → 201', async () => {
    const t = await seedItemType()
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/items/',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: { itemTypeId: t, rfidTag: 'NEW-RFID-1' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.rfidTag).toBe('NEW-RFID-1')
    expect(body.condition).toBe('new')
    expect(body.currentLocker).toBeNull()
  })

  it('super_admin crée avec currentLockerId → 201 + currentLocker hydraté', async () => {
    const stack = await seedStack('CommuneC')
    const t = await seedItemType()
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/items/',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: { itemTypeId: t, rfidTag: 'NEW-RFID-2', currentLockerId: stack.lockerId },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().currentLocker.id).toBe(stack.lockerId)
  })

  it('admin scoped crée dans SA commune → 201', async () => {
    const a = await seedStack('CommuneA')
    const t = await seedItemType()
    const adminA = await seedUser(pgSql, { role: 'admin', communeId: a.communeId })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/items/',
      headers: { authorization: signSession(app, adminA.id, 'admin', a.communeId) },
      payload: { itemTypeId: t, rfidTag: 'TAG-OK', currentLockerId: a.lockerId },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().currentLocker.distributor.communeId).toBe(a.communeId)
  })

  it('admin scoped sans currentLockerId → 403 forbidden_orphan_create_super_admin_only', async () => {
    const a = await seedStack('CommuneA')
    const t = await seedItemType()
    const adminA = await seedUser(pgSql, { role: 'admin', communeId: a.communeId })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/items/',
      headers: { authorization: signSession(app, adminA.id, 'admin', a.communeId) },
      payload: { itemTypeId: t, rfidTag: 'TAG-ORPHAN' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('forbidden_orphan_create_super_admin_only')
  })

  it('admin scoped sur locker d\'AUTRE commune → 403 forbidden_cross_commune', async () => {
    const a = await seedStack('CommuneA')
    const b = await seedStack('CommuneB')
    const t = await seedItemType()
    const adminA = await seedUser(pgSql, { role: 'admin', communeId: a.communeId })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/items/',
      headers: { authorization: signSession(app, adminA.id, 'admin', a.communeId) },
      payload: { itemTypeId: t, rfidTag: 'TAG-EVIL', currentLockerId: b.lockerId },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('forbidden_cross_commune')
  })

  it('admin scoped sur locker inconnu → 404 locker_not_found', async () => {
    const a = await seedStack('CommuneA')
    const t = await seedItemType()
    const adminA = await seedUser(pgSql, { role: 'admin', communeId: a.communeId })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/items/',
      headers: { authorization: signSession(app, adminA.id, 'admin', a.communeId) },
      payload: { itemTypeId: t, rfidTag: 'TAG-G', currentLockerId: randomUUID() },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('locker_not_found')
  })

  it('itemTypeId inconnu (super_admin) → 404 item_type_not_found', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/items/',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: { itemTypeId: randomUUID(), rfidTag: 'TAG-NOTYPE' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('item_type_not_found')
  })

  it('RFID dupliqué → 409 rfid_tag_conflict', async () => {
    const t = await seedItemType()
    await seedItem({ itemTypeId: t, rfidTag: 'TAG-DUP' })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/items/',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: { itemTypeId: t, rfidTag: 'TAG-DUP' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('rfid_tag_conflict')
  })

  it('payload invalide (rfidTag trop court) → 400', async () => {
    const t = await seedItemType()
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/items/',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: { itemTypeId: t, rfidTag: 'ab' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('citizen → 403', async () => {
    const t = await seedItemType()
    const citizen = await seedUser(pgSql, { role: 'citizen' })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/items/',
      headers: { authorization: signSession(app, citizen.id, 'citizen') },
      payload: { itemTypeId: t, rfidTag: 'TAG-CITIZEN' },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('PUT /v1/admin/items/:id', () => {
  it('super_admin update condition → 200', async () => {
    const stack = await seedStack('CommuneU')
    const t = await seedItemType()
    const itemId = await seedItem({ itemTypeId: t, currentLockerId: stack.lockerId })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/items/${itemId}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: { condition: 'worn' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().condition).toBe('worn')

    const rows = await pgSql`SELECT condition FROM items WHERE id = ${itemId}`
    expect(rows[0]!.condition).toBe('worn')
  })

  it('admin scoped update item de SA commune → 200', async () => {
    const a = await seedStack('CommuneA')
    const t = await seedItemType()
    const itemId = await seedItem({ itemTypeId: t, currentLockerId: a.lockerId })
    const adminA = await seedUser(pgSql, { role: 'admin', communeId: a.communeId })

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/items/${itemId}`,
      headers: { authorization: signSession(app, adminA.id, 'admin', a.communeId) },
      payload: { rfidTag: 'UPDATED-TAG' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().rfidTag).toBe('UPDATED-TAG')
  })

  it('admin scoped update item d\'AUTRE commune → 404 anti-leak (pas 403)', async () => {
    const a = await seedStack('CommuneA')
    const b = await seedStack('CommuneB')
    const t = await seedItemType()
    const itemB = await seedItem({ itemTypeId: t, currentLockerId: b.lockerId, rfidTag: 'B-RFID' })
    const adminA = await seedUser(pgSql, { role: 'admin', communeId: a.communeId })

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/items/${itemB}`,
      headers: { authorization: signSession(app, adminA.id, 'admin', a.communeId) },
      payload: { condition: 'damaged' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('item_not_found')

    // Garde-fou : pas de modification effective
    const rows = await pgSql`SELECT condition FROM items WHERE id = ${itemB}`
    expect(rows[0]!.condition).toBe('new')
  })

  it('admin scoped tente unassign (currentLockerId=null) → 403 forbidden_unassign_super_admin_only', async () => {
    const a = await seedStack('CommuneA')
    const t = await seedItemType()
    const itemId = await seedItem({ itemTypeId: t, currentLockerId: a.lockerId })
    const adminA = await seedUser(pgSql, { role: 'admin', communeId: a.communeId })

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/items/${itemId}`,
      headers: { authorization: signSession(app, adminA.id, 'admin', a.communeId) },
      payload: { currentLockerId: null },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('forbidden_unassign_super_admin_only')
  })

  it('admin scoped tente déplacement vers locker d\'autre commune → 403 forbidden_cross_commune', async () => {
    const a = await seedStack('CommuneA')
    const b = await seedStack('CommuneB')
    const t = await seedItemType()
    const itemA = await seedItem({ itemTypeId: t, currentLockerId: a.lockerId })
    const adminA = await seedUser(pgSql, { role: 'admin', communeId: a.communeId })

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/items/${itemA}`,
      headers: { authorization: signSession(app, adminA.id, 'admin', a.communeId) },
      payload: { currentLockerId: b.lockerId },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('forbidden_cross_commune')
  })

  it('super_admin peut unassign (currentLockerId=null) → 200 + currentLocker=null', async () => {
    const stack = await seedStack('CommuneOrphan')
    const t = await seedItemType()
    const itemId = await seedItem({ itemTypeId: t, currentLockerId: stack.lockerId })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/items/${itemId}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: { currentLockerId: null },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().currentLocker).toBeNull()
  })

  it('RFID dupliqué → 409 rfid_tag_conflict', async () => {
    const stack = await seedStack('CommuneDup')
    const t = await seedItemType()
    await seedItem({ itemTypeId: t, currentLockerId: stack.lockerId, rfidTag: 'EXISTING-TAG' })
    const itemId = await seedItem({
      itemTypeId: t, currentLockerId: stack.lockerId, rfidTag: 'OTHER-TAG',
    })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/items/${itemId}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: { rfidTag: 'EXISTING-TAG' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('rfid_tag_conflict')
  })

  it('body vide → 400 (at_least_one_field_required)', async () => {
    const stack = await seedStack('CommuneEmpty')
    const t = await seedItemType()
    const itemId = await seedItem({ itemTypeId: t, currentLockerId: stack.lockerId })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/items/${itemId}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })

  it('id inconnu (super_admin) → 404', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/items/${randomUUID()}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
      payload: { condition: 'worn' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('citizen → 403', async () => {
    const stack = await seedStack('CommuneCitizen')
    const t = await seedItemType()
    const itemId = await seedItem({ itemTypeId: t, currentLockerId: stack.lockerId })
    const citizen = await seedUser(pgSql, { role: 'citizen' })
    const res = await app.inject({
      method: 'PUT',
      url: `/v1/admin/items/${itemId}`,
      headers: { authorization: signSession(app, citizen.id, 'citizen') },
      payload: { condition: 'worn' },
    })
    expect(res.statusCode).toBe(403)
  })
})
