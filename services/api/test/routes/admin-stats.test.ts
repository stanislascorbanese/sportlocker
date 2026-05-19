/**
 * Tests d'intégration des routes admin /v1/admin/stats :
 *   - GET /reservations-daily?days=N
 *   - GET /dashboard?days=N
 *
 * Stack identique aux autres tests (testcontainers Postgres+Redis, app.inject,
 * TRUNCATE entre tests). On valide :
 *   - le bon comportement de `generate_series` (jours sans data à 0)
 *   - le scoping multi-tenant (admin commune A ne voit que ses distributeurs)
 *   - l'agrégat byStatus toujours complet (les 6 statuts)
 *   - le tri topDistributors (count DESC, name ASC)
 *   - la validation Zod (days hors range → 400)
 *   - l'auth (sans token → 401)
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { GenericContainer, type StartedTestContainer } from 'testcontainers'
import postgres from 'postgres'
import IORedis from 'ioredis'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'

import {
  seedReservationFixtures,
  seedReservations,
  type ReservationFixturesResult,
} from '../helpers/seed-reservations.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..', '..', '..')
const SCHEMA_PATH = join(REPO_ROOT, 'database', 'schema.sql')
const MIGRATION_PATH = join(REPO_ROOT, 'database', 'migrations', '0001_fn_locker_is_available.sql')

let pgContainer: StartedPostgreSqlContainer
let redisContainer: StartedTestContainer
let pgSql: ReturnType<typeof postgres>
let redisClient: IORedis
let app: FastifyInstance

type AdminRole = 'admin' | 'super_admin'

function authHeader(userId: string, role: AdminRole, communeId?: string): string {
  const payload: { sub: string; role: AdminRole; communeId?: string } = { sub: userId, role }
  if (communeId) payload.communeId = communeId
  return `Bearer ${app.jwt.sign(payload)}`
}

async function seedAdminUser(role: AdminRole, communeId?: string): Promise<string> {
  const id = randomUUID()
  await pgSql`INSERT INTO users (id, firebase_uid, email, role, commune_id)
    VALUES (${id}, ${'fb-' + id.slice(0, 8)}, ${id.slice(0, 8) + '@admin.local'},
            ${role}, ${communeId ?? null})`
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
    maintenance_tickets, push_tokens, notification_logs, reviews,
    admin_invites
    RESTART IDENTITY CASCADE`
  await redisClient.flushdb()
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/admin/stats/reservations-daily
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /v1/admin/stats/reservations-daily', () => {
  it("sans réservation en DB → array de N points tous à count=0 (longueur N)", async () => {
    await seedReservationFixtures(pgSql) // setup graphes, aucune résa
    const su = await seedAdminUser('super_admin')

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats/reservations-daily?days=14',
      headers: { authorization: authHeader(su, 'super_admin') },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as { points: { date: string; count: number }[] }
    expect(body.points).toHaveLength(14)
    expect(body.points.every((p) => p.count === 0)).toBe(true)
    // Tri ASC par date
    const dates = body.points.map((p) => p.date)
    const sorted = [...dates].sort()
    expect(dates).toEqual(sorted)
    // Format YYYY-MM-DD strict
    expect(body.points[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('quelques réservations spread sur 3 jours → série correcte avec zeros préservés', async () => {
    const f = await seedReservationFixtures(pgSql)
    // 2 résas aujourd'hui, 1 hier, 0 il y a 2 jours, 3 il y a 3 jours
    await seedReservations(pgSql, f, [
      { distributorIdx: 0, itemIdx: 0, status: 'pending',   daysAgo: 0 },
      { distributorIdx: 0, itemIdx: 1, status: 'returned',  daysAgo: 0 },
      { distributorIdx: 1, itemIdx: 0, status: 'cancelled', daysAgo: 1 },
      { distributorIdx: 1, itemIdx: 0, status: 'active',    daysAgo: 3 },
      { distributorIdx: 1, itemIdx: 1, status: 'returned',  daysAgo: 3 },
      { distributorIdx: 0, itemIdx: 0, status: 'expired',   daysAgo: 3 },
    ])
    const su = await seedAdminUser('super_admin')

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats/reservations-daily?days=7',
      headers: { authorization: authHeader(su, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { points: { date: string; count: number }[] }
    expect(body.points).toHaveLength(7)
    // Le dernier point est aujourd'hui.
    const today = body.points[6]!
    const yesterday = body.points[5]!
    const twoDaysAgo = body.points[4]!
    const threeDaysAgo = body.points[3]!
    expect(today.count).toBe(2)
    expect(yesterday.count).toBe(1)
    expect(twoDaysAgo.count).toBe(0) // zero préservé par generate_series
    expect(threeDaysAgo.count).toBe(3)
    // Total ≥ 6 (toutes nos résas tombent dans la fenêtre 7 jours)
    const total = body.points.reduce((acc, p) => acc + p.count, 0)
    expect(total).toBe(6)
  })

  it('admin scopé → ne compte que les résas des distributeurs de sa commune', async () => {
    const f = await seedReservationFixtures(pgSql) // communes A et B (2x2 distributeurs)
    // 3 résas aujourd'hui dans commune A (distributeurs 0 et 1)
    // 5 résas aujourd'hui dans commune B (distributeurs 2 et 3)
    await seedReservations(pgSql, f, [
      { distributorIdx: 0, itemIdx: 0, status: 'pending',  daysAgo: 0 },
      { distributorIdx: 0, itemIdx: 1, status: 'returned', daysAgo: 0 },
      { distributorIdx: 1, itemIdx: 0, status: 'active',   daysAgo: 0 },
      { distributorIdx: 2, itemIdx: 0, status: 'pending',  daysAgo: 0 },
      { distributorIdx: 2, itemIdx: 1, status: 'returned', daysAgo: 0 },
      { distributorIdx: 3, itemIdx: 0, status: 'pending',  daysAgo: 0 },
      { distributorIdx: 3, itemIdx: 1, status: 'returned', daysAgo: 0 },
      { distributorIdx: 3, itemIdx: 0, status: 'expired',  daysAgo: 0 },
    ])
    const communeA = f.communes[0]!.id
    const adminA = await seedAdminUser('admin', communeA)

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats/reservations-daily?days=7',
      headers: { authorization: authHeader(adminA, 'admin', communeA) },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { points: { date: string; count: number }[] }
    const total = body.points.reduce((acc, p) => acc + p.count, 0)
    expect(total).toBe(3) // commune A seulement
    // Tout est concentré sur "aujourd'hui"
    expect(body.points[6]!.count).toBe(3)
  })

  it('super_admin → compte tout (cross-commune)', async () => {
    const f = await seedReservationFixtures(pgSql)
    await seedReservations(pgSql, f, [
      { distributorIdx: 0, itemIdx: 0, status: 'pending',  daysAgo: 0 },
      { distributorIdx: 2, itemIdx: 0, status: 'returned', daysAgo: 0 },
      { distributorIdx: 3, itemIdx: 1, status: 'active',   daysAgo: 1 },
    ])
    const su = await seedAdminUser('super_admin')

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats/reservations-daily?days=7',
      headers: { authorization: authHeader(su, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const total = (res.json().points as { count: number }[]).reduce((a, p) => a + p.count, 0)
    expect(total).toBe(3)
  })

  it('days=300 (hors range max 90) → 400 validation', async () => {
    const su = await seedAdminUser('super_admin')
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats/reservations-daily?days=300',
      headers: { authorization: authHeader(su, 'super_admin') },
    })
    expect(res.statusCode).toBe(400)
  })

  it('days=0 (sous le min) → 400 validation', async () => {
    const su = await seedAdminUser('super_admin')
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats/reservations-daily?days=0',
      headers: { authorization: authHeader(su, 'super_admin') },
    })
    expect(res.statusCode).toBe(400)
  })

  it('sans token de session → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats/reservations-daily?days=7',
    })
    expect(res.statusCode).toBe(401)
  })

  it('citizen → 403 forbidden_admin_required', async () => {
    const id = randomUUID()
    await pgSql`INSERT INTO users (id, firebase_uid, email, role)
      VALUES (${id}, ${'fb-' + id.slice(0, 8)}, ${id.slice(0, 8) + '@test.local'}, 'citizen')`
    // On forge un JWT citizen — la guard requireAdminScope doit rejeter.
    const token = app.jwt.sign({ sub: id, role: 'citizen' })
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats/reservations-daily?days=7',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('forbidden_admin_required')
  })

  it('default days=7 (omis) → 7 points', async () => {
    await seedReservationFixtures(pgSql)
    const su = await seedAdminUser('super_admin')
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats/reservations-daily',
      headers: { authorization: authHeader(su, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    expect((res.json().points as unknown[]).length).toBe(7)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/admin/stats/dashboard
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /v1/admin/stats/dashboard', () => {
  type DashboardResponse = {
    days: number
    daily: { date: string; count: number }[]
    byStatus: { status: string; count: number }[]
    topDistributors: { id: string; name: string; serialNumber: string; count: number }[]
    topItemTypes: { id: string; name: string; count: number }[]
    hourly: { dow: number; hour: number; count: number }[]
  }

  /**
   * Helper local : seed un jeu intéressant (12 résas, mix statuts/communes/items)
   * et renvoie les fixtures.
   */
  async function seedRichDataset(): Promise<ReservationFixturesResult> {
    const f = await seedReservationFixtures(pgSql, {
      communeCount: 2,
      distributorsPerCommune: 2,
      itemTypeCount: 2,
      itemsPerType: 1,
    })
    // 12 résas réparties sur ~7 jours, sur tous les statuts (sauf 'overdue').
    // - Distributeur 0 (commune A) : 5 résas → top
    // - Distributeur 1 (commune A) : 3 résas
    // - Distributeur 2 (commune B) : 2 résas
    // - Distributeur 3 (commune B) : 2 résas
    // - Items 0 (ballon) : 7 résas, Items 1 (raquette) : 5 résas
    await seedReservations(pgSql, f, [
      // ── aujourd'hui ──
      { distributorIdx: 0, itemIdx: 0, status: 'pending',   daysAgo: 0, hour: 9 },
      { distributorIdx: 0, itemIdx: 0, status: 'active',    daysAgo: 0, hour: 14 },
      { distributorIdx: 0, itemIdx: 1, status: 'returned',  daysAgo: 0, hour: 18 },
      { distributorIdx: 1, itemIdx: 0, status: 'pending',   daysAgo: 0, hour: 9 },
      { distributorIdx: 2, itemIdx: 1, status: 'cancelled', daysAgo: 0, hour: 10 },
      // ── hier ──
      { distributorIdx: 0, itemIdx: 0, status: 'returned',  daysAgo: 1, hour: 14 },
      { distributorIdx: 1, itemIdx: 1, status: 'expired',   daysAgo: 1, hour: 22 },
      { distributorIdx: 3, itemIdx: 0, status: 'returned',  daysAgo: 1, hour: 8 },
      // ── il y a 3 jours ──
      { distributorIdx: 0, itemIdx: 1, status: 'active',    daysAgo: 3, hour: 14 },
      { distributorIdx: 1, itemIdx: 0, status: 'returned',  daysAgo: 3, hour: 14 },
      { distributorIdx: 2, itemIdx: 0, status: 'returned',  daysAgo: 3, hour: 12 },
      { distributorIdx: 3, itemIdx: 1, status: 'cancelled', daysAgo: 3, hour: 20 },
    ])
    return f
  }

  it('renvoie les 5 agrégats avec daily de longueur N (default 30)', async () => {
    await seedRichDataset()
    const su = await seedAdminUser('super_admin')

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats/dashboard',
      headers: { authorization: authHeader(su, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as DashboardResponse
    expect(body.days).toBe(30)
    expect(Array.isArray(body.daily)).toBe(true)
    expect(body.daily).toHaveLength(30)
    expect(Array.isArray(body.byStatus)).toBe(true)
    expect(Array.isArray(body.topDistributors)).toBe(true)
    expect(Array.isArray(body.topItemTypes)).toBe(true)
    expect(Array.isArray(body.hourly)).toBe(true)
  })

  it('byStatus contient TOUS les 6 statuts même si count=0', async () => {
    // Pas de résa du tout — on doit quand même avoir les 6 entrées
    await seedReservationFixtures(pgSql)
    const su = await seedAdminUser('super_admin')

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats/dashboard?days=30',
      headers: { authorization: authHeader(su, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as DashboardResponse
    const statuses = body.byStatus.map((s) => s.status).sort()
    expect(statuses).toEqual(
      ['active', 'cancelled', 'expired', 'overdue', 'pending', 'returned'].sort(),
    )
    expect(body.byStatus.every((s) => s.count === 0)).toBe(true)
  })

  it('byStatus reflète les counts réels (mix de statuts)', async () => {
    await seedRichDataset()
    const su = await seedAdminUser('super_admin')

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats/dashboard?days=30',
      headers: { authorization: authHeader(su, 'super_admin') },
    })
    const body = res.json() as DashboardResponse
    const m = new Map(body.byStatus.map((s) => [s.status, s.count]))
    expect(m.get('pending')).toBe(2)
    expect(m.get('active')).toBe(2)
    expect(m.get('returned')).toBe(5)
    expect(m.get('cancelled')).toBe(2)
    expect(m.get('expired')).toBe(1)
    expect(m.get('overdue')).toBe(0) // toujours présent, à zéro
  })

  it('topDistributors trié par count DESC puis name ASC, limité à 5', async () => {
    const f = await seedReservationFixtures(pgSql, {
      communeCount: 1,
      distributorsPerCommune: 6, // 6 distributeurs pour vérifier le LIMIT 5
      itemTypeCount: 1,
      itemsPerType: 1,
    })
    // Counts forcés : d0=4, d1=4, d2=3, d3=2, d4=1, d5=0
    // Pour égalité d0==d1, le tri secondaire par name ASC ('Dist-Commune-A-0' < '...-1')
    // doit faire ressortir d0 avant d1.
    const specs: { distributorIdx: number; itemIdx: number; status: 'pending'; daysAgo: number }[] = []
    const repeats = [4, 4, 3, 2, 1, 0]
    repeats.forEach((n, idx) => {
      for (let i = 0; i < n; i++) {
        specs.push({ distributorIdx: idx, itemIdx: 0, status: 'pending', daysAgo: 0 })
      }
    })
    await seedReservations(pgSql, f, specs)
    const su = await seedAdminUser('super_admin')

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats/dashboard?days=30',
      headers: { authorization: authHeader(su, 'super_admin') },
    })
    const body = res.json() as DashboardResponse
    expect(body.topDistributors).toHaveLength(5) // LIMIT 5

    // Ordre attendu sur les counts : 4, 4, 3, 2, 1
    expect(body.topDistributors.map((d) => d.count)).toEqual([4, 4, 3, 2, 1])

    // Tie-break alphabétique entre les deux à count=4
    expect(body.topDistributors[0]!.name < body.topDistributors[1]!.name).toBe(true)

    // Chaque entrée expose id / name / serialNumber
    for (const d of body.topDistributors) {
      expect(d.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(typeof d.name).toBe('string')
      expect(typeof d.serialNumber).toBe('string')
    }
  })

  it("admin scopé → topDistributors ne contient QUE les distributeurs de sa commune", async () => {
    const f = await seedRichDataset()
    const communeA = f.communes[0]!.id
    const distributorsA = new Set(
      f.distributors.filter((d) => d.communeId === communeA).map((d) => d.id),
    )
    const adminA = await seedAdminUser('admin', communeA)

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats/dashboard?days=30',
      headers: { authorization: authHeader(adminA, 'admin', communeA) },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as DashboardResponse
    // 2 distributeurs en commune A → max 2 entrées
    expect(body.topDistributors.length).toBeLessThanOrEqual(2)
    for (const d of body.topDistributors) {
      expect(distributorsA.has(d.id)).toBe(true)
    }
  })

  it("admin scopé → byStatus et daily ne comptent QUE les résas de sa commune", async () => {
    const f = await seedRichDataset()
    const communeA = f.communes[0]!.id
    // En commune A on a injecté (distrib 0 + 1) :
    //   d0 : pending(0d), active(0d), returned(0d), returned(1d), active(3d) → 5
    //   d1 : pending(0d), expired(1d), returned(3d)                          → 3
    // Total commune A : 8
    const adminA = await seedAdminUser('admin', communeA)

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats/dashboard?days=30',
      headers: { authorization: authHeader(adminA, 'admin', communeA) },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as DashboardResponse

    const dailyTotal = body.daily.reduce((acc, p) => acc + p.count, 0)
    expect(dailyTotal).toBe(8)

    const statusTotal = body.byStatus.reduce((acc, s) => acc + s.count, 0)
    expect(statusTotal).toBe(8)
  })

  it("hourly retourne EXTRACT(DOW + HOUR) groupé correctement", async () => {
    const f = await seedReservationFixtures(pgSql, {
      communeCount: 1,
      distributorsPerCommune: 1,
      itemTypeCount: 1,
      itemsPerType: 1,
    })
    // 3 résas à hour=14 le même jour (DOW + HOUR identiques) → 1 ligne count=3.
    // 1 résa à hour=22 le même jour                          → 1 ligne count=1.
    await seedReservations(pgSql, f, [
      { distributorIdx: 0, itemIdx: 0, status: 'pending', daysAgo: 0, hour: 14 },
      { distributorIdx: 0, itemIdx: 0, status: 'active',  daysAgo: 0, hour: 14 },
      { distributorIdx: 0, itemIdx: 0, status: 'returned', daysAgo: 0, hour: 14 },
      { distributorIdx: 0, itemIdx: 0, status: 'expired', daysAgo: 0, hour: 22 },
    ])
    const su = await seedAdminUser('super_admin')

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats/dashboard?days=30',
      headers: { authorization: authHeader(su, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as DashboardResponse

    expect(body.hourly).toHaveLength(2)
    const hours = body.hourly.map((h) => h.hour).sort((a, b) => a - b)
    expect(hours).toEqual([14, 22])
    const at14 = body.hourly.find((h) => h.hour === 14)!
    const at22 = body.hourly.find((h) => h.hour === 22)!
    expect(at14.count).toBe(3)
    expect(at22.count).toBe(1)
    // dow doit être un entier 0..6
    expect(at14.dow).toBeGreaterThanOrEqual(0)
    expect(at14.dow).toBeLessThanOrEqual(6)
    expect(at14.dow).toBe(at22.dow) // même jour
    // Total = 4
    expect(body.hourly.reduce((acc, h) => acc + h.count, 0)).toBe(4)
  })

  it('topItemTypes trié par count DESC + LIMIT 5', async () => {
    await seedRichDataset()
    const su = await seedAdminUser('super_admin')

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats/dashboard?days=30',
      headers: { authorization: authHeader(su, 'super_admin') },
    })
    const body = res.json() as DashboardResponse
    // 7 résas item 0 (Ballon), 5 résas item 1 (Raquette)
    // Mais le seed initial créé seulement 2 types ; on doit donc en avoir 2.
    expect(body.topItemTypes.length).toBeGreaterThanOrEqual(2)
    expect(body.topItemTypes.length).toBeLessThanOrEqual(5)
    // Le premier doit être Ballon (count plus élevé)
    expect(body.topItemTypes[0]!.count).toBeGreaterThanOrEqual(body.topItemTypes[1]!.count)
    expect(body.topItemTypes[0]!.name).toBe('Ballon')
  })

  it('days=500 (hors range max 180) → 400 validation', async () => {
    const su = await seedAdminUser('super_admin')
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats/dashboard?days=500',
      headers: { authorization: authHeader(su, 'super_admin') },
    })
    expect(res.statusCode).toBe(400)
  })

  it('days=3 (sous le min 7) → 400 validation', async () => {
    const su = await seedAdminUser('super_admin')
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats/dashboard?days=3',
      headers: { authorization: authHeader(su, 'super_admin') },
    })
    expect(res.statusCode).toBe(400)
  })

  it('sans token de session → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats/dashboard',
    })
    expect(res.statusCode).toBe(401)
  })

  it('admin sans communeId dans le JWT → 403 forbidden_admin_missing_commune', async () => {
    // Un admin orphelin (cas pathologique, normalement bloqué au login)
    const id = randomUUID()
    await pgSql`INSERT INTO users (id, firebase_uid, email, role)
      VALUES (${id}, ${'fb-' + id.slice(0, 8)}, ${id.slice(0, 8) + '@admin.local'}, 'admin')`
    const token = app.jwt.sign({ sub: id, role: 'admin' }) // pas de communeId
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats/dashboard',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('forbidden_admin_missing_commune')
  })

  it('admin scopé sur commune sans données → tous les agrégats à zéro mais structure complète', async () => {
    const f = await seedReservationFixtures(pgSql) // 2 communes, aucune résa
    const communeB = f.communes[1]!.id
    const adminB = await seedAdminUser('admin', communeB)

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats/dashboard?days=14',
      headers: { authorization: authHeader(adminB, 'admin', communeB) },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as DashboardResponse
    expect(body.daily).toHaveLength(14)
    expect(body.daily.every((p) => p.count === 0)).toBe(true)
    expect(body.byStatus).toHaveLength(6)
    expect(body.byStatus.every((s) => s.count === 0)).toBe(true)
    // topDistributors renvoie les distributeurs même sans résa (LEFT JOIN), count=0
    expect(body.topDistributors.every((d) => d.count === 0)).toBe(true)
    expect(body.hourly).toHaveLength(0)
  })
})
