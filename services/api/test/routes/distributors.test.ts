/**
 * Tests d'intégration GET /v1/distributors/ et /v1/distributors/:id.
 *
 * Pattern identique à reservations.test.ts (testcontainers, app.inject).
 * Les routes n'exigent pas d'auth : on appelle sans Authorization.
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

interface SeedDistributorOpts {
  communeId: string
  name?: string
  status?: 'online' | 'offline' | 'maintenance' | 'decommissioned'
  latitude?: number | null
  longitude?: number | null
  lockerCount?: number
  lastSeenAt?: Date | null
}

async function seedDistributor(opts: SeedDistributorOpts): Promise<string> {
  const id = randomUUID()
  const serial = 'TEST-' + id.slice(0, 8)
  const name = opts.name ?? 'Distributeur Test'
  const status = opts.status ?? 'online'
  const lat = opts.latitude ?? 48.8566
  const lng = opts.longitude ?? 2.3522
  const lockerCount = opts.lockerCount ?? 4
  const lastSeen = opts.lastSeenAt ?? null

  await pgSql`INSERT INTO distributors
    (id, serial_number, commune_id, name, status, latitude, longitude, locker_count, last_seen_at)
    VALUES (${id}, ${serial}, ${opts.communeId}, ${name}, ${status},
            ${lat}, ${lng}, ${lockerCount}, ${lastSeen})`
  return id
}

async function seedLocker(
  distributorId: string,
  position: number,
  state: 'idle' | 'reserved' | 'active' | 'returning' | 'fault' = 'idle',
): Promise<string> {
  const id = randomUUID()
  await pgSql`INSERT INTO lockers (id, distributor_id, position, state)
    VALUES (${id}, ${distributorId}, ${position}, ${state})`
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
    maintenance_tickets, push_tokens, notification_logs, reviews
    RESTART IDENTITY CASCADE`
  await redisClient.flushdb()
})

describe('GET /v1/distributors/', () => {
  it('renvoie une liste vide quand aucun distributeur en base', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/distributors/' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ items: [] })
  })

  it('renvoie un distributeur avec tous ses champs + compte de casiers idle', async () => {
    const communeId = await seedCommune()
    const lastSeen = new Date('2026-05-13T10:00:00Z')
    const distributorId = await seedDistributor({
      communeId,
      name: 'Distributeur Châtelet',
      lockerCount: 4,
      lastSeenAt: lastSeen,
    })
    await seedLocker(distributorId, 0, 'idle')
    await seedLocker(distributorId, 1, 'idle')
    await seedLocker(distributorId, 2, 'reserved')
    await seedLocker(distributorId, 3, 'active')

    const res = await app.inject({ method: 'GET', url: '/v1/distributors/' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.items).toHaveLength(1)

    const d = body.items[0]
    expect(d.id).toBe(distributorId)
    expect(d.name).toBe('Distributeur Châtelet')
    expect(d.status).toBe('online')
    expect(d.communeId).toBe(communeId)
    expect(d.lockerCount).toBe(4)
    expect(d.idleLockers).toBe(2) // 2 idle sur 4
    expect(d.latitude).toBe(48.8566)
    expect(d.longitude).toBe(2.3522)
    expect(d.batteryPercent).toBeNull()
    expect(d.lastSeenAt).toBe(lastSeen.toISOString())
    expect(d.serialNumber).toMatch(/^TEST-/)
  })

  it('sérialise lastSeenAt à null quand jamais vu', async () => {
    const communeId = await seedCommune()
    await seedDistributor({ communeId, lastSeenAt: null })

    const res = await app.inject({ method: 'GET', url: '/v1/distributors/' })
    expect(res.statusCode).toBe(200)
    expect(res.json().items[0].lastSeenAt).toBeNull()
  })

  it('renvoie plusieurs distributeurs avec leurs comptes idle respectifs', async () => {
    const communeId = await seedCommune()

    const dA = await seedDistributor({ communeId, name: 'A', lockerCount: 2 })
    await seedLocker(dA, 0, 'idle')
    await seedLocker(dA, 1, 'idle')

    const dB = await seedDistributor({ communeId, name: 'B', lockerCount: 3 })
    await seedLocker(dB, 0, 'idle')
    await seedLocker(dB, 1, 'fault')
    await seedLocker(dB, 2, 'returning')

    const res = await app.inject({ method: 'GET', url: '/v1/distributors/' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.items).toHaveLength(2)

    const map = new Map<string, { idleLockers: number; lockerCount: number }>(
      body.items.map((d: { id: string; idleLockers: number; lockerCount: number }) =>
        [d.id, { idleLockers: d.idleLockers, lockerCount: d.lockerCount }],
      ),
    )
    expect(map.get(dA)).toEqual({ idleLockers: 2, lockerCount: 2 })
    expect(map.get(dB)).toEqual({ idleLockers: 1, lockerCount: 3 })
  })
})

describe('GET /v1/distributors/:id', () => {
  it('renvoie le détail + ses casiers triés par position', async () => {
    const communeId = await seedCommune()
    const distributorId = await seedDistributor({
      communeId,
      name: 'Détail Test',
      lockerCount: 3,
    })
    const lockerPos2 = await seedLocker(distributorId, 2, 'active')
    const lockerPos0 = await seedLocker(distributorId, 0, 'idle')
    const lockerPos1 = await seedLocker(distributorId, 1, 'reserved')

    const res = await app.inject({ method: 'GET', url: `/v1/distributors/${distributorId}` })
    expect(res.statusCode).toBe(200)
    const body = res.json()

    expect(body.id).toBe(distributorId)
    expect(body.name).toBe('Détail Test')
    expect(body.communeId).toBe(communeId)
    expect(body.lockerCount).toBe(3)
    expect(body.idleLockers).toBe(1)
    expect(body.lockers).toHaveLength(3)
    expect(body.lockers.map((l: { position: number }) => l.position)).toEqual([0, 1, 2])
    expect(body.lockers.map((l: { id: string }) => l.id)).toEqual([lockerPos0, lockerPos1, lockerPos2])
    expect(body.lockers.map((l: { state: string }) => l.state)).toEqual(['idle', 'reserved', 'active'])
  })

  it('renvoie 404 distributor_not_found quand le distributeur est inconnu', async () => {
    const ghost = randomUUID()
    const res = await app.inject({ method: 'GET', url: `/v1/distributors/${ghost}` })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: 'distributor_not_found' })
  })

  it("renvoie 400 quand l'id n'est pas un UUID valide", async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/distributors/not-a-uuid' })
    expect(res.statusCode).toBe(400)
  })

  it('renvoie un détail avec lockers vide quand aucun casier seedé', async () => {
    const communeId = await seedCommune()
    const distributorId = await seedDistributor({ communeId, lockerCount: 4 })

    const res = await app.inject({ method: 'GET', url: `/v1/distributors/${distributorId}` })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.lockers).toEqual([])
    expect(body.idleLockers).toBe(0)
  })
})
