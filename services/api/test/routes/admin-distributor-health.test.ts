/**
 * Tests d'intégration GET /v1/admin/distributors/:id/health.
 *
 * Pattern identique à distributors.test.ts (testcontainers, app.inject).
 * Route authentifiée + scopée commune (requireAdminOrOperator).
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

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..', '..', '..')
const SCHEMA_PATH = join(REPO_ROOT, 'database', 'schema.sql')
const MIGRATION_PATH = join(REPO_ROOT, 'database', 'migrations', '0001_fn_locker_is_available.sql')

let pgContainer: StartedPostgreSqlContainer
let redisContainer: StartedTestContainer
let pgSql: ReturnType<typeof postgres>
let redisClient: IORedis
let app: FastifyInstance

async function seedCommune(): Promise<string> {
  const id = randomUUID()
  const insee = String(70000 + Math.floor(Math.random() * 9999))
  await pgSql`INSERT INTO communes (id, insee_code, name, postal_code, department, region)
    VALUES (${id}, ${insee}, 'Paris Test', '75001', '75', 'IDF')`
  return id
}

async function seedDistributor(communeId: string, opts: { lastSeenAt?: Date | null; firmware?: string | null } = {}): Promise<string> {
  const id = randomUUID()
  const serial = 'TEST-' + id.slice(0, 8)
  await pgSql`INSERT INTO distributors
    (id, serial_number, commune_id, name, status, locker_count, last_seen_at, firmware_version)
    VALUES (${id}, ${serial}, ${communeId}, 'Distributeur Test', 'online', 4,
            ${opts.lastSeenAt ?? null}, ${opts.firmware ?? null})`
  return id
}

interface HeartbeatOpts {
  receivedAt: Date
  rssiDbm?: number | null
  uptimeSeconds?: number | null
  cpuTempC?: number | null
  freeMemMb?: number | null
}

async function seedHeartbeat(distributorId: string, o: HeartbeatOpts): Promise<void> {
  await pgSql`INSERT INTO distributor_heartbeats
    (distributor_id, received_at, rssi_dbm, uptime_seconds, cpu_temp_c, free_mem_mb)
    VALUES (${distributorId}, ${o.receivedAt},
            ${o.rssiDbm ?? null}, ${o.uptimeSeconds ?? null},
            ${o.cpuTempC ?? null}, ${o.freeMemMb ?? null})`
}

async function seedUser(role: 'citizen' | 'operator' | 'admin', communeId: string | null = null): Promise<string> {
  const id = randomUUID()
  await pgSql`INSERT INTO users (id, firebase_uid, email, role, commune_id)
    VALUES (${id}, ${'fb-' + id.slice(0, 8)}, ${id.slice(0, 8) + '@test.local'}, ${role}, ${communeId})`
  return id
}

function authHeader(userId: string, role: 'citizen' | 'operator' | 'admin', communeId?: string): string {
  const token = app.jwt.sign(communeId ? { sub: userId, role, communeId } : { sub: userId, role })
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
})

describe('GET /v1/admin/distributors/:id/health', () => {
  it('renvoie 401 sans token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/distributors/${randomUUID()}/health`,
    })
    expect(res.statusCode).toBe(401)
  })

  it('renvoie 403 forbidden quand le user est citizen', async () => {
    const communeId = await seedCommune()
    const distributorId = await seedDistributor(communeId)
    const citizenId = await seedUser('citizen')

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/distributors/${distributorId}/health`,
      headers: { authorization: authHeader(citizenId, 'citizen') },
    })
    expect(res.statusCode).toBe(403)
  })

  it('renvoie 404 quand le distributeur est inconnu', async () => {
    const adminId = await seedUser('admin')
    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/distributors/${randomUUID()}/health`,
      headers: { authorization: authHeader(adminId, 'admin') },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('distributor_not_found')
  })

  it('agrège la télémétrie : summary, latest (le plus récent), série horaire (admin)', async () => {
    const communeId = await seedCommune()
    const lastSeen = new Date()
    const distributorId = await seedDistributor(communeId, { lastSeenAt: lastSeen, firmware: '1.4.2' })

    const now = Date.now()
    const older = new Date(now - 90 * 60 * 1000) // -90 min
    const recent = new Date(now - 10 * 60 * 1000) // -10 min
    await seedHeartbeat(distributorId, { receivedAt: older, rssiDbm: -70, uptimeSeconds: 1000, cpuTempC: 50.0, freeMemMb: 300 })
    await seedHeartbeat(distributorId, { receivedAt: recent, rssiDbm: -60, uptimeSeconds: 5800, cpuTempC: 62.5, freeMemMb: 180 })

    const adminId = await seedUser('admin')
    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/distributors/${distributorId}/health?hours=24`,
      headers: { authorization: authHeader(adminId, 'admin') },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()

    expect(body.distributor.id).toBe(distributorId)
    expect(body.distributor.firmwareVersion).toBe('1.4.2')
    expect(body.distributor.lastSeenAt).toBe(lastSeen.toISOString())

    expect(body.summary.windowHours).toBe(24)
    expect(body.summary.heartbeatCount).toBe(2)
    expect(body.summary.maxCpuTempC).toBeCloseTo(62.5, 1)
    expect(body.summary.minFreeMemMb).toBe(180)
    expect(body.summary.avgRssiDbm).toBeCloseTo(-65, 1)
    expect(body.summary.availabilityPct).toBeGreaterThanOrEqual(0)
    expect(body.summary.availabilityPct).toBeLessThanOrEqual(100)

    // latest = le heartbeat le plus récent
    expect(body.latest.cpuTempC).toBeCloseTo(62.5, 1)
    expect(body.latest.rssiDbm).toBe(-60)
    expect(body.latest.uptimeSeconds).toBe(5800)
    expect(body.latest.freeMemMb).toBe(180)

    expect(Array.isArray(body.series)).toBe(true)
    expect(body.series.length).toBeGreaterThanOrEqual(1)
  })

  it('renvoie un état vide cohérent quand aucun heartbeat', async () => {
    const communeId = await seedCommune()
    const distributorId = await seedDistributor(communeId)
    const adminId = await seedUser('admin')

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/distributors/${distributorId}/health`,
      headers: { authorization: authHeader(adminId, 'admin') },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.summary.heartbeatCount).toBe(0)
    expect(body.summary.availabilityPct).toBeNull()
    expect(body.summary.avgCpuTempC).toBeNull()
    expect(body.latest).toBeNull()
    expect(body.series).toEqual([])
  })

  it('un operator ne voit pas un distributeur hors de sa commune (404)', async () => {
    const communeA = await seedCommune()
    const communeB = await seedCommune()
    const distributorB = await seedDistributor(communeB)
    const operatorA = await seedUser('operator', communeA)

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/distributors/${distributorB}/health`,
      headers: { authorization: authHeader(operatorA, 'operator', communeA) },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('distributor_not_found')
  })

  it('un operator voit un distributeur de SA commune (200)', async () => {
    const communeA = await seedCommune()
    const distributorA = await seedDistributor(communeA)
    const operatorA = await seedUser('operator', communeA)

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/distributors/${distributorA}/health`,
      headers: { authorization: authHeader(operatorA, 'operator', communeA) },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().distributor.id).toBe(distributorA)
  })

  it('borne hours via Zod (400 si hors plage)', async () => {
    const communeId = await seedCommune()
    const distributorId = await seedDistributor(communeId)
    const adminId = await seedUser('admin')

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/distributors/${distributorId}/health?hours=9999`,
      headers: { authorization: authHeader(adminId, 'admin') },
    })
    expect(res.statusCode).toBe(400)
  })
})
