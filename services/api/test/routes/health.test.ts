/**
 * Tests d'intégration GET /health/ et GET /health/ready.
 *
 * Même stack que reservations.test.ts : Postgres + Redis via testcontainers,
 * app.inject() (pas de port bindé), TRUNCATE + flushdb entre tests.
 *
 * Pour couvrir le path 503 de /health/ready, on spy sur les singletons db et
 * redis (mockRejectedValueOnce / mockResolvedValueOnce) sans toucher aux
 * conteneurs réels.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { GenericContainer, type StartedTestContainer } from 'testcontainers'
import postgres from 'postgres'
import IORedis from 'ioredis'
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

describe('GET /health/', () => {
  it('renvoie 200 avec { status: "ok", uptime: number }', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/' })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('ok')
    expect(typeof body.uptime).toBe('number')
    expect(body.uptime).toBeGreaterThan(0)
  })
})

describe('GET /health/ready', () => {
  it('renvoie 200 { status: "ready" } quand DB et Redis répondent', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/ready' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ready' })
  })

  it('renvoie 503 { status: "not_ready" } quand Redis ne répond pas PONG', async () => {
    const { redis } = await import('../../src/redis/client.js')
    const spy = vi.spyOn(redis, 'ping').mockResolvedValueOnce('NOTPONG' as 'PONG')

    const res = await app.inject({ method: 'GET', url: '/health/ready' })

    expect(res.statusCode).toBe(503)
    expect(res.json()).toEqual({ status: 'not_ready' })
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('renvoie 503 { status: "not_ready" } quand la requête DB échoue', async () => {
    const { db } = await import('../../src/db/client.js')
    const spy = vi.spyOn(db, 'execute').mockRejectedValueOnce(new Error('db_unreachable'))

    const res = await app.inject({ method: 'GET', url: '/health/ready' })

    expect(res.statusCode).toBe(503)
    expect(res.json()).toEqual({ status: 'not_ready' })
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })
})
