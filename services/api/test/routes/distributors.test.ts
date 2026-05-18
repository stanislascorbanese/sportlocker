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
  // `??` confondrait null (explicite) avec undefined → distinguer pour
  // pouvoir tester les distributeurs SANS coordonnées (test nearby).
  const lat = opts.latitude === undefined ? 48.8566 : opts.latitude
  const lng = opts.longitude === undefined ? 2.3522 : opts.longitude
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

type Role = 'citizen' | 'operator' | 'admin' | 'super_admin'

async function seedUser(role: Role = 'citizen', communeId?: string): Promise<string> {
  const id = randomUUID()
  await pgSql`INSERT INTO users (id, firebase_uid, email, role, commune_id)
    VALUES (${id}, ${'fb-' + id.slice(0, 8)}, ${id.slice(0, 8) + '@test.local'},
            ${role}, ${communeId ?? null})`
  return id
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

describe('GET /v1/distributors/nearby', () => {
  it('renvoie une liste vide quand aucun distributeur dans le rayon', async () => {
    const communeId = await seedCommune()
    // Distributeur à Marseille (~660 km de Paris)
    await seedDistributor({ communeId, latitude: 43.2965, longitude: 5.3698 })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/distributors/nearby?lat=48.8566&lng=2.3522&radius_km=5',
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ items: [] })
  })

  it('renvoie les distributeurs triés par distance croissante avec distanceKm', async () => {
    const communeId = await seedCommune()
    // 3 distributeurs autour de Paris Châtelet (48.8581, 2.3470)
    const farId    = await seedDistributor({ communeId, name: 'Far',    latitude: 48.8800, longitude: 2.3700 }) // ~3km
    const middleId = await seedDistributor({ communeId, name: 'Middle', latitude: 48.8676, longitude: 2.3631 }) // ~1.5km
    const nearId   = await seedDistributor({ communeId, name: 'Near',   latitude: 48.8595, longitude: 2.3480 }) // ~150m

    const res = await app.inject({
      method: 'GET',
      url: '/v1/distributors/nearby?lat=48.8581&lng=2.3470&radius_km=5',
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.items).toHaveLength(3)
    expect(body.items.map((d: { id: string }) => d.id)).toEqual([nearId, middleId, farId])

    // distanceKm croissant + Near < 1 km
    const distances = body.items.map((d: { distanceKm: number }) => d.distanceKm)
    expect(distances[0]).toBeLessThan(1)
    expect(distances[0]).toBeLessThan(distances[1])
    expect(distances[1]).toBeLessThan(distances[2])
  })

  it("exclut les distributeurs au-delà de radius_km", async () => {
    const communeId = await seedCommune()
    const inId  = await seedDistributor({ communeId, name: 'In',  latitude: 48.8595, longitude: 2.3480 })
    /* eslint-disable @typescript-eslint/no-unused-vars */
    const _outId = await seedDistributor({ communeId, name: 'Out', latitude: 48.8800, longitude: 2.3700 }) // ~3km
    /* eslint-enable */

    const res = await app.inject({
      method: 'GET',
      url: '/v1/distributors/nearby?lat=48.8581&lng=2.3470&radius_km=1',
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.items).toHaveLength(1)
    expect(body.items[0].id).toBe(inId)
  })

  it("exclut les distributeurs sans coordonnées (lat/lng NULL)", async () => {
    const communeId = await seedCommune()
    await seedDistributor({ communeId, name: 'Sans coords', latitude: null, longitude: null })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/distributors/nearby?lat=48.8566&lng=2.3522&radius_km=50',
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().items).toEqual([])
  })

  it('renvoie 400 quand lat est hors borne ou query incomplète', async () => {
    const tooHigh = await app.inject({
      method: 'GET',
      url: '/v1/distributors/nearby?lat=120&lng=2.35&radius_km=5',
    })
    expect(tooHigh.statusCode).toBe(400)

    const missing = await app.inject({
      method: 'GET',
      url: '/v1/distributors/nearby?lng=2.35',
    })
    expect(missing.statusCode).toBe(400)
  })
})

describe('POST /v1/distributors', () => {
  it('crée le distributeur ET ses N lockers idle (201, admin)', async () => {
    const communeId = await seedCommune()
    const adminId = await seedUser('super_admin')

    const res = await app.inject({
      method: 'POST',
      url: '/v1/distributors',
      headers: { authorization: authHeader(adminId, 'super_admin') },
      payload: {
        serialNumber: 'SL-NEW-001',
        communeId,
        name: 'Nouveau distributeur',
        latitude: 48.85,
        longitude: 2.34,
        lockerCount: 6,
      },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.serialNumber).toBe('SL-NEW-001')
    expect(body.communeId).toBe(communeId)
    expect(body.lockerCount).toBe(6)
    expect(body.idleLockers).toBe(6)

    const lockerRows = await pgSql`SELECT position, state FROM lockers
      WHERE distributor_id = ${body.id} ORDER BY position`
    expect(lockerRows).toHaveLength(6)
    expect(lockerRows.map((l) => l.position)).toEqual([0, 1, 2, 3, 4, 5])
    expect(lockerRows.every((l) => l.state === 'idle')).toBe(true)
  })

  it('renvoie 401 sans token de session', async () => {
    const communeId = await seedCommune()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/distributors',
      payload: { serialNumber: 'SL-X-001', communeId, name: 'X', lockerCount: 4 },
    })
    expect(res.statusCode).toBe(401)
  })

  it("renvoie 403 forbidden_admin_required quand le user n'est pas admin", async () => {
    const communeId = await seedCommune()
    const citizenId = await seedUser('citizen')
    const res = await app.inject({
      method: 'POST',
      url: '/v1/distributors',
      headers: { authorization: authHeader(citizenId, 'citizen') },
      payload: { serialNumber: 'SL-X-002', communeId, name: 'X', lockerCount: 4 },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('forbidden_admin_required')
  })

  it('renvoie 409 serial_number_conflict quand le serial existe déjà', async () => {
    const communeId = await seedCommune()
    const adminId = await seedUser('super_admin')
    await seedDistributor({ communeId, name: 'Existing' })
    // On force un serial en collision en réinsérant via le seed helper
    await pgSql`INSERT INTO distributors (serial_number, commune_id, name, locker_count)
      VALUES ('DUPLICATE-001', ${communeId}, 'Existing dup', 4)`

    const res = await app.inject({
      method: 'POST',
      url: '/v1/distributors',
      headers: { authorization: authHeader(adminId, 'super_admin') },
      payload: {
        serialNumber: 'DUPLICATE-001', communeId, name: 'Tentative', lockerCount: 4,
      },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('serial_number_conflict')
  })

  it("renvoie 404 commune_not_found quand commune_id ne référence rien", async () => {
    const adminId = await seedUser('super_admin')
    const ghostCommune = randomUUID()

    const res = await app.inject({
      method: 'POST',
      url: '/v1/distributors',
      headers: { authorization: authHeader(adminId, 'super_admin') },
      payload: {
        serialNumber: 'SL-ORPHAN-001', communeId: ghostCommune, name: 'Orphan', lockerCount: 4,
      },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('commune_not_found')
  })

  it('renvoie 400 quand le body Zod est invalide (lockerCount=0)', async () => {
    const communeId = await seedCommune()
    const adminId = await seedUser('super_admin')
    const res = await app.inject({
      method: 'POST',
      url: '/v1/distributors',
      headers: { authorization: authHeader(adminId, 'super_admin') },
      payload: { serialNumber: 'SL-X-003', communeId, name: 'X', lockerCount: 0 },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('PUT /v1/distributors/:id', () => {
  it('met à jour name + status + lat/lng et renvoie 200 (admin)', async () => {
    const communeId = await seedCommune()
    const adminId = await seedUser('super_admin')
    const distributorId = await seedDistributor({ communeId, name: 'Avant', status: 'offline' })
    await seedLocker(distributorId, 0, 'idle')

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/distributors/${distributorId}`,
      headers: { authorization: authHeader(adminId, 'super_admin') },
      payload: { name: 'Après', status: 'maintenance', latitude: 50, longitude: 3 },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.name).toBe('Après')
    expect(body.status).toBe('maintenance')
    expect(body.latitude).toBe(50)
    expect(body.longitude).toBe(3)
    expect(body.idleLockers).toBe(1)

    const rows = await pgSql`SELECT name, status FROM distributors WHERE id = ${distributorId}`
    expect(rows[0]!.name).toBe('Après')
    expect(rows[0]!.status).toBe('maintenance')
  })

  it('renvoie 401 sans token', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/v1/distributors/${randomUUID()}`, payload: { name: 'X' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('renvoie 403 quand le user est citizen', async () => {
    const communeId = await seedCommune()
    const citizenId = await seedUser('citizen')
    const distributorId = await seedDistributor({ communeId })

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/distributors/${distributorId}`,
      headers: { authorization: authHeader(citizenId, 'citizen') },
      payload: { name: 'X' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('forbidden_admin_required')
  })

  it("renvoie 404 quand le distributeur n'existe pas", async () => {
    const adminId = await seedUser('super_admin')
    const res = await app.inject({
      method: 'PUT',
      url: `/v1/distributors/${randomUUID()}`,
      headers: { authorization: authHeader(adminId, 'super_admin') },
      payload: { name: 'Ghost' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('distributor_not_found')
  })

  it("renvoie 400 quand le body est vide (refine at_least_one_field_required)", async () => {
    const communeId = await seedCommune()
    const adminId = await seedUser('super_admin')
    const distributorId = await seedDistributor({ communeId })

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/distributors/${distributorId}`,
      headers: { authorization: authHeader(adminId, 'super_admin') },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('Multi-tenant isolation (admin commune-scoped)', () => {
  it('admin commune A peut créer un distributeur dans SA commune (201)', async () => {
    const communeA = await seedCommune()
    const adminA = await seedUser('admin', communeA)

    const res = await app.inject({
      method: 'POST',
      url: '/v1/distributors',
      headers: { authorization: authHeader(adminA, 'admin', communeA) },
      payload: {
        serialNumber: 'SL-MT-A1',
        communeId: communeA,
        name: 'Dist A1',
        lockerCount: 4,
      },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().communeId).toBe(communeA)
  })

  it('admin commune A reçoit 403 forbidden_cross_commune en créant dans la commune B', async () => {
    const communeA = await seedCommune()
    const communeB = await seedCommune()
    const adminA = await seedUser('admin', communeA)

    const res = await app.inject({
      method: 'POST',
      url: '/v1/distributors',
      headers: { authorization: authHeader(adminA, 'admin', communeA) },
      payload: {
        serialNumber: 'SL-MT-B1',
        communeId: communeB,
        name: 'Tentative cross-commune',
        lockerCount: 4,
      },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('forbidden_cross_commune')
  })

  it('admin sans communeId dans son JWT reçoit 403 forbidden_admin_missing_commune', async () => {
    const communeA = await seedCommune()
    const orphanAdmin = await seedUser('admin') // pas de commune_id

    const res = await app.inject({
      method: 'POST',
      url: '/v1/distributors',
      headers: { authorization: authHeader(orphanAdmin, 'admin') }, // pas de communeId
      payload: {
        serialNumber: 'SL-MT-ORPHAN',
        communeId: communeA,
        name: 'Orphan',
        lockerCount: 4,
      },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('forbidden_admin_missing_commune')
  })

  it('admin commune A peut PUT un distributeur de SA commune (200)', async () => {
    const communeA = await seedCommune()
    const adminA = await seedUser('admin', communeA)
    const distA = await seedDistributor({ communeId: communeA, name: 'Avant' })

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/distributors/${distA}`,
      headers: { authorization: authHeader(adminA, 'admin', communeA) },
      payload: { name: 'Après' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('Après')
  })

  it('admin commune A reçoit 404 en PUT un distributeur de commune B (isolation)', async () => {
    const communeA = await seedCommune()
    const communeB = await seedCommune()
    const adminA = await seedUser('admin', communeA)
    const distB = await seedDistributor({ communeId: communeB, name: 'B-dist' })

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/distributors/${distB}`,
      headers: { authorization: authHeader(adminA, 'admin', communeA) },
      payload: { name: 'Tentative cross' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('distributor_not_found')

    // Vérifie qu'aucune modification n'a fuité côté commune B
    const rows = await pgSql`SELECT name FROM distributors WHERE id = ${distB}`
    expect(rows[0]!.name).toBe('B-dist')
  })
})
