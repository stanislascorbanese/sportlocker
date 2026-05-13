/**
 * Tests d'intégration GET /v1/item-types.
 * Stack identique à reservations.test.ts (testcontainers + app.inject).
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

interface ItemTypeSeed {
  slug: string
  name: string
  category: string
  description?: string | null
  imageUrl?: string | null
  cautionCents?: number
  maxDurationMinutes?: number
}

async function seedItemType(t: ItemTypeSeed): Promise<string> {
  const id = randomUUID()
  await pgSql`INSERT INTO item_types
    (id, slug, name, category, description, image_url, caution_cents, max_duration_minutes)
    VALUES (${id}, ${t.slug}, ${t.name}, ${t.category},
            ${t.description ?? null}, ${t.imageUrl ?? null},
            ${t.cautionCents ?? 0}, ${t.maxDurationMinutes ?? 240})`
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
    maintenance_tickets, push_tokens, notification_logs, reviews
    RESTART IDENTITY CASCADE`
  await redisClient.flushdb()
})

describe('GET /v1/item-types/', () => {
  it('renvoie une liste vide quand aucun item_type en base', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/item-types/' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ items: [], total: 0, limit: 50, offset: 0 })
  })

  it('renvoie le catalogue trié par nom avec tous les champs', async () => {
    await seedItemType({
      slug: 'ballon-foot', name: 'Ballon de foot', category: 'ballon',
      description: 'Cuir, taille 5', imageUrl: 'https://cdn/foot.jpg',
      cautionCents: 2000, maxDurationMinutes: 180,
    })
    await seedItemType({ slug: 'frisbee', name: 'Frisbee', category: 'autre' })
    await seedItemType({ slug: 'raquette', name: 'Raquette de tennis', category: 'raquette' })

    const res = await app.inject({ method: 'GET', url: '/v1/item-types/' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.total).toBe(3)
    expect(body.items).toHaveLength(3)

    // Tri alphabétique par name
    expect(body.items.map((t: { name: string }) => t.name)).toEqual([
      'Ballon de foot', 'Frisbee', 'Raquette de tennis',
    ])

    const foot = body.items[0]
    expect(foot.slug).toBe('ballon-foot')
    expect(foot.category).toBe('ballon')
    expect(foot.description).toBe('Cuir, taille 5')
    expect(foot.imageUrl).toBe('https://cdn/foot.jpg')
    expect(foot.cautionCents).toBe(2000)
    expect(foot.maxDurationMinutes).toBe(180)

    // Champs nullables défaut
    const frisbee = body.items[1]
    expect(frisbee.description).toBeNull()
    expect(frisbee.imageUrl).toBeNull()
    expect(frisbee.cautionCents).toBe(0)
    expect(frisbee.maxDurationMinutes).toBe(240)
  })

  it('respecte limit et offset, total reste le nombre global', async () => {
    for (let i = 0; i < 5; i++) {
      await seedItemType({ slug: `slug-${i}`, name: `Item ${i}`, category: 'test' })
    }

    const res = await app.inject({ method: 'GET', url: '/v1/item-types/?limit=2&offset=1' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.total).toBe(5)
    expect(body.limit).toBe(2)
    expect(body.offset).toBe(1)
    expect(body.items).toHaveLength(2)
    expect(body.items.map((t: { name: string }) => t.name)).toEqual(['Item 1', 'Item 2'])
  })

  it('renvoie 400 quand limit dépasse 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/item-types/?limit=999' })
    expect(res.statusCode).toBe(400)
  })

  it('renvoie 400 quand offset est négatif', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/item-types/?offset=-1' })
    expect(res.statusCode).toBe(400)
  })
})
