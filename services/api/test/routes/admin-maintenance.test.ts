/**
 * Tests d'intégration multi-tenant /v1/admin/maintenance-tickets.
 *
 * Périmètre :
 *   - GET /        : filtres status + distributorId, tri severity DESC puis createdAt DESC,
 *                    scope commune pour admin, super_admin voit tout
 *   - PATCH /:id   : transitions status (resolved → resolvedAt=NOW, open → resolvedAt=NULL),
 *                    assignedTo → assignee dans le DTO, anti-leak cross-commune
 *
 * Stack identique aux autres tests (testcontainers, app.inject, TRUNCATE).
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

type Role = 'citizen' | 'operator' | 'admin' | 'super_admin'
type MaintStatus = 'open' | 'in_progress' | 'resolved' | 'wontfix'

interface CommuneSeed {
  id: string
  distributorId: string
}

async function seedCommune(name: string): Promise<CommuneSeed> {
  const id = randomUUID()
  const distributorId = randomUUID()
  const insee = String(70000 + Math.floor(Math.random() * 9999))

  await pgSql`INSERT INTO communes (id, insee_code, name, postal_code, department, region)
    VALUES (${id}, ${insee}, ${name}, '75001', '75', 'IDF')`
  await pgSql`INSERT INTO distributors (id, serial_number, commune_id, name, locker_count)
    VALUES (${distributorId}, ${'SN-' + distributorId.slice(0, 8)}, ${id}, ${name + ' Dist'}, 1)`
  return { id, distributorId }
}

async function seedUser(opts: {
  role?: Role
  email?: string
  firebaseUid?: string
  communeId?: string
  displayName?: string | null
}): Promise<{ id: string; email: string }> {
  const id = randomUUID()
  const firebaseUid = opts.firebaseUid ?? 'fb-' + id.slice(0, 8)
  const email = opts.email ?? id.slice(0, 8) + '@test.local'
  const role: Role = opts.role ?? 'citizen'
  await pgSql`INSERT INTO users (id, firebase_uid, email, role, display_name, commune_id)
    VALUES (${id}, ${firebaseUid}, ${email}, ${role},
            ${opts.displayName ?? null}, ${opts.communeId ?? null})`
  return { id, email }
}

interface TicketOpts {
  distributorId: string
  status?: MaintStatus
  severity?: number
  title?: string
  createdAt?: Date
  resolvedAt?: Date | null
  assignedTo?: string | null
}

async function seedTicket(opts: TicketOpts): Promise<string> {
  const id = randomUUID()
  const status = opts.status ?? 'open'
  const severity = opts.severity ?? 3
  const title = opts.title ?? 'Ticket ' + id.slice(0, 4)
  const createdAt = opts.createdAt ?? new Date()

  await pgSql`
    INSERT INTO maintenance_tickets
      (id, distributor_id, status, severity, title, description, assigned_to,
       resolved_at, created_at, updated_at)
    VALUES
      (${id}, ${opts.distributorId}, ${status}, ${severity}, ${title}, 'desc',
       ${opts.assignedTo ?? null},
       ${opts.resolvedAt ? opts.resolvedAt.toISOString() : null},
       ${createdAt.toISOString()}, ${createdAt.toISOString()})`
  return id
}

function authHeader(userId: string, role: Role, communeId?: string): string {
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

// ─── GET /v1/admin/maintenance-tickets ──────────────────────────────────────

describe('GET /v1/admin/maintenance-tickets', () => {
  it('super_admin → voit tous les tickets, tri severity DESC puis createdAt DESC', async () => {
    const c = await seedCommune('TriCommune')
    const su = await seedUser({ role: 'super_admin' })

    // severity 5 (max), créé en premier
    const high = await seedTicket({
      distributorId: c.distributorId, severity: 5, title: 'Critical',
      createdAt: new Date('2026-05-01T10:00:00Z'),
    })
    // severity 3, créé plus tard → mais sera après "high" car severity moindre
    const mid = await seedTicket({
      distributorId: c.distributorId, severity: 3, title: 'Mid',
      createdAt: new Date('2026-05-10T10:00:00Z'),
    })
    // severity 3 aussi, créé encore plus tard → arrive avant 'mid' car createdAt DESC tiebreaker
    const midRecent = await seedTicket({
      distributorId: c.distributorId, severity: 3, title: 'MidRecent',
      createdAt: new Date('2026-05-15T10:00:00Z'),
    })
    // severity 1, ancien
    const low = await seedTicket({
      distributorId: c.distributorId, severity: 1, title: 'Low',
      createdAt: new Date('2026-05-05T10:00:00Z'),
    })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/maintenance-tickets/',
      headers: { authorization: authHeader(su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const items = (res.json() as { items: { id: string; severity: number }[] }).items
    expect(items.map((t) => t.id)).toEqual([high, midRecent, mid, low])
  })

  it('admin scoped → ne voit que les tickets des distributeurs de sa commune', async () => {
    const communeA = await seedCommune('A')
    const communeB = await seedCommune('B')
    const adminA = await seedUser({ role: 'admin', communeId: communeA.id })

    const tA = await seedTicket({ distributorId: communeA.distributorId, severity: 3 })
    await seedTicket({ distributorId: communeB.distributorId, severity: 4 })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/maintenance-tickets/',
      headers: { authorization: authHeader(adminA.id, 'admin', communeA.id) },
    })
    expect(res.statusCode).toBe(200)
    const items = (res.json() as { items: { id: string }[] }).items
    expect(items).toHaveLength(1)
    expect(items[0]!.id).toBe(tA)
  })

  it('filtre status', async () => {
    const c = await seedCommune('Status')
    const su = await seedUser({ role: 'super_admin' })
    const openId = await seedTicket({ distributorId: c.distributorId, status: 'open' })
    await seedTicket({ distributorId: c.distributorId, status: 'resolved', resolvedAt: new Date() })
    await seedTicket({ distributorId: c.distributorId, status: 'wontfix' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/maintenance-tickets/?status=open',
      headers: { authorization: authHeader(su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const items = (res.json() as { items: { id: string; status: string }[] }).items
    expect(items).toHaveLength(1)
    expect(items[0]!.id).toBe(openId)
    expect(items[0]!.status).toBe('open')
  })

  it('filtre distributorId', async () => {
    const c1 = await seedCommune('D1')
    const c2 = await seedCommune('D2')
    const su = await seedUser({ role: 'super_admin' })
    const t1 = await seedTicket({ distributorId: c1.distributorId })
    await seedTicket({ distributorId: c2.distributorId })

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/maintenance-tickets/?distributorId=${c1.distributorId}`,
      headers: { authorization: authHeader(su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const items = (res.json() as { items: { id: string }[] }).items
    expect(items).toHaveLength(1)
    expect(items[0]!.id).toBe(t1)
  })

  it('citizen → 403 forbidden_admin_required', async () => {
    const u = await seedUser({ role: 'citizen' })
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/maintenance-tickets/',
      headers: { authorization: authHeader(u.id, 'citizen') },
    })
    expect(res.statusCode).toBe(403)
    expect((res.json() as { error: string }).error).toBe('forbidden_admin_required')
  })

  it('admin sans communeId → 403 forbidden_admin_missing_commune', async () => {
    const u = await seedUser({ role: 'admin' })
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/maintenance-tickets/',
      headers: { authorization: authHeader(u.id, 'admin') },
    })
    expect(res.statusCode).toBe(403)
    expect((res.json() as { error: string }).error).toBe('forbidden_admin_missing_commune')
  })
})

// ─── PATCH /v1/admin/maintenance-tickets/:id ────────────────────────────────

describe('PATCH /v1/admin/maintenance-tickets/:id', () => {
  it('status: "resolved" → resolvedAt = NOW()', async () => {
    const c = await seedCommune('PatchResolved')
    const su = await seedUser({ role: 'super_admin' })
    const ticketId = await seedTicket({ distributorId: c.distributorId, status: 'open' })

    const before = Date.now()
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/maintenance-tickets/${ticketId}`,
      headers: { authorization: authHeader(su.id, 'super_admin') },
      payload: { status: 'resolved', resolutionNote: 'fixed onsite' },
    })
    const after = Date.now()
    expect(res.statusCode).toBe(200)
    const body = res.json() as { status: string; resolvedAt: string | null; resolutionNote: string | null }
    expect(body.status).toBe('resolved')
    expect(body.resolutionNote).toBe('fixed onsite')
    expect(body.resolvedAt).not.toBeNull()
    const resolvedTs = new Date(body.resolvedAt!).getTime()
    // resolvedAt approximativement NOW (avec un peu de marge)
    expect(resolvedTs).toBeGreaterThanOrEqual(before - 1_000)
    expect(resolvedTs).toBeLessThanOrEqual(after + 1_000)

    // DB
    const rows = await pgSql<{ status: string; resolved_at: string | null }[]>`
      SELECT status, resolved_at FROM maintenance_tickets WHERE id = ${ticketId}`
    expect(rows[0]!.status).toBe('resolved')
    expect(rows[0]!.resolved_at).not.toBeNull()
  })

  it('status: "open" (depuis resolved) → resolvedAt = NULL', async () => {
    const c = await seedCommune('PatchReopen')
    const su = await seedUser({ role: 'super_admin' })
    const ticketId = await seedTicket({
      distributorId: c.distributorId, status: 'resolved',
      resolvedAt: new Date('2026-05-01T10:00:00Z'),
    })

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/maintenance-tickets/${ticketId}`,
      headers: { authorization: authHeader(su.id, 'super_admin') },
      payload: { status: 'open' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { status: string; resolvedAt: string | null }
    expect(body.status).toBe('open')
    expect(body.resolvedAt).toBeNull()

    const rows = await pgSql<{ resolved_at: string | null }[]>`
      SELECT resolved_at FROM maintenance_tickets WHERE id = ${ticketId}`
    expect(rows[0]!.resolved_at).toBeNull()
  })

  it('status: "wontfix" → resolvedAt = NULL (pas considéré comme résolu)', async () => {
    // Note : le module met resolvedAt à NULL pour tout status ≠ 'resolved'.
    // On vérifie ici la cohérence du comportement documenté.
    const c = await seedCommune('PatchWontfix')
    const su = await seedUser({ role: 'super_admin' })
    const ticketId = await seedTicket({
      distributorId: c.distributorId, status: 'resolved',
      resolvedAt: new Date('2026-05-01T10:00:00Z'),
    })

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/maintenance-tickets/${ticketId}`,
      headers: { authorization: authHeader(su.id, 'super_admin') },
      payload: { status: 'wontfix' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { status: string; resolvedAt: string | null }
    expect(body.status).toBe('wontfix')
    expect(body.resolvedAt).toBeNull()
  })

  it('assignedTo: uuid d\'un user → assignee dans le DTO retourné', async () => {
    const c = await seedCommune('PatchAssign')
    const su = await seedUser({ role: 'super_admin' })
    const assignee = await seedUser({
      role: 'admin', communeId: c.id,
      email: 'mechanic@test.local',
      displayName: 'Mechanic Bob',
    })
    const ticketId = await seedTicket({ distributorId: c.distributorId, status: 'open' })

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/maintenance-tickets/${ticketId}`,
      headers: { authorization: authHeader(su.id, 'super_admin') },
      payload: { assignedTo: assignee.id },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      assignee: { id: string; email: string; displayName: string | null } | null
    }
    expect(body.assignee).not.toBeNull()
    expect(body.assignee!.id).toBe(assignee.id)
    expect(body.assignee!.email).toBe('mechanic@test.local')
    expect(body.assignee!.displayName).toBe('Mechanic Bob')
  })

  it('assignedTo: null (désassignation) → assignee=null', async () => {
    const c = await seedCommune('PatchUnassign')
    const su = await seedUser({ role: 'super_admin' })
    const assignee = await seedUser({ role: 'admin', communeId: c.id, email: 'someone@test.local' })
    const ticketId = await seedTicket({
      distributorId: c.distributorId, status: 'in_progress', assignedTo: assignee.id,
    })

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/maintenance-tickets/${ticketId}`,
      headers: { authorization: authHeader(su.id, 'super_admin') },
      payload: { assignedTo: null },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { assignee: unknown | null }
    expect(body.assignee).toBeNull()
  })

  it('PATCH severity', async () => {
    const c = await seedCommune('PatchSeverity')
    const su = await seedUser({ role: 'super_admin' })
    const ticketId = await seedTicket({ distributorId: c.distributorId, severity: 3 })

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/maintenance-tickets/${ticketId}`,
      headers: { authorization: authHeader(su.id, 'super_admin') },
      payload: { severity: 5 },
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { severity: number }).severity).toBe(5)
  })

  it('admin scoped sur ticket d\'une autre commune → 404 (anti-leak)', async () => {
    const communeA = await seedCommune('A')
    const communeB = await seedCommune('B')
    const adminA = await seedUser({ role: 'admin', communeId: communeA.id })
    const tB = await seedTicket({ distributorId: communeB.distributorId, status: 'open' })

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/maintenance-tickets/${tB}`,
      headers: { authorization: authHeader(adminA.id, 'admin', communeA.id) },
      payload: { status: 'resolved' },
    })
    expect(res.statusCode).toBe(404)
    expect((res.json() as { error: string }).error).toBe('ticket_not_found')

    // Le ticket ne doit pas avoir bougé
    const rows = await pgSql<{ status: string }[]>`
      SELECT status FROM maintenance_tickets WHERE id = ${tB}`
    expect(rows[0]!.status).toBe('open')
  })

  it('ticket inexistant → 404 ticket_not_found', async () => {
    const su = await seedUser({ role: 'super_admin' })
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/maintenance-tickets/${randomUUID()}`,
      headers: { authorization: authHeader(su.id, 'super_admin') },
      payload: { status: 'resolved' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('body vide → 400 (Zod refine at_least_one_field_required)', async () => {
    const c = await seedCommune('EmptyBody')
    const su = await seedUser({ role: 'super_admin' })
    const ticketId = await seedTicket({ distributorId: c.distributorId })

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/maintenance-tickets/${ticketId}`,
      headers: { authorization: authHeader(su.id, 'super_admin') },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })

  it('severity hors range (>5) → 400', async () => {
    const c = await seedCommune('BadSeverity')
    const su = await seedUser({ role: 'super_admin' })
    const ticketId = await seedTicket({ distributorId: c.distributorId })

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/maintenance-tickets/${ticketId}`,
      headers: { authorization: authHeader(su.id, 'super_admin') },
      payload: { severity: 99 },
    })
    expect(res.statusCode).toBe(400)
  })
})
