/**
 * Tests d'intégration des handlers MQTT (Phase 2).
 *
 * Vérifie :
 *   - door_unlocked : transition réservation → active, locker → active,
 *     insert dans locker_events, idempotence (rejeu via flush pending_events
 *     du firmware au reconnect), refus signature invalide / device mismatch
 *   - heartbeat : insert dans distributor_heartbeats, update last_seen_at,
 *     status passe à 'online' (mais respecte 'maintenance')
 *   - status : passe à 'online'/'offline' (mais respecte 'maintenance')
 *
 * Pattern : testcontainers Postgres (sans Redis, sans app Fastify — on
 * appelle les handlers directement avec un logger no-op).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import postgres from 'postgres'
import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FastifyBaseLogger } from 'fastify'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..', '..', '..')
const SCHEMA_PATH = join(REPO_ROOT, 'database', 'schema.sql')
const MIGRATIONS_DIR = join(REPO_ROOT, 'database', 'migrations')

let pgContainer: StartedPostgreSqlContainer
let pgSql: ReturnType<typeof postgres>

const log: FastifyBaseLogger = {
  level: 'fatal',
  fatal: () => undefined,
  error: () => undefined,
  warn: () => undefined,
  info: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
  silent: () => undefined,
  child: () => log,
} as unknown as FastifyBaseLogger

beforeAll(async () => {
  pgContainer = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('sportlocker_test')
    .withUsername('test')
    .withPassword('test')
    .start()

  process.env.NODE_ENV = 'test'
  process.env.DATABASE_URL = pgContainer.getConnectionUri()
  process.env.REDIS_URL = 'redis://localhost:6379'
  process.env.JWT_SESSION_SECRET = 'a'.repeat(64)
  process.env.JWT_DEVICE_SECRET = 'test-device-secret-32-chars-long-pad'
  process.env.LOG_LEVEL = 'fatal'
  process.env.MQTT_SUBSCRIBER_ENABLED = 'false'

  pgSql = postgres(process.env.DATABASE_URL!, { onnotice: () => {} })
  await pgSql.unsafe(readFileSync(SCHEMA_PATH, 'utf-8'))
  const migrations = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  for (const f of migrations) {
    await pgSql.unsafe(readFileSync(join(MIGRATIONS_DIR, f), 'utf-8'))
  }
}, 60_000)

afterAll(async () => {
  await pgSql.end()
  await pgContainer.stop()
}, 30_000)

beforeEach(async () => {
  await pgSql`TRUNCATE TABLE locker_events, distributor_heartbeats, reviews, reservations,
                              lockers, items, item_types, distributors, users, communes
              RESTART IDENTITY CASCADE`
})

async function importModule(): Promise<typeof import('../../src/lib/mqtt-events.js')> {
  return import('../../src/lib/mqtt-events.js')
}

async function importHmac(): Promise<typeof import('../../src/lib/mqtt-hmac.js')> {
  return import('../../src/lib/mqtt-hmac.js')
}

interface Fixtures {
  communeId: string
  distributorId: string
  itemTypeId: string
  itemId: string
  lockerId: string
  userId: string
  reservationId: string
}

async function seedActiveCandidate(opts: { resaStatus?: string } = {}): Promise<Fixtures> {
  const communeId = randomUUID()
  const distributorId = randomUUID()
  const itemTypeId = randomUUID()
  const itemId = randomUUID()
  const lockerId = randomUUID()
  const userId = randomUUID()
  const reservationId = randomUUID()
  const status = opts.resaStatus ?? 'scheduled'

  await pgSql`INSERT INTO communes (id, insee_code, name, postal_code, department, region)
    VALUES (${communeId}, ${'7' + Math.floor(Math.random() * 9000 + 1000)},
            'Paris Test', '75001', '75', 'IDF')`
  await pgSql`INSERT INTO distributors (id, serial_number, commune_id, name, locker_count, status)
    VALUES (${distributorId}, ${'T-' + distributorId.slice(0, 8)}, ${communeId},
            'Test Dist', 4, 'offline')`
  await pgSql`INSERT INTO item_types (id, slug, name, category)
    VALUES (${itemTypeId}, ${'slug-' + itemTypeId.slice(0, 8)}, 'Ballon', 'ballon')`
  await pgSql`INSERT INTO items (id, item_type_id, rfid_tag)
    VALUES (${itemId}, ${itemTypeId}, ${'RFID-' + itemId.slice(0, 8)})`
  await pgSql`INSERT INTO lockers (id, distributor_id, position, state, current_item_id)
    VALUES (${lockerId}, ${distributorId}, 0, 'reserved', ${itemId})`
  await pgSql`INSERT INTO users (id, firebase_uid, email)
    VALUES (${userId}, ${'fb-' + userId.slice(0, 8)}, ${userId.slice(0, 8) + '@test.local'})`
  // expires_at +15min (cohérent avec le JWT firmware), status au choix.
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
  await pgSql.unsafe(
    `INSERT INTO reservations (id, user_id, locker_id, item_id, distributor_id,
                               status, qr_jti, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6::reservation_status, $7, $8)`,
    [reservationId, userId, lockerId, itemId, distributorId, status,
     'jti-' + reservationId.slice(0, 8), expiresAt],
  )
  return { communeId, distributorId, itemTypeId, itemId, lockerId, userId, reservationId }
}

describe('handleEnvelope (door_unlocked)', () => {
  it('passe la résa scheduled → active et insert locker_events.opened', async () => {
    const f = await seedActiveCandidate({ resaStatus: 'scheduled' })
    const { computeSignature } = await importHmac()
    const { handleEnvelope } = await importModule()
    const { db } = await import('../../src/db/client.js')

    const data = {
      type: 'door_unlocked',
      deviceId: f.distributorId,
      reservationId: f.reservationId,
      lockerId: f.lockerId,
      jti: 'jti-event-1',
      openedAt: Math.floor(Date.now() / 1000),
      mode: 'online',
    }
    const ok = await handleEnvelope(
      { data, sig: computeSignature(data) },
      f.distributorId,
      { db, log },
    )
    expect(ok).toBe(true)

    const [r] = await pgSql`SELECT status, opened_at FROM reservations WHERE id = ${f.reservationId}`
    expect(r.status).toBe('active')
    expect(r.opened_at).not.toBeNull()

    const [l] = await pgSql`SELECT state FROM lockers WHERE id = ${f.lockerId}`
    expect(l.state).toBe('active')

    const events = await pgSql`SELECT event_type, source, metadata FROM locker_events
                                WHERE reservation_id = ${f.reservationId}`
    expect(events).toHaveLength(1)
    expect(events[0].event_type).toBe('opened')
    expect(events[0].source).toBe('mqtt')
    expect(events[0].metadata).toMatchObject({ jti: 'jti-event-1', mode: 'online' })
  })

  it('pose due_at = slot_end_at à l\'activation (modèle slots, CGU art. 5)', async () => {
    const f = await seedActiveCandidate({ resaStatus: 'scheduled' })
    // Modèle slots : la résa a un créneau réservé → la deadline de retour doit
    // être la fin du créneau (slot_end_at), pas NULL.
    const slotStart = new Date(Date.now() - 5 * 60 * 1000)
    const slotEnd = new Date(Date.now() + 25 * 60 * 1000)
    await pgSql`UPDATE reservations
                   SET slot_start_at = ${slotStart}, slot_end_at = ${slotEnd}
                 WHERE id = ${f.reservationId}`

    const { computeSignature } = await importHmac()
    const { handleEnvelope } = await importModule()
    const { db } = await import('../../src/db/client.js')

    const data = {
      type: 'door_unlocked',
      deviceId: f.distributorId,
      reservationId: f.reservationId,
      lockerId: f.lockerId,
      jti: 'jti-due-at',
      openedAt: Math.floor(Date.now() / 1000),
      mode: 'online',
    }
    const ok = await handleEnvelope(
      { data, sig: computeSignature(data) },
      f.distributorId,
      { db, log },
    )
    expect(ok).toBe(true)

    const [r] = await pgSql`SELECT status, due_at, slot_end_at
                              FROM reservations WHERE id = ${f.reservationId}`
    expect(r.status).toBe('active')
    expect(r.due_at).not.toBeNull()
    // Deadline = fin du créneau réservé.
    expect(new Date(r.due_at).getTime()).toBe(new Date(r.slot_end_at).getTime())
  })

  it('refuse une signature invalide sans toucher à la résa', async () => {
    const f = await seedActiveCandidate({ resaStatus: 'scheduled' })
    const { handleEnvelope } = await importModule()
    const { db } = await import('../../src/db/client.js')

    const data = {
      type: 'door_unlocked',
      deviceId: f.distributorId,
      reservationId: f.reservationId,
      lockerId: f.lockerId,
      jti: 'jti-forged',
      openedAt: Math.floor(Date.now() / 1000),
    }
    const ok = await handleEnvelope(
      { data, sig: 'deadbeef'.repeat(8) },
      f.distributorId,
      { db, log },
    )
    expect(ok).toBe(false)

    const [r] = await pgSql`SELECT status FROM reservations WHERE id = ${f.reservationId}`
    expect(r.status).toBe('scheduled')
    const events = await pgSql`SELECT * FROM locker_events WHERE reservation_id = ${f.reservationId}`
    expect(events).toHaveLength(0)
  })

  it('refuse si data.deviceId ne match pas le topic', async () => {
    const f = await seedActiveCandidate({ resaStatus: 'scheduled' })
    const { computeSignature } = await importHmac()
    const { handleEnvelope } = await importModule()
    const { db } = await import('../../src/db/client.js')

    const data = {
      type: 'door_unlocked',
      deviceId: f.distributorId,
      reservationId: f.reservationId,
      lockerId: f.lockerId,
      jti: 'jti-spoof',
      openedAt: Math.floor(Date.now() / 1000),
    }
    // Topic prétend être un autre device — on refuse pour éviter l'usurpation.
    const ok = await handleEnvelope(
      { data, sig: computeSignature(data) },
      randomUUID(),
      { db, log },
    )
    expect(ok).toBe(false)

    const [r] = await pgSql`SELECT status FROM reservations WHERE id = ${f.reservationId}`
    expect(r.status).toBe('scheduled')
  })

  it('idempotent : rejouer le même event ne crée pas de doublon', async () => {
    const f = await seedActiveCandidate({ resaStatus: 'scheduled' })
    const { computeSignature } = await importHmac()
    const { handleEnvelope } = await importModule()
    const { db } = await import('../../src/db/client.js')

    const data = {
      type: 'door_unlocked',
      deviceId: f.distributorId,
      reservationId: f.reservationId,
      lockerId: f.lockerId,
      jti: 'jti-replay',
      openedAt: Math.floor(Date.now() / 1000),
    }
    const env = { data, sig: computeSignature(data) }
    await handleEnvelope(env, f.distributorId, { db, log })
    await handleEnvelope(env, f.distributorId, { db, log })

    const events = await pgSql`SELECT id FROM locker_events WHERE reservation_id = ${f.reservationId}`
    expect(events).toHaveLength(1) // pas de double opened
  })

  it('refuse de transition une résa déjà returned (cas anormal mais sûr)', async () => {
    const f = await seedActiveCandidate({ resaStatus: 'returned' })
    const { computeSignature } = await importHmac()
    const { handleEnvelope } = await importModule()
    const { db } = await import('../../src/db/client.js')

    const data = {
      type: 'door_unlocked',
      deviceId: f.distributorId,
      reservationId: f.reservationId,
      lockerId: f.lockerId,
      jti: 'jti-after-return',
      openedAt: Math.floor(Date.now() / 1000),
    }
    await handleEnvelope(
      { data, sig: computeSignature(data) },
      f.distributorId,
      { db, log },
    )

    const [r] = await pgSql`SELECT status FROM reservations WHERE id = ${f.reservationId}`
    expect(r.status).toBe('returned')
  })

  it('refuse si le lockerId ne match pas celui de la résa', async () => {
    const f = await seedActiveCandidate({ resaStatus: 'scheduled' })
    const { computeSignature } = await importHmac()
    const { handleEnvelope } = await importModule()
    const { db } = await import('../../src/db/client.js')

    const data = {
      type: 'door_unlocked',
      deviceId: f.distributorId,
      reservationId: f.reservationId,
      lockerId: randomUUID(),  // autre casier
      jti: 'jti-wrong-locker',
      openedAt: Math.floor(Date.now() / 1000),
    }
    const ok = await handleEnvelope(
      { data, sig: computeSignature(data) },
      f.distributorId,
      { db, log },
    )
    // ok=true (envelope valide) mais la transition est skip → résa reste scheduled
    expect(ok).toBe(true)
    const [r] = await pgSql`SELECT status FROM reservations WHERE id = ${f.reservationId}`
    expect(r.status).toBe('scheduled')
  })
})

describe('handleHeartbeat', () => {
  it('insert dans distributor_heartbeats et passe le device à online', async () => {
    const f = await seedActiveCandidate()
    const { handleHeartbeat } = await importModule()
    const { db } = await import('../../src/db/client.js')

    const ok = await handleHeartbeat(
      { deviceId: f.distributorId, uptimeSeconds: 1234, cpuTempC: 42.5, freeMemMb: 800 },
      f.distributorId,
      { db, log },
    )
    expect(ok).toBe(true)

    const hbs = await pgSql`SELECT uptime_seconds, cpu_temp_c, free_mem_mb FROM distributor_heartbeats
                            WHERE distributor_id = ${f.distributorId}`
    expect(hbs).toHaveLength(1)
    expect(hbs[0].uptime_seconds).toBe(1234)
    expect(Number(hbs[0].cpu_temp_c)).toBeCloseTo(42.5, 1)
    expect(hbs[0].free_mem_mb).toBe(800)

    const [d] = await pgSql`SELECT status, last_seen_at FROM distributors WHERE id = ${f.distributorId}`
    expect(d.status).toBe('online')
    expect(d.last_seen_at).not.toBeNull()
  })

  it('respecte un status maintenance — ne le repasse pas à online', async () => {
    const f = await seedActiveCandidate()
    await pgSql`UPDATE distributors SET status = 'maintenance' WHERE id = ${f.distributorId}`
    const { handleHeartbeat } = await importModule()
    const { db } = await import('../../src/db/client.js')

    await handleHeartbeat(
      { deviceId: f.distributorId, uptimeSeconds: 100 },
      f.distributorId,
      { db, log },
    )

    const [d] = await pgSql`SELECT status FROM distributors WHERE id = ${f.distributorId}`
    expect(d.status).toBe('maintenance')
  })

  it('drop le heartbeat si le device n\'existe pas', async () => {
    const { handleHeartbeat } = await importModule()
    const { db } = await import('../../src/db/client.js')
    const ghost = randomUUID()

    const ok = await handleHeartbeat(
      { deviceId: ghost, uptimeSeconds: 1 },
      ghost,
      { db, log },
    )
    expect(ok).toBe(true) // payload valide mais no-op
    const hbs = await pgSql`SELECT 1 FROM distributor_heartbeats`
    expect(hbs).toHaveLength(0)
  })

  it('refuse un payload sans deviceId UUID', async () => {
    const { handleHeartbeat } = await importModule()
    const { db } = await import('../../src/db/client.js')
    const ok = await handleHeartbeat({ deviceId: 'not-uuid' }, 'not-uuid', { db, log })
    expect(ok).toBe(false)
  })
})

describe('handleStatus', () => {
  it('passe distributors.status à online quand online=true', async () => {
    const f = await seedActiveCandidate()
    const { handleStatus } = await importModule()
    const { db } = await import('../../src/db/client.js')

    const ok = await handleStatus(
      { deviceId: f.distributorId, online: true, ts: 1715692800 },
      f.distributorId,
      { db, log },
    )
    expect(ok).toBe(true)

    const [d] = await pgSql`SELECT status, last_seen_at FROM distributors WHERE id = ${f.distributorId}`
    expect(d.status).toBe('online')
    expect(d.last_seen_at).not.toBeNull()
  })

  it('passe distributors.status à offline quand online=false (LWT)', async () => {
    const f = await seedActiveCandidate()
    await pgSql`UPDATE distributors SET status = 'online' WHERE id = ${f.distributorId}`
    const { handleStatus } = await importModule()
    const { db } = await import('../../src/db/client.js')

    await handleStatus(
      { deviceId: f.distributorId, online: false, reason: 'lwt' },
      f.distributorId,
      { db, log },
    )

    const [d] = await pgSql`SELECT status FROM distributors WHERE id = ${f.distributorId}`
    expect(d.status).toBe('offline')
  })

  it('respecte maintenance même sur un status offline reçu', async () => {
    const f = await seedActiveCandidate()
    await pgSql`UPDATE distributors SET status = 'maintenance' WHERE id = ${f.distributorId}`
    const { handleStatus } = await importModule()
    const { db } = await import('../../src/db/client.js')

    await handleStatus(
      { deviceId: f.distributorId, online: false },
      f.distributorId,
      { db, log },
    )

    const [d] = await pgSql`SELECT status FROM distributors WHERE id = ${f.distributorId}`
    expect(d.status).toBe('maintenance')
  })
})

describe('dispatchMqttMessage', () => {
  it('route /event vers handleEnvelope', async () => {
    const f = await seedActiveCandidate()
    const { computeSignature } = await importHmac()
    const { dispatchMqttMessage } = await importModule()
    const { db } = await import('../../src/db/client.js')

    const data = {
      type: 'door_unlocked',
      deviceId: f.distributorId,
      reservationId: f.reservationId,
      lockerId: f.lockerId,
      jti: 'jti-dispatch',
      openedAt: Math.floor(Date.now() / 1000),
    }
    const res = await dispatchMqttMessage(
      `sportlocker/${f.distributorId}/event`,
      { data, sig: computeSignature(data) },
      { db, log },
    )
    expect(res).toEqual({ matched: true, ok: true })

    const [r] = await pgSql`SELECT status FROM reservations WHERE id = ${f.reservationId}`
    expect(r.status).toBe('active')
  })

  it('ignore les topics inconnus (autres clients sur le même broker)', async () => {
    const { dispatchMqttMessage } = await importModule()
    const { db } = await import('../../src/db/client.js')
    const res = await dispatchMqttMessage('autre/topic', {}, { db, log })
    expect(res).toEqual({ matched: false, ok: false })
  })

  it('ignore les sous-topics cmd/* (loopback API → firmware)', async () => {
    const { dispatchMqttMessage } = await importModule()
    const { db } = await import('../../src/db/client.js')
    const res = await dispatchMqttMessage(
      `sportlocker/${randomUUID()}/cmd/open`,
      { token: 'jwt' },
      { db, log },
    )
    expect(res.matched).toBe(false)
  })
})
