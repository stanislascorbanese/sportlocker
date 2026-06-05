/**
 * Tests d'intégration pour le cron `runSlotReminders`.
 *
 * Objectif principal : régression du bug prod où le `now` (objet `Date`) était
 * interpolé brut dans un template `sql`, ce que le driver postgres-js refuse
 * (`ERR_INVALID_ARG_TYPE: Received an instance of Date`). Le fix passe l'ISO
 * string avec un cast `::timestamptz`. On vérifie donc :
 *   - La requête de sélection s'exécute sans lever (le bug faisait crasher
 *     chaque run du cron en prod).
 *   - La fenêtre `|delta_min - reminder_minutes_before| <= 8` sélectionne bien
 *     les bonnes résas, par user (reminder paramétrable).
 *
 * On ne seed PAS de push_tokens : sans subscription, chaque candidat est
 * compté en `skipped` (pas de VAPID requis) — ça isole le test sur la requête
 * SQL fixée. Le compteur `scanned` reflète directement le résultat du SELECT.
 *
 * Pattern : testcontainers Postgres direct (le job ne parle qu'à `db`).
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
  process.env.REDIS_URL = 'redis://localhost:6379'  // pas utilisé par ce job
  process.env.JWT_SESSION_SECRET = 'a'.repeat(64)
  process.env.JWT_DEVICE_SECRET = 'b'.repeat(64)
  process.env.LOG_LEVEL = 'fatal'

  pgSql = postgres(process.env.DATABASE_URL!, { onnotice: () => {} })
  await pgSql.unsafe(readFileSync(SCHEMA_PATH, 'utf-8'))
  const migrations = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  for (const f of migrations) {
    await pgSql.unsafe(readFileSync(join(MIGRATIONS_DIR, f), 'utf-8'))
  }
}, 120_000)

afterAll(async () => {
  await pgSql.end()
  await pgContainer.stop()
}, 30_000)

beforeEach(async () => {
  await pgSql`TRUNCATE TABLE notification_logs, push_tokens, reviews, locker_events, reservations,
                            lockers, items, item_types, distributors, users, communes
              RESTART IDENTITY CASCADE`
})

async function getJob() {
  return (await import('../../src/queues/slot-reminders.js')).runSlotReminders
}

// Décor minimal partagé : 1 commune + distributeur + locker + item_type + item.
async function seedFixtures(): Promise<{ lockerId: string; itemId: string; distributorId: string }> {
  const communeId = randomUUID()
  await pgSql`INSERT INTO communes (id, insee_code, name, postal_code, department, region)
    VALUES (${communeId}, '75011', 'Paris 11e', '75011', '75', 'IDF')`
  const distributorId = randomUUID()
  await pgSql`INSERT INTO distributors (id, serial_number, commune_id, name, locker_count)
    VALUES (${distributorId}, 'SL-TEST-001', ${communeId}, 'Square Voltaire', 8)`
  const lockerId = randomUUID()
  await pgSql`INSERT INTO lockers (id, distributor_id, position, state)
    VALUES (${lockerId}, ${distributorId}, 0, 'idle')`
  const itemTypeId = randomUUID()
  await pgSql`INSERT INTO item_types (id, slug, name, category)
    VALUES (${itemTypeId}, 'ballon', 'Ballon de foot', 'sport')`
  const itemId = randomUUID()
  await pgSql`INSERT INTO items (id, item_type_id, rfid_tag)
    VALUES (${itemId}, ${itemTypeId}, 'RFID-A')`
  return { lockerId, itemId, distributorId }
}

async function seedUser(reminderMinutesBefore: number): Promise<string> {
  const id = randomUUID()
  await pgSql`
    INSERT INTO users (id, firebase_uid, email, role, reminder_minutes_before)
    VALUES (${id}, ${'fb-' + id.slice(0, 8)}, ${id.slice(0, 8) + '@test.local'},
            'citizen', ${reminderMinutesBefore})`
  return id
}

async function seedScheduledReservation(opts: {
  userId: string
  fixtures: { lockerId: string; itemId: string; distributorId: string }
  slotStartInMinutes: number | null
  status?: string
}): Promise<string> {
  const id = randomUUID()
  const { lockerId, itemId, distributorId } = opts.fixtures
  const slotStart = opts.slotStartInMinutes === null
    ? null
    : new Date(Date.now() + opts.slotStartInMinutes * 60 * 1000)
  const slotEnd = slotStart === null ? null : new Date(slotStart.getTime() + 60 * 60 * 1000)
  await pgSql`
    INSERT INTO reservations (id, user_id, locker_id, item_id, distributor_id, status,
                              qr_jti, expires_at, slot_start_at, slot_end_at, duration_minutes)
    VALUES (${id}, ${opts.userId}, ${lockerId}, ${itemId}, ${distributorId},
            ${opts.status ?? 'scheduled'}, ${'jti-' + id.slice(0, 12)}, NOW(),
            ${slotStart}, ${slotEnd}, ${slotStart === null ? null : 60})`
  return id
}

describe('runSlotReminders', () => {
  it('exécute la requête de sélection sans crasher (régression bind Date)', async () => {
    const fixtures = await seedFixtures()
    const userId = await seedUser(15)
    // slot dans 15 min, reminder 15 → |15 - 15| = 0 ≤ 8 → dans la fenêtre
    await seedScheduledReservation({ userId, fixtures, slotStartInMinutes: 15 })

    // Avant le fix, ceci levait ERR_INVALID_ARG_TYPE (Date interpolé dans sql``).
    const res = await getJob().then((run) => run(log))

    expect(res.scanned).toBe(1)
    // Pas de push_token seedé → le candidat est skip (pas de VAPID requis).
    expect(res.skipped).toBe(1)
    expect(res.sent).toBe(0)
    expect(res.failed).toBe(0)
  })

  it('ne sélectionne que les résas dont le créneau tombe dans la fenêtre ±8 min', async () => {
    const fixtures = await seedFixtures()
    // Un user distinct par résa : l'index unique `one_live_per_user` (migration
    // 0008/0013) interdit deux résas "vivantes" pour le même user.
    const userIn = await seedUser(15)
    const userFuture = await seedUser(15)
    const userPast = await seedUser(15)

    // Dans la fenêtre : delta ≈ 15 → |15 - 15| = 0
    await seedScheduledReservation({ userId: userIn, fixtures, slotStartInMinutes: 15 })
    // Hors fenêtre : delta ≈ 120 → |120 - 15| = 105 > 8
    await seedScheduledReservation({ userId: userFuture, fixtures, slotStartInMinutes: 120 })
    // Hors fenêtre : déjà passé, delta ≈ -30 → |-30 - 15| = 45 > 8
    await seedScheduledReservation({ userId: userPast, fixtures, slotStartInMinutes: -30 })

    const res = await getJob().then((run) => run(log))
    expect(res.scanned).toBe(1)
  })

  it('respecte reminder_minutes_before par user', async () => {
    const fixtures = await seedFixtures()
    const user15 = await seedUser(15)
    const user60 = await seedUser(60)

    // Créneau dans 60 min :
    //  - user15 → |60 - 15| = 45 > 8 → exclu
    //  - user60 → |60 - 60| = 0 ≤ 8 → inclus
    await seedScheduledReservation({ userId: user15, fixtures, slotStartInMinutes: 60 })
    await seedScheduledReservation({ userId: user60, fixtures, slotStartInMinutes: 60 })

    const res = await getJob().then((run) => run(log))
    expect(res.scanned).toBe(1)
  })

  it('ignore les résas non `scheduled` et celles sans créneau', async () => {
    const fixtures = await seedFixtures()
    const userActive = await seedUser(15)
    const userNoSlot = await seedUser(15)

    // statut actif mais dans la fenêtre temporelle → exclu (status != scheduled)
    await seedScheduledReservation({
      userId: userActive, fixtures, slotStartInMinutes: 15, status: 'active',
    })
    // scheduled mais sans slot → exclu (slot_start_at IS NULL)
    await seedScheduledReservation({ userId: userNoSlot, fixtures, slotStartInMinutes: null })

    const res = await getJob().then((run) => run(log))
    expect(res.scanned).toBe(0)
  })
})
