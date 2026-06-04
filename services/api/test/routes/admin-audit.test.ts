/**
 * Tests d'intégration pour /v1/admin/audit/recent.
 *
 * Périmètre :
 *   - GET /recent : scope super_admin vs admin commune (JOIN distributors)
 *   - Filtres : eventType, source, distributorId, from, to (YYYY-MM-DD)
 *   - Pagination cursor `<iso>_<uuid>` : OK et décodage 400 sur cursor invalide
 *   - Tri DESC createdAt + id tiebreaker
 *   - leftJoin reservations/users : events orphelins (fault/maintenance) visibles
 *   - 401 sans auth, 403 citizen, 403 admin sans communeId
 *
 * Stack identique aux autres tests admin (testcontainers Postgres + Redis,
 * app.inject, TRUNCATE entre tests).
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

type LockerEventType =
  | 'reserved' | 'opened' | 'closed' | 'returned'
  | 'expired' | 'cancelled' | 'fault' | 'maintenance' | 'extended'

interface DistributorSeed {
  id: string
  communeId: string
  lockerId: string
}

/** Crée un distributor + 1 locker idle dans la commune passée. */
async function seedDistributor(communeId: string): Promise<DistributorSeed> {
  const id = randomUUID()
  const lockerId = randomUUID()
  await pgSql`INSERT INTO distributors (id, serial_number, commune_id, name, locker_count)
    VALUES (${id}, ${'SN-' + id.slice(0, 8)}, ${communeId}, ${'Dist ' + id.slice(0, 4)}, 4)`
  await pgSql`INSERT INTO lockers (id, distributor_id, position, state)
    VALUES (${lockerId}, ${id}, 0, 'idle')`
  return { id, communeId, lockerId }
}

/**
 * Insère un locker_event minimal (sans reservation). Si createdAt fourni,
 * override le DEFAULT NOW() pour pouvoir contrôler l'ordre des events.
 */
async function seedLockerEvent(opts: {
  lockerId: string
  eventType?: LockerEventType
  source?: string
  createdAt?: Date
  reservationId?: string | null
  metadata?: Record<string, unknown>
}): Promise<string> {
  const id = randomUUID()
  const eventType: LockerEventType = opts.eventType ?? 'opened'
  const source = opts.source ?? 'firmware'
  const metadata = JSON.stringify(opts.metadata ?? {})
  if (opts.createdAt) {
    await pgSql`
      INSERT INTO locker_events (id, locker_id, reservation_id, event_type, source, metadata, created_at)
      VALUES (${id}, ${opts.lockerId}, ${opts.reservationId ?? null}, ${eventType},
              ${source}, ${metadata}::jsonb, ${opts.createdAt.toISOString()})`
  } else {
    await pgSql`
      INSERT INTO locker_events (id, locker_id, reservation_id, event_type, source, metadata)
      VALUES (${id}, ${opts.lockerId}, ${opts.reservationId ?? null}, ${eventType},
              ${source}, ${metadata}::jsonb)`
  }
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

describe('GET /v1/admin/audit/recent — scope multi-tenant', () => {
  it('super_admin → voit events de toutes les communes', async () => {
    const a = await seedCommune(pgSql, 'CommuneA')
    const b = await seedCommune(pgSql, 'CommuneB')
    const distA = await seedDistributor(a)
    const distB = await seedDistributor(b)
    await seedLockerEvent({ lockerId: distA.lockerId, eventType: 'opened' })
    await seedLockerEvent({ lockerId: distB.lockerId, eventType: 'returned' })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/audit/recent',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { items: { distributor: { communeId: string } }[] }
    expect(body.items).toHaveLength(2)
    const communeIds = body.items.map((i) => i.distributor.communeId).sort()
    expect(communeIds).toEqual([a, b].sort())
  })

  it('admin scoped → ne voit que les events de sa commune (filtré via JOIN)', async () => {
    const a = await seedCommune(pgSql, 'CommuneA')
    const b = await seedCommune(pgSql, 'CommuneB')
    const distA = await seedDistributor(a)
    const distB = await seedDistributor(b)
    await seedLockerEvent({ lockerId: distA.lockerId, eventType: 'opened' })
    await seedLockerEvent({ lockerId: distA.lockerId, eventType: 'returned' })
    await seedLockerEvent({ lockerId: distB.lockerId, eventType: 'fault' })
    const adminA = await seedUser(pgSql, { role: 'admin', communeId: a })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/audit/recent',
      headers: { authorization: signSession(app, adminA.id, 'admin', a) },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { items: { distributor: { communeId: string } }[] }
    expect(body.items).toHaveLength(2)
    for (const item of body.items) {
      expect(item.distributor.communeId).toBe(a)
    }
  })

  it('citizen → 403 forbidden_admin_required', async () => {
    const citizen = await seedUser(pgSql, { role: 'citizen' })
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/audit/recent',
      headers: { authorization: signSession(app, citizen.id, 'citizen') },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('forbidden_admin_required')
  })

  it('sans token → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/audit/recent',
    })
    expect(res.statusCode).toBe(401)
  })

  it('admin sans communeId dans le JWT → 403 forbidden_admin_missing_commune', async () => {
    // Cas tordu : JWT role=admin sans communeId. requireAdminScope refuse.
    const u = await seedUser(pgSql, { role: 'admin' })
    const token = app.jwt.sign({ sub: u.id, role: 'admin' })
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/audit/recent',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('GET /v1/admin/audit/recent — filtres', () => {
  it('eventType=opened → filtre exact', async () => {
    const commune = await seedCommune(pgSql)
    const dist = await seedDistributor(commune)
    await seedLockerEvent({ lockerId: dist.lockerId, eventType: 'opened' })
    await seedLockerEvent({ lockerId: dist.lockerId, eventType: 'returned' })
    await seedLockerEvent({ lockerId: dist.lockerId, eventType: 'fault' })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/audit/recent?eventType=opened',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { items: { eventType: string }[] }
    expect(body.items).toHaveLength(1)
    expect(body.items[0]!.eventType).toBe('opened')
  })

  it('source=admin → filtre exact (force-cancel dashboard)', async () => {
    const commune = await seedCommune(pgSql)
    const dist = await seedDistributor(commune)
    await seedLockerEvent({ lockerId: dist.lockerId, source: 'firmware' })
    await seedLockerEvent({ lockerId: dist.lockerId, source: 'admin' })
    await seedLockerEvent({ lockerId: dist.lockerId, source: 'cron' })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/audit/recent?source=admin',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { items: { source: string }[] }
    expect(body.items).toHaveLength(1)
    expect(body.items[0]!.source).toBe('admin')
  })

  it('distributorId → filtre les events d\'un distributor précis', async () => {
    const commune = await seedCommune(pgSql)
    const dist1 = await seedDistributor(commune)
    const dist2 = await seedDistributor(commune)
    await seedLockerEvent({ lockerId: dist1.lockerId })
    await seedLockerEvent({ lockerId: dist1.lockerId })
    await seedLockerEvent({ lockerId: dist2.lockerId })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/audit/recent?distributorId=${dist1.id}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { items: { distributor: { id: string } }[] }
    expect(body.items).toHaveLength(2)
    for (const item of body.items) {
      expect(item.distributor.id).toBe(dist1.id)
    }
  })

  it('from/to (YYYY-MM-DD) → bornes inclusives au jour, exclusives à to+1', async () => {
    const commune = await seedCommune(pgSql)
    const dist = await seedDistributor(commune)
    await seedLockerEvent({ lockerId: dist.lockerId, createdAt: new Date('2026-05-10T12:00:00Z') })
    await seedLockerEvent({ lockerId: dist.lockerId, createdAt: new Date('2026-05-15T08:00:00Z') })
    await seedLockerEvent({ lockerId: dist.lockerId, createdAt: new Date('2026-05-20T23:59:00Z') })
    await seedLockerEvent({ lockerId: dist.lockerId, createdAt: new Date('2026-05-21T01:00:00Z') })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/audit/recent?from=2026-05-15&to=2026-05-20',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { items: { createdAt: string }[] }
    // 15/05 (inclus) + 20/05 (jusqu'à 23:59 inclus car borne to+1 exclusive)
    expect(body.items).toHaveLength(2)
  })

  it('from au format invalide → 400 validation_error', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/audit/recent?from=15/05/2026',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('GET /v1/admin/audit/recent — pagination cursor', () => {
  it('limit + nextCursor : suite paginée stable, pas de duplicat', async () => {
    const commune = await seedCommune(pgSql)
    const dist = await seedDistributor(commune)
    // 5 events sur 5 secondes distinctes
    const base = Date.now() - 60_000
    for (let i = 0; i < 5; i++) {
      await seedLockerEvent({
        lockerId: dist.lockerId,
        eventType: 'opened',
        createdAt: new Date(base + i * 1000),
      })
    }
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const page1 = await app.inject({
      method: 'GET',
      url: '/v1/admin/audit/recent?limit=2',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(page1.statusCode).toBe(200)
    const b1 = page1.json() as { items: { id: string }[]; nextCursor: string | null }
    expect(b1.items).toHaveLength(2)
    expect(b1.nextCursor).not.toBeNull()

    const page2 = await app.inject({
      method: 'GET',
      url: `/v1/admin/audit/recent?limit=2&cursor=${encodeURIComponent(b1.nextCursor!)}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(page2.statusCode).toBe(200)
    const b2 = page2.json() as { items: { id: string }[]; nextCursor: string | null }
    expect(b2.items).toHaveLength(2)
    // Pas de chevauchement entre pages
    const ids1 = b1.items.map((i) => i.id)
    const ids2 = b2.items.map((i) => i.id)
    for (const id of ids2) expect(ids1).not.toContain(id)

    const page3 = await app.inject({
      method: 'GET',
      url: `/v1/admin/audit/recent?limit=2&cursor=${encodeURIComponent(b2.nextCursor!)}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    const b3 = page3.json() as { items: { id: string }[]; nextCursor: string | null }
    expect(b3.items).toHaveLength(1)
    expect(b3.nextCursor).toBeNull()
  })

  it('cursor invalide (sans underscore) → 400 invalid_cursor', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/audit/recent?cursor=not-a-valid-cursor',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('invalid_cursor')
  })

  it('cursor invalide (date non parsable) → 400 invalid_cursor', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const cursor = `not-a-date_${randomUUID()}`
    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/audit/recent?cursor=${encodeURIComponent(cursor)}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('invalid_cursor')
  })

  it('cursor invalide (UUID malformé) → 400 invalid_cursor', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const cursor = `${new Date().toISOString()}_not-a-uuid`
    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/audit/recent?cursor=${encodeURIComponent(cursor)}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('invalid_cursor')
  })
})

describe('GET /v1/admin/audit/recent — tri & join', () => {
  it('tri DESC createdAt + id tiebreaker en cas d\'égalité', async () => {
    const commune = await seedCommune(pgSql)
    const dist = await seedDistributor(commune)
    // Trois events avec exactement le même createdAt → tri par id DESC.
    const same = new Date('2026-05-19T10:00:00Z')
    const e1 = await seedLockerEvent({ lockerId: dist.lockerId, createdAt: same })
    const e2 = await seedLockerEvent({ lockerId: dist.lockerId, createdAt: same })
    const e3 = await seedLockerEvent({ lockerId: dist.lockerId, createdAt: same })
    const expectedDesc = [e1, e2, e3].sort((a, b) => (a < b ? 1 : -1))
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/audit/recent',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { items: { id: string }[] }
    expect(body.items.map((i) => i.id)).toEqual(expectedDesc)
  })

  it('tri DESC sur createdAt même quand les events ont des dates distinctes', async () => {
    const commune = await seedCommune(pgSql)
    const dist = await seedDistributor(commune)
    const ePast = await seedLockerEvent({
      lockerId: dist.lockerId, createdAt: new Date('2026-05-10T10:00:00Z'),
    })
    const eMid = await seedLockerEvent({
      lockerId: dist.lockerId, createdAt: new Date('2026-05-15T10:00:00Z'),
    })
    const eRecent = await seedLockerEvent({
      lockerId: dist.lockerId, createdAt: new Date('2026-05-19T10:00:00Z'),
    })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/audit/recent',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    const body = res.json() as { items: { id: string }[] }
    expect(body.items.map((i) => i.id)).toEqual([eRecent, eMid, ePast])
  })

  it('event sans reservation_id (fault/maintenance orphelin) → reservation = null mais event visible', async () => {
    const commune = await seedCommune(pgSql)
    const dist = await seedDistributor(commune)
    await seedLockerEvent({
      lockerId: dist.lockerId,
      eventType: 'fault',
      reservationId: null,
      metadata: { reason: 'door_jam' },
    })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/audit/recent',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      items: {
        eventType: string
        reservation: { id: string; userEmail: string } | null
        metadata: Record<string, unknown>
      }[]
    }
    expect(body.items).toHaveLength(1)
    expect(body.items[0]!.eventType).toBe('fault')
    expect(body.items[0]!.reservation).toBeNull()
    expect(body.items[0]!.metadata).toEqual({ reason: 'door_jam' })
  })
})
