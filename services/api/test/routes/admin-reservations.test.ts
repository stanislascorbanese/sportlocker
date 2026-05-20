/**
 * Tests d'intégration multi-tenant /v1/admin/reservations.
 *
 * Périmètre :
 *   - GET /              : liste paginée + filtres status/distributorId/from/to + cursor + scope commune
 *   - GET /:id           : détail + timeline events ASC + 404 cross-commune (anti-leak)
 *   - POST /:id/force-cancel : transition active → cancelled, libère le locker, ajoute locker_event
 *   - GET /export.csv    : Content-Type, BOM UTF-8, header 14 colonnes, CRLF, respect filtres
 *
 * Stack identique aux autres tests (testcontainers Postgres + Redis, app.inject, TRUNCATE).
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

interface CommuneSeed {
  id: string
  distributorId: string
  itemTypeId: string
  itemId: string
  lockerId: string
}

/** Seed une commune complète (commune + distributor + item_type + item + locker idle). */
async function seedCommuneFull(name: string): Promise<CommuneSeed> {
  const id = randomUUID()
  const distributorId = randomUUID()
  const itemTypeId = randomUUID()
  const itemId = randomUUID()
  const lockerId = randomUUID()
  const insee = String(70000 + Math.floor(Math.random() * 9999))

  await pgSql`INSERT INTO communes (id, insee_code, name, postal_code, department, region)
    VALUES (${id}, ${insee}, ${name}, '75001', '75', 'IDF')`
  await pgSql`INSERT INTO distributors (id, serial_number, commune_id, name, locker_count)
    VALUES (${distributorId}, ${'SN-' + distributorId.slice(0, 8)}, ${id}, ${name + ' Dist'}, 1)`
  await pgSql`INSERT INTO item_types (id, slug, name, category)
    VALUES (${itemTypeId}, ${'slug-' + itemTypeId.slice(0, 8)}, 'Ballon', 'ballon')`
  await pgSql`INSERT INTO items (id, item_type_id, rfid_tag)
    VALUES (${itemId}, ${itemTypeId}, ${'RFID-' + itemId.slice(0, 8)})`
  await pgSql`INSERT INTO lockers (id, distributor_id, position, state, current_item_id)
    VALUES (${lockerId}, ${distributorId}, 0, 'idle', ${itemId})`

  return { id, distributorId, itemTypeId, itemId, lockerId }
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

interface ReservationSeedOpts {
  userId: string
  commune: CommuneSeed
  status?: 'pending' | 'active' | 'returned' | 'overdue' | 'cancelled' | 'expired'
  createdAt?: Date
  /** Si fourni, override le locker (utile pour mettre plusieurs résa sans collision). */
  lockerId?: string
  itemId?: string
}

/**
 * Insère une réservation + son locker dédié au besoin (pour pouvoir
 * créer plusieurs résa par commune sans conflit). Retourne l'id.
 */
async function seedReservation(opts: ReservationSeedOpts): Promise<string> {
  const id = randomUUID()
  const jti = randomUUID()
  let lockerId = opts.lockerId
  let itemId = opts.itemId

  if (!lockerId) {
    // Crée un locker dédié + item dédié pour cette résa
    const newLockerId = randomUUID()
    const newItemId = randomUUID()
    await pgSql`INSERT INTO items (id, item_type_id, rfid_tag)
      VALUES (${newItemId}, ${opts.commune.itemTypeId}, ${'RFID-' + newItemId.slice(0, 8)})`
    // Position dynamique pour respecter l'unique (distributor_id, position)
    const posRow = await pgSql<{ next_pos: number }[]>`
      SELECT COALESCE(MAX(position), -1) + 1 AS next_pos
      FROM lockers WHERE distributor_id = ${opts.commune.distributorId}`
    await pgSql`INSERT INTO lockers (id, distributor_id, position, state, current_item_id)
      VALUES (${newLockerId}, ${opts.commune.distributorId}, ${posRow[0]!.next_pos}, 'idle', ${newItemId})`
    lockerId = newLockerId
    itemId = newItemId
  } else if (!itemId) {
    itemId = opts.commune.itemId
  }

  const status = opts.status ?? 'pending'
  const createdAt = opts.createdAt ?? new Date()
  const expiresAt = new Date(createdAt.getTime() + 15 * 60_000)
  const openedAt = status === 'pending' ? null : createdAt
  const returnedAt = status === 'returned' ? createdAt : null
  const dueAt = status === 'active' || status === 'overdue'
    ? new Date(createdAt.getTime() + 4 * 3600_000)
    : null

  // Ajuste l'état du locker pour refléter le statut de la résa
  // (les routes admin font des UPDATE sur lockers donc on évite des FK invalides).
  if (status === 'pending' || status === 'active') {
    await pgSql`UPDATE lockers SET state = 'reserved' WHERE id = ${lockerId}`
  }

  await pgSql`
    INSERT INTO reservations
      (id, user_id, locker_id, item_id, distributor_id, status, qr_jti,
       expires_at, opened_at, returned_at, due_at, created_at, updated_at)
    VALUES
      (${id}, ${opts.userId}, ${lockerId}, ${itemId}, ${opts.commune.distributorId},
       ${status}, ${jti},
       ${expiresAt.toISOString()},
       ${openedAt ? openedAt.toISOString() : null},
       ${returnedAt ? returnedAt.toISOString() : null},
       ${dueAt ? dueAt.toISOString() : null},
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

// ─── GET /v1/admin/reservations ─────────────────────────────────────────────

describe('GET /v1/admin/reservations', () => {
  it('super_admin → voit toutes les résa, tri DESC createdAt', async () => {
    const communeA = await seedCommuneFull('Paris')
    const communeB = await seedCommuneFull('Lyon')
    const userA = await seedUser({ role: 'citizen', communeId: communeA.id })
    const userB = await seedUser({ role: 'citizen', communeId: communeB.id })
    const su = await seedUser({ role: 'super_admin' })

    const idOlder = await seedReservation({
      userId: userA.id,
      commune: communeA,
      status: 'pending',
      createdAt: new Date('2026-05-01T10:00:00Z'),
    })
    const idNewer = await seedReservation({
      userId: userB.id,
      commune: communeB,
      status: 'active',
      createdAt: new Date('2026-05-15T10:00:00Z'),
    })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/reservations/',
      headers: { authorization: authHeader(su.id, 'super_admin') },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as { items: { id: string }[]; nextCursor: string | null }
    expect(body.items).toHaveLength(2)
    // Tri DESC createdAt → newer en premier
    expect(body.items[0]!.id).toBe(idNewer)
    expect(body.items[1]!.id).toBe(idOlder)
    expect(body.nextCursor).toBeNull()
  })

  it('admin scoped → ne voit que les résa des distributeurs de sa commune', async () => {
    const communeA = await seedCommuneFull('CommuneA')
    const communeB = await seedCommuneFull('CommuneB')
    const userA = await seedUser({ role: 'citizen', communeId: communeA.id })
    const userB = await seedUser({ role: 'citizen', communeId: communeB.id })
    const adminA = await seedUser({ role: 'admin', communeId: communeA.id })

    const idA = await seedReservation({ userId: userA.id, commune: communeA, status: 'pending' })
    await seedReservation({ userId: userB.id, commune: communeB, status: 'active' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/reservations/',
      headers: { authorization: authHeader(adminA.id, 'admin', communeA.id) },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as { items: { id: string }[] }
    expect(body.items).toHaveLength(1)
    expect(body.items[0]!.id).toBe(idA)
  })

  it('filtre status', async () => {
    const c = await seedCommuneFull('FilterStatus')
    const u = await seedUser({ role: 'citizen', communeId: c.id })
    const su = await seedUser({ role: 'super_admin' })

    await seedReservation({ userId: u.id, commune: c, status: 'pending' })
    const idActive = await seedReservation({ userId: u.id, commune: c, status: 'active' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/reservations/?status=active',
      headers: { authorization: authHeader(su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const items = (res.json() as { items: { id: string; status: string }[] }).items
    expect(items).toHaveLength(1)
    expect(items[0]!.id).toBe(idActive)
    expect(items[0]!.status).toBe('active')
  })

  it('filtre distributorId', async () => {
    const c1 = await seedCommuneFull('Dist1')
    const c2 = await seedCommuneFull('Dist2')
    const u = await seedUser({ role: 'citizen', communeId: c1.id })
    const su = await seedUser({ role: 'super_admin' })

    const wanted = await seedReservation({ userId: u.id, commune: c1, status: 'pending' })
    await seedReservation({ userId: u.id, commune: c2, status: 'pending' })

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/reservations/?distributorId=${c1.distributorId}`,
      headers: { authorization: authHeader(su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const items = (res.json() as { items: { id: string }[] }).items
    expect(items).toHaveLength(1)
    expect(items[0]!.id).toBe(wanted)
  })

  it('filtres from/to (date pickers UI)', async () => {
    const c = await seedCommuneFull('DateRange')
    const u = await seedUser({ role: 'citizen', communeId: c.id })
    const su = await seedUser({ role: 'super_admin' })

    await seedReservation({ userId: u.id, commune: c, status: 'pending', createdAt: new Date('2026-04-20T10:00:00Z') })
    const inside = await seedReservation({ userId: u.id, commune: c, status: 'pending', createdAt: new Date('2026-05-10T10:00:00Z') })
    await seedReservation({ userId: u.id, commune: c, status: 'pending', createdAt: new Date('2026-06-01T10:00:00Z') })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/reservations/?from=2026-05-01&to=2026-05-31',
      headers: { authorization: authHeader(su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const items = (res.json() as { items: { id: string }[] }).items
    expect(items).toHaveLength(1)
    expect(items[0]!.id).toBe(inside)
  })

  it('pagination cursor : la 2e page reprend bien où la 1ère s\'est arrêtée', async () => {
    const c = await seedCommuneFull('Pagination')
    const u = await seedUser({ role: 'citizen', communeId: c.id })
    const su = await seedUser({ role: 'super_admin' })

    // Crée 5 résa avec createdAt incrémental → ordre DESC connu
    const ids: string[] = []
    for (let i = 0; i < 5; i++) {
      const id = await seedReservation({
        userId: u.id,
        commune: c,
        status: 'pending',
        createdAt: new Date(`2026-05-0${i + 1}T10:00:00Z`),
      })
      ids.push(id)
    }
    // ids[0] = plus ancien, ids[4] = plus récent. Tri DESC attendu : 4, 3, 2, 1, 0.

    const page1 = await app.inject({
      method: 'GET',
      url: '/v1/admin/reservations/?limit=2',
      headers: { authorization: authHeader(su.id, 'super_admin') },
    })
    expect(page1.statusCode).toBe(200)
    const b1 = page1.json() as { items: { id: string }[]; nextCursor: string | null }
    expect(b1.items.map((r) => r.id)).toEqual([ids[4], ids[3]])
    expect(b1.nextCursor).toBeTruthy()

    const page2 = await app.inject({
      method: 'GET',
      url: `/v1/admin/reservations/?limit=2&cursor=${encodeURIComponent(b1.nextCursor!)}`,
      headers: { authorization: authHeader(su.id, 'super_admin') },
    })
    expect(page2.statusCode).toBe(200)
    const b2 = page2.json() as { items: { id: string }[]; nextCursor: string | null }
    expect(b2.items.map((r) => r.id)).toEqual([ids[2], ids[1]])
    expect(b2.nextCursor).toBeTruthy()

    const page3 = await app.inject({
      method: 'GET',
      url: `/v1/admin/reservations/?limit=2&cursor=${encodeURIComponent(b2.nextCursor!)}`,
      headers: { authorization: authHeader(su.id, 'super_admin') },
    })
    expect(page3.statusCode).toBe(200)
    const b3 = page3.json() as { items: { id: string }[]; nextCursor: string | null }
    expect(b3.items.map((r) => r.id)).toEqual([ids[0]])
    expect(b3.nextCursor).toBeNull()
  })

  it('cursor invalide → 400 invalid_cursor', async () => {
    const su = await seedUser({ role: 'super_admin' })
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/reservations/?cursor=garbage-no-underscore',
      headers: { authorization: authHeader(su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(400)
    expect((res.json() as { error: string }).error).toBe('invalid_cursor')
  })

  it('citizen → 403 forbidden_admin_required', async () => {
    const u = await seedUser({ role: 'citizen' })
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/reservations/',
      headers: { authorization: authHeader(u.id, 'citizen') },
    })
    expect(res.statusCode).toBe(403)
    expect((res.json() as { error: string }).error).toBe('forbidden_admin_required')
  })

  it('admin sans communeId dans JWT → 403 forbidden_admin_missing_commune', async () => {
    const u = await seedUser({ role: 'admin' })
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/reservations/',
      headers: { authorization: authHeader(u.id, 'admin') }, // pas de communeId
    })
    expect(res.statusCode).toBe(403)
    expect((res.json() as { error: string }).error).toBe('forbidden_admin_missing_commune')
  })
})

// ─── GET /v1/admin/reservations/:id ─────────────────────────────────────────

describe('GET /v1/admin/reservations/:id', () => {
  it('super_admin → 200 + detail + events triés ASC', async () => {
    const c = await seedCommuneFull('Detail')
    const u = await seedUser({ role: 'citizen', communeId: c.id })
    const su = await seedUser({ role: 'super_admin' })
    const reservationId = await seedReservation({ userId: u.id, commune: c, status: 'active' })

    // Récupère le lockerId via la résa pour les events
    const rows = await pgSql<{ locker_id: string }[]>`
      SELECT locker_id FROM reservations WHERE id = ${reservationId}`
    const lockerId = rows[0]!.locker_id

    // Insère 3 events avec createdAt ordonné (ASC attendu)
    await pgSql`INSERT INTO locker_events (id, locker_id, reservation_id, event_type, source, metadata, created_at)
      VALUES (${randomUUID()}, ${lockerId}, ${reservationId}, 'reserved', 'app', '{}'::jsonb, '2026-05-10T10:00:00Z')`
    await pgSql`INSERT INTO locker_events (id, locker_id, reservation_id, event_type, source, metadata, created_at)
      VALUES (${randomUUID()}, ${lockerId}, ${reservationId}, 'opened', 'firmware', '{}'::jsonb, '2026-05-10T10:05:00Z')`
    await pgSql`INSERT INTO locker_events (id, locker_id, reservation_id, event_type, source, metadata, created_at)
      VALUES (${randomUUID()}, ${lockerId}, ${reservationId}, 'closed', 'firmware', '{}'::jsonb, '2026-05-10T10:10:00Z')`

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/reservations/${reservationId}`,
      headers: { authorization: authHeader(su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      id: string
      status: string
      events: { eventType: string; createdAt: string }[]
    }
    expect(body.id).toBe(reservationId)
    expect(body.status).toBe('active')
    expect(body.events.map((e) => e.eventType)).toEqual(['reserved', 'opened', 'closed'])
    // ASC : timestamp croissant
    for (let i = 1; i < body.events.length; i++) {
      expect(new Date(body.events[i]!.createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(body.events[i - 1]!.createdAt).getTime(),
      )
    }
  })

  it('admin scoped sur résa d\'une autre commune → 404 (anti-leak)', async () => {
    const communeA = await seedCommuneFull('A')
    const communeB = await seedCommuneFull('B')
    const userB = await seedUser({ role: 'citizen', communeId: communeB.id })
    const adminA = await seedUser({ role: 'admin', communeId: communeA.id })

    const idB = await seedReservation({ userId: userB.id, commune: communeB, status: 'pending' })

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/reservations/${idB}`,
      headers: { authorization: authHeader(adminA.id, 'admin', communeA.id) },
    })
    expect(res.statusCode).toBe(404)
    expect((res.json() as { error: string }).error).toBe('reservation_not_found')
  })

  it('résa inexistante → 404', async () => {
    const su = await seedUser({ role: 'super_admin' })
    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/reservations/${randomUUID()}`,
      headers: { authorization: authHeader(su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(404)
  })
})

// ─── POST /v1/admin/reservations/:id/force-cancel ───────────────────────────

describe('POST /v1/admin/reservations/:id/force-cancel', () => {
  it('résa active → status=cancelled, locker=idle, event "cancelled" source=admin', async () => {
    const c = await seedCommuneFull('Cancel')
    const u = await seedUser({ role: 'citizen', communeId: c.id })
    const su = await seedUser({ role: 'super_admin' })
    const reservationId = await seedReservation({ userId: u.id, commune: c, status: 'active' })

    // Récupère le locker associé
    const rows = await pgSql<{ locker_id: string }[]>`
      SELECT locker_id FROM reservations WHERE id = ${reservationId}`
    const lockerId = rows[0]!.locker_id

    const res = await app.inject({
      method: 'POST',
      url: `/v1/admin/reservations/${reservationId}/force-cancel`,
      headers: { authorization: authHeader(su.id, 'super_admin') },
      payload: { reason: 'incident terrain' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { status: string; cancellationReason: string }
    expect(body.status).toBe('cancelled')
    expect(body.cancellationReason).toBe('incident terrain')

    // DB : status → cancelled
    const rRows = await pgSql<{ status: string; cancellation_reason: string | null }[]>`
      SELECT status, cancellation_reason FROM reservations WHERE id = ${reservationId}`
    expect(rRows[0]!.status).toBe('cancelled')
    expect(rRows[0]!.cancellation_reason).toBe('incident terrain')

    // Locker → idle
    const lRows = await pgSql<{ state: string }[]>`
      SELECT state FROM lockers WHERE id = ${lockerId}`
    expect(lRows[0]!.state).toBe('idle')

    // Event cancelled source=admin
    const events = await pgSql<{ event_type: string; source: string }[]>`
      SELECT event_type, source FROM locker_events
      WHERE reservation_id = ${reservationId} AND event_type = 'cancelled'`
    expect(events).toHaveLength(1)
    expect(events[0]!.source).toBe('admin')
  })

  it('sans reason → utilise "admin_force_cancel" par défaut', async () => {
    const c = await seedCommuneFull('CancelDefault')
    const u = await seedUser({ role: 'citizen', communeId: c.id })
    const su = await seedUser({ role: 'super_admin' })
    const reservationId = await seedReservation({ userId: u.id, commune: c, status: 'pending' })

    const res = await app.inject({
      method: 'POST',
      url: `/v1/admin/reservations/${reservationId}/force-cancel`,
      headers: { authorization: authHeader(su.id, 'super_admin') },
      payload: {},
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { cancellationReason: string }
    expect(body.cancellationReason).toBe('admin_force_cancel')
  })

  it('résa déjà returned → 409 reservation_already_terminal', async () => {
    const c = await seedCommuneFull('Terminal')
    const u = await seedUser({ role: 'citizen', communeId: c.id })
    const su = await seedUser({ role: 'super_admin' })
    const reservationId = await seedReservation({ userId: u.id, commune: c, status: 'returned' })

    const res = await app.inject({
      method: 'POST',
      url: `/v1/admin/reservations/${reservationId}/force-cancel`,
      headers: { authorization: authHeader(su.id, 'super_admin') },
      payload: {},
    })
    expect(res.statusCode).toBe(409)
    expect((res.json() as { error: string }).error).toBe('reservation_already_terminal')
  })

  it('résa déjà cancelled → 409 reservation_already_terminal', async () => {
    const c = await seedCommuneFull('Cancelled')
    const u = await seedUser({ role: 'citizen', communeId: c.id })
    const su = await seedUser({ role: 'super_admin' })
    const reservationId = await seedReservation({ userId: u.id, commune: c, status: 'cancelled' })

    const res = await app.inject({
      method: 'POST',
      url: `/v1/admin/reservations/${reservationId}/force-cancel`,
      headers: { authorization: authHeader(su.id, 'super_admin') },
      payload: {},
    })
    expect(res.statusCode).toBe(409)
  })

  it('admin scoped sur résa d\'une autre commune → 404 (anti-leak)', async () => {
    const communeA = await seedCommuneFull('A')
    const communeB = await seedCommuneFull('B')
    const userB = await seedUser({ role: 'citizen', communeId: communeB.id })
    const adminA = await seedUser({ role: 'admin', communeId: communeA.id })
    const idB = await seedReservation({ userId: userB.id, commune: communeB, status: 'pending' })

    const res = await app.inject({
      method: 'POST',
      url: `/v1/admin/reservations/${idB}/force-cancel`,
      headers: { authorization: authHeader(adminA.id, 'admin', communeA.id) },
      payload: { reason: 'cross-tenant attempt' },
    })
    expect(res.statusCode).toBe(404)
    expect((res.json() as { error: string }).error).toBe('reservation_not_found')

    // La résa cible ne doit pas avoir bougé
    const rRows = await pgSql<{ status: string }[]>`
      SELECT status FROM reservations WHERE id = ${idB}`
    expect(rRows[0]!.status).toBe('pending')
  })

  it('résa inexistante → 404 reservation_not_found', async () => {
    const su = await seedUser({ role: 'super_admin' })
    const res = await app.inject({
      method: 'POST',
      url: `/v1/admin/reservations/${randomUUID()}/force-cancel`,
      headers: { authorization: authHeader(su.id, 'super_admin') },
      payload: { reason: 'ghost' },
    })
    expect(res.statusCode).toBe(404)
  })
})

// ─── GET /v1/admin/reservations/export.csv ──────────────────────────────────

describe('GET /v1/admin/reservations/export.csv', () => {
  it('Content-Type text/csv + BOM UTF-8 + header 14 colonnes + CRLF', async () => {
    const c = await seedCommuneFull('Export')
    const u = await seedUser({
      role: 'citizen',
      communeId: c.id,
      email: 'export-user@test.local',
      displayName: 'Export User',
    })
    const su = await seedUser({ role: 'super_admin' })
    await seedReservation({ userId: u.id, commune: c, status: 'pending' })
    await seedReservation({ userId: u.id, commune: c, status: 'active' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/reservations/export.csv',
      headers: { authorization: authHeader(su.id, 'super_admin') },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toMatch(/^text\/csv/)
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="reservations-/)

    const body = res.body
    // BOM UTF-8 : caractère U+FEFF
    expect(body.charCodeAt(0)).toBe(0xfeff)

    // Lignes séparées par CRLF
    const withoutBom = body.slice(1)
    const lines = withoutBom.split('\r\n')
    expect(lines.length).toBeGreaterThanOrEqual(3) // header + 2 résa

    // 14 colonnes dans le header (CSV : 13 virgules)
    const header = lines[0]!
    const headerCols = header.split(',')
    expect(headerCols).toHaveLength(14)
    expect(headerCols).toEqual([
      'id',
      'created_at',
      'status',
      'user_email',
      'user_name',
      'distributor_name',
      'distributor_serial',
      'item_type',
      'expires_at',
      'opened_at',
      'due_at',
      'returned_at',
      'extension_count',
      'cancellation_reason',
    ])

    // Sanity : au moins une ligne contient l'email du user seedé
    expect(withoutBom).toContain('export-user@test.local')
  })

  it('admin scoped → CSV ne contient QUE les résa de sa commune', async () => {
    const communeA = await seedCommuneFull('A')
    const communeB = await seedCommuneFull('B')
    const userA = await seedUser({
      role: 'citizen', communeId: communeA.id, email: 'a-user@test.local',
    })
    const userB = await seedUser({
      role: 'citizen', communeId: communeB.id, email: 'b-user@test.local',
    })
    const adminA = await seedUser({ role: 'admin', communeId: communeA.id })

    await seedReservation({ userId: userA.id, commune: communeA, status: 'pending' })
    await seedReservation({ userId: userB.id, commune: communeB, status: 'pending' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/reservations/export.csv',
      headers: { authorization: authHeader(adminA.id, 'admin', communeA.id) },
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('a-user@test.local')
    expect(res.body).not.toContain('b-user@test.local')
  })

  it('respecte le filtre status', async () => {
    const c = await seedCommuneFull('FilterStatusCsv')
    const u = await seedUser({ role: 'citizen', communeId: c.id, email: 'filter-status@test.local' })
    const su = await seedUser({ role: 'super_admin' })
    await seedReservation({ userId: u.id, commune: c, status: 'pending' })
    const activeId = await seedReservation({ userId: u.id, commune: c, status: 'active' })

    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/reservations/export.csv?status=active',
      headers: { authorization: authHeader(su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    // Doit contenir l'id active, pas l'autre
    expect(res.body).toContain(activeId)
    // Compte les data lines (sans header)
    const dataLines = res.body
      .slice(1)
      .split('\r\n')
      .slice(1)
      .filter((l) => l.length > 0)
    expect(dataLines).toHaveLength(1)
  })

  it('respecte les filtres distributorId / from / to', async () => {
    const c1 = await seedCommuneFull('Filter1')
    const c2 = await seedCommuneFull('Filter2')
    const u = await seedUser({ role: 'citizen', communeId: c1.id, email: 'filter-csv@test.local' })
    const su = await seedUser({ role: 'super_admin' })

    // c1 : 2 résa (1 dans la fenêtre, 1 hors)
    await seedReservation({ userId: u.id, commune: c1, status: 'pending', createdAt: new Date('2026-05-10T10:00:00Z') })
    await seedReservation({ userId: u.id, commune: c1, status: 'pending', createdAt: new Date('2026-06-15T10:00:00Z') })
    // c2 : 1 résa (dans la fenêtre, mais filtrée out par distributorId)
    await seedReservation({ userId: u.id, commune: c2, status: 'pending', createdAt: new Date('2026-05-15T10:00:00Z') })

    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/reservations/export.csv?distributorId=${c1.distributorId}&from=2026-05-01&to=2026-05-31`,
      headers: { authorization: authHeader(su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    const dataLines = res.body
      .slice(1)
      .split('\r\n')
      .slice(1)
      .filter((l) => l.length > 0)
    expect(dataLines).toHaveLength(1)

    // Filename intègre la fenêtre demandée
    expect(res.headers['content-disposition']).toContain('reservations-2026-05-01_2026-05-31.csv')
  })

  it('CSV vide (zéro résa) → header seul + BOM', async () => {
    const su = await seedUser({ role: 'super_admin' })
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/reservations/export.csv',
      headers: { authorization: authHeader(su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    expect(res.body.charCodeAt(0)).toBe(0xfeff)
    const withoutBom = res.body.slice(1)
    // Pas de CRLF : pas de lignes data
    expect(withoutBom.includes('\r\n')).toBe(false)
    expect(withoutBom.split(',')).toHaveLength(14)
  })
})
