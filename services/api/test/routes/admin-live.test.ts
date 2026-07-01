/**
 * Tests d'intégration admin-live :
 *   - POST /v1/admin/live/ticket — échange Bearer → ticket court
 *   - GET  /v1/admin/live        — WebSocket scopé commune
 *
 * Stack : testcontainers (Postgres + Redis), app.listen port 0, client ws.
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
import WebSocket from 'ws'

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
let serverPort: number

type Role = 'citizen' | 'operator' | 'admin' | 'super_admin'

async function seedCommune(name = 'Lyon Test'): Promise<string> {
  const id = randomUUID()
  const insee = String(60000 + Math.floor(Math.random() * 9999))
  await pgSql`INSERT INTO communes (id, insee_code, name, postal_code, department, region)
    VALUES (${id}, ${insee}, ${name}, '69001', '69', 'ARA')`
  return id
}

async function seedUser(opts: { role?: Role; communeId?: string }): Promise<string> {
  const id = randomUUID()
  const firebaseUid = 'fb-' + id.slice(0, 8)
  const email = id.slice(0, 8) + '@test.local'
  await pgSql`INSERT INTO users (id, firebase_uid, email, role, commune_id)
    VALUES (${id}, ${firebaseUid}, ${email}, ${opts.role ?? 'citizen'}, ${opts.communeId ?? null})`
  return id
}

function authHeader(userId: string, role: Role, communeId?: string): string {
  const token = app.jwt.sign({ sub: userId, role, ...(communeId ? { communeId } : {}) })
  return `Bearer ${token}`
}

function wsUrl(path = '', port = serverPort): string {
  return `ws://127.0.0.1:${port}/v1/admin/live${path}`
}

function connectWs(url: string, origin?: string): Promise<{ ws: WebSocket; closeCode: number | null }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url, { origin })
    let closeCode: number | null = null
    ws.on('close', (code) => { closeCode = code; resolve({ ws, closeCode }) })
    ws.on('error', () => resolve({ ws, closeCode }))
    // Timeout safety — résout si jamais aucun close n'arrive
    setTimeout(() => resolve({ ws, closeCode }), 2000)
  })
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
  process.env.DASHBOARD_INVITE_BASE_URL = 'https://ops.sportlocker.fr'
  process.env.CORS_ALLOWED_ORIGINS = 'https://ops.sportlocker.fr'
  process.env.LOG_LEVEL = 'fatal'

  pgSql = postgres(process.env.DATABASE_URL!, { onnotice: () => {} })
  await pgSql.unsafe(readFileSync(SCHEMA_PATH, 'utf-8'))
  await pgSql.unsafe(readFileSync(MIGRATION_PATH, 'utf-8'))

  redisClient = new IORedis(process.env.REDIS_URL!)

  const { buildApp } = await import('../../src/app.js')
  app = await buildApp()
  // On écoute sur un port aléatoire pour les tests WebSocket
  await app.listen({ port: 0, host: '127.0.0.1' })
  const addr = app.server.address()
  serverPort = typeof addr === 'object' && addr ? addr.port : 0
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
  await redisClient?.quit()
  await pgSql?.end()
  await redisContainer?.stop()
  await pgContainer?.stop()
}, 120_000)

beforeEach(async () => {
  await pgSql`TRUNCATE TABLE users, communes RESTART IDENTITY CASCADE`
  await redisClient.flushall()
})

// ─── POST /v1/admin/live/ticket ─────────────────────────────────────────────

describe('POST /v1/admin/live/ticket', () => {
  it('retourne ticket + ttlSeconds pour un admin scopé commune', async () => {
    const communeId = await seedCommune()
    const userId = await seedUser({ role: 'admin', communeId })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/live/ticket',
      headers: { authorization: authHeader(userId, 'admin', communeId) },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(typeof body.ticket).toBe('string')
    expect(body.ticket.length).toBeGreaterThan(10)
    expect(body.ttlSeconds).toBe(30)
  })

  it('retourne ticket pour un super_admin (communeId null)', async () => {
    const userId = await seedUser({ role: 'super_admin' })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/live/ticket',
      headers: { authorization: authHeader(userId, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    expect(typeof res.json().ticket).toBe('string')
  })

  it('rejette un citizen (403)', async () => {
    const userId = await seedUser({ role: 'citizen' })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/live/ticket',
      headers: { authorization: authHeader(userId, 'citizen') },
    })
    expect(res.statusCode).toBe(403)
  })

  it('rejette sans token (401)', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/admin/live/ticket' })
    expect(res.statusCode).toBe(401)
  })

  it('accepte un operator (legacy traité comme admin)', async () => {
    const communeId = await seedCommune()
    const userId = await seedUser({ role: 'operator', communeId })
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/live/ticket',
      headers: { authorization: authHeader(userId, 'operator', communeId) },
    })
    expect(res.statusCode).toBe(200)
    expect(typeof res.json().ticket).toBe('string')
  })
})

// ─── GET /v1/admin/live (WebSocket) ─────────────────────────────────────────

describe('GET /v1/admin/live (WebSocket)', () => {
  it('ferme 4401 si pas de ticket', async () => {
    const { closeCode } = await connectWs(wsUrl())
    expect(closeCode).toBe(4401)
  })

  it('ferme 4401 si ticket invalide', async () => {
    const { closeCode } = await connectWs(wsUrl('?ticket=invalid'))
    expect(closeCode).toBe(4401)
  })

  it('ferme 4401 si query mal formée (pas de ticket param)', async () => {
    // distributorId seul sans ticket → parse fail → 4401
    const { closeCode } = await connectWs(wsUrl(`?distributorId=${randomUUID()}`))
    expect(closeCode).toBe(4401)
  })

  it('accepte une connexion avec ticket valide (origin whitelist)', async () => {
    const communeId = await seedCommune()
    const userId = await seedUser({ role: 'admin', communeId })
    const ticketRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/live/ticket',
      headers: { authorization: authHeader(userId, 'admin', communeId) },
    })
    const { ticket } = ticketRes.json()

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl(`?ticket=${ticket}`), {
        origin: 'https://ops.sportlocker.fr',
      })
      const timeout = setTimeout(() => { ws.close(); reject(new Error('timeout')) }, 3000)
      ws.on('open', () => {
        clearTimeout(timeout)
        ws.close(1000)
        resolve()
      })
      ws.on('error', (err) => { clearTimeout(timeout); reject(err) })
    })
  })

  it('un ticket est mono-usage (2e connexion → 4401)', async () => {
    const userId = await seedUser({ role: 'super_admin' })
    const ticketRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/live/ticket',
      headers: { authorization: authHeader(userId, 'super_admin') },
    })
    const { ticket } = ticketRes.json()

    // 1re connexion : succès
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl(`?ticket=${ticket}`))
      const t = setTimeout(() => { ws.close(); reject(new Error('timeout')) }, 3000)
      ws.on('open', () => { clearTimeout(t); ws.close(1000); resolve() })
      ws.on('error', reject)
    })

    // 2e connexion avec le même ticket : 4401
    const { closeCode } = await connectWs(wsUrl(`?ticket=${ticket}`))
    expect(closeCode).toBe(4401)
  })

  it('accepte distributorId optionnel dans la query', async () => {
    const communeId = await seedCommune()
    const userId = await seedUser({ role: 'admin', communeId })
    const ticketRes = await app.inject({
      method: 'POST',
      url: '/v1/admin/live/ticket',
      headers: { authorization: authHeader(userId, 'admin', communeId) },
    })
    const { ticket } = ticketRes.json()
    const distId = randomUUID()

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl(`?ticket=${ticket}&distributorId=${distId}`), {
        origin: 'https://ops.sportlocker.fr',
      })
      const t = setTimeout(() => { ws.close(); reject(new Error('timeout')) }, 3000)
      ws.on('open', () => { clearTimeout(t); ws.close(1000); resolve() })
      ws.on('error', reject)
    })
  })
})
