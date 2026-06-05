/**
 * Tests d'intégration pour le cron `runDetectOverdue` — volet **rappel push**.
 *
 * Le passage `active → overdue` est déjà couvert par
 * test/routes/reservations.test.ts (describe 'Cron detect-overdue'). Ici on
 * cible l'effet de bord ajouté : l'envoi d'un push au user dont la résa vient
 * de passer overdue, et son enregistrement dans `notification_logs`.
 *
 * `sendWebPush` est mocké (pas de VAPID ni de vrai push service en test) pour
 * piloter déterministiquement les cas ok / gone / not_configured.
 *
 * Pattern : testcontainers Postgres direct (le job ne parle qu'à `db`).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import postgres from 'postgres'
import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FastifyBaseLogger } from 'fastify'
import type { SendResult } from '../../src/lib/webpush.js'

// Mock de l'envoi Web Push. `vi.hoisted` permet de référencer le mock dans la
// factory `vi.mock` (hoistée au-dessus des imports).
const { sendWebPushMock } = vi.hoisted(() => ({ sendWebPushMock: vi.fn() }))
vi.mock('../../src/lib/webpush.js', () => ({ sendWebPush: sendWebPushMock }))

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

const OK: SendResult = { ok: true, statusCode: 201 }
const GONE: SendResult = { ok: false, reason: 'gone', statusCode: 410 }
const NOT_CONFIGURED: SendResult = { ok: false, reason: 'not_configured' }

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
  process.env.OVERDUE_TRUST_PENALTY = '10'  // valeur connue pour les assertions

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
  sendWebPushMock.mockReset()
  await pgSql`TRUNCATE TABLE notification_logs, push_tokens, reviews, locker_events, reservations,
                            lockers, items, item_types, distributors, users, communes
              RESTART IDENTITY CASCADE`
})

async function getJob() {
  return (await import('../../src/queues/detect-overdue.js')).runDetectOverdue
}

async function seedFixtures(): Promise<{
  userId: string; lockerId: string; itemId: string; distributorId: string
}> {
  const communeId = randomUUID()
  await pgSql`INSERT INTO communes (id, insee_code, name, postal_code, department, region)
    VALUES (${communeId}, '75011', 'Paris 11e', '75011', '75', 'IDF')`
  const distributorId = randomUUID()
  await pgSql`INSERT INTO distributors (id, serial_number, commune_id, name, locker_count)
    VALUES (${distributorId}, 'SL-TEST-001', ${communeId}, 'Square Voltaire', 8)`
  const lockerId = randomUUID()
  await pgSql`INSERT INTO lockers (id, distributor_id, position, state)
    VALUES (${lockerId}, ${distributorId}, 0, 'active')`
  const itemTypeId = randomUUID()
  await pgSql`INSERT INTO item_types (id, slug, name, category)
    VALUES (${itemTypeId}, 'ballon', 'Ballon de foot', 'sport')`
  const itemId = randomUUID()
  await pgSql`INSERT INTO items (id, item_type_id, rfid_tag)
    VALUES (${itemId}, ${itemTypeId}, 'RFID-A')`
  const userId = randomUUID()
  await pgSql`INSERT INTO users (id, firebase_uid, email, role)
    VALUES (${userId}, ${'fb-' + userId.slice(0, 8)}, ${userId.slice(0, 8) + '@test.local'}, 'citizen')`
  return { userId, lockerId, itemId, distributorId }
}

async function seedPushToken(userId: string, endpoint = 'https://push.example/' + randomUUID()): Promise<string> {
  await pgSql`INSERT INTO push_tokens (id, user_id, endpoint, p256dh_key, auth_key)
    VALUES (${randomUUID()}, ${userId}, ${endpoint}, 'p256dh-key', 'auth-key')`
  return endpoint
}

// Insère une résa active dont due_at est dépassé → candidate à overdue.
async function seedOverdueReservation(f: {
  userId: string; lockerId: string; itemId: string; distributorId: string
}): Promise<string> {
  const id = randomUUID()
  await pgSql`INSERT INTO reservations
    (id, user_id, locker_id, item_id, distributor_id, status, qr_jti,
     expires_at, opened_at, due_at)
    VALUES (${id}, ${f.userId}, ${f.lockerId}, ${f.itemId}, ${f.distributorId},
            'active', ${'jti-' + id.slice(0, 12)},
            NOW() + INTERVAL '15 minutes',
            NOW() - INTERVAL '30 minutes',
            NOW() - INTERVAL '5 minutes')`
  return id
}

describe('runDetectOverdue — rappels push', () => {
  it('envoie un push et logge dans notification_logs quand une résa passe overdue', async () => {
    const f = await seedFixtures()
    await seedPushToken(f.userId)
    const resId = await seedOverdueReservation(f)
    sendWebPushMock.mockResolvedValue(OK)

    const count = await (await getJob())(log)
    expect(count).toBe(1)

    // Le push a été envoyé avec un payload contenant le nom de l'item.
    expect(sendWebPushMock).toHaveBeenCalledTimes(1)
    const [, payload] = sendWebPushMock.mock.calls[0]!
    expect(payload.title).toContain('retard')
    expect(payload.body).toContain('Ballon de foot')
    expect(payload.url).toBe(`/reservations/${resId}`)

    // notification_logs : 1 row, template = overdue_reminder:<resId>.
    const logs = await pgSql<{ template: string; channel: string; user_id: string }[]>`
      SELECT template, channel, user_id FROM notification_logs WHERE user_id = ${f.userId}`
    expect(logs).toHaveLength(1)
    expect(logs[0]!.template).toBe(`overdue_reminder:${resId}`)
    expect(logs[0]!.channel).toBe('push')
  })

  it("ne logge rien et n'envoie pas de push si le user n'a aucune subscription", async () => {
    const f = await seedFixtures()  // pas de push_token
    await seedOverdueReservation(f)

    const count = await (await getJob())(log)
    expect(count).toBe(1)  // la transition overdue a bien eu lieu
    expect(sendWebPushMock).not.toHaveBeenCalled()

    const logs = await pgSql`SELECT 1 FROM notification_logs`
    expect(logs).toHaveLength(0)
  })

  it('supprime une subscription révoquée (gone) et ne logge pas de notif', async () => {
    const f = await seedFixtures()
    const endpoint = await seedPushToken(f.userId)
    await seedOverdueReservation(f)
    sendWebPushMock.mockResolvedValue(GONE)

    await (await getJob())(log)

    // La subscription révoquée a été supprimée.
    const tokens = await pgSql`SELECT 1 FROM push_tokens WHERE endpoint = ${endpoint}`
    expect(tokens).toHaveLength(0)
    // Aucune notif loggée (rien d'effectivement délivré).
    const logs = await pgSql`SELECT 1 FROM notification_logs`
    expect(logs).toHaveLength(0)
  })

  it('VAPID absent (not_configured) : transition faite mais aucune notif loggée', async () => {
    const f = await seedFixtures()
    await seedPushToken(f.userId)
    const resId = await seedOverdueReservation(f)
    sendWebPushMock.mockResolvedValue(NOT_CONFIGURED)

    const count = await (await getJob())(log)
    expect(count).toBe(1)

    const rows = await pgSql<{ status: string }[]>`SELECT status FROM reservations WHERE id = ${resId}`
    expect(rows[0]!.status).toBe('overdue')  // transition OK malgré le push KO
    const logs = await pgSql`SELECT 1 FROM notification_logs`
    expect(logs).toHaveLength(0)
  })

  it('idempotent : un 2e run ne renvoie pas de push (résa plus active)', async () => {
    const f = await seedFixtures()
    await seedPushToken(f.userId)
    await seedOverdueReservation(f)
    sendWebPushMock.mockResolvedValue(OK)

    expect(await (await getJob())(log)).toBe(1)
    expect(await (await getJob())(log)).toBe(0)

    // Un seul push, une seule ligne de log malgré les deux runs.
    expect(sendWebPushMock).toHaveBeenCalledTimes(1)
    const logs = await pgSql`SELECT 1 FROM notification_logs`
    expect(logs).toHaveLength(1)
  })
})

async function trustScoreOf(userId: string): Promise<number> {
  const [row] = await pgSql<{ trust_score: number }[]>`
    SELECT trust_score FROM users WHERE id = ${userId}`
  return row!.trust_score
}

async function setTrustScore(userId: string, score: number): Promise<void> {
  await pgSql`UPDATE users SET trust_score = ${score} WHERE id = ${userId}`
}

describe('runDetectOverdue — pénalité trust_score', () => {
  it('décrémente le trust_score de OVERDUE_TRUST_PENALTY (10) quand une résa passe overdue', async () => {
    const f = await seedFixtures()  // trust_score = 100 par défaut
    await seedOverdueReservation(f)
    sendWebPushMock.mockResolvedValue(NOT_CONFIGURED)  // pas de push, on isole la pénalité

    await (await getJob())(log)

    expect(await trustScoreOf(f.userId)).toBe(90)
  })

  it('clampe le trust_score à 0 (jamais négatif, respecte le CHECK)', async () => {
    const f = await seedFixtures()
    await setTrustScore(f.userId, 5)  // 5 - 10 = -5 → doit être clampé à 0
    await seedOverdueReservation(f)
    sendWebPushMock.mockResolvedValue(NOT_CONFIGURED)

    await (await getJob())(log)

    expect(await trustScoreOf(f.userId)).toBe(0)
  })

  it('pénalise indépendamment chaque user ayant une résa overdue dans le run', async () => {
    // L'invariant "1 résa vivante max par user" empêche 2 overdue pour le
    // même user ; on vérifie donc la pénalité sur deux users distincts.
    const f1 = await seedFixtures()
    await seedOverdueReservation(f1)
    // 2e user + sa propre résa overdue, en réutilisant le décor (distributeur,
    // locker, item) — un locker peut référencer plusieurs résas en test.
    const u2 = randomUUID()
    await pgSql`INSERT INTO users (id, firebase_uid, email, role)
      VALUES (${u2}, ${'fb-' + u2.slice(0, 8)}, ${u2.slice(0, 8) + '@test.local'}, 'citizen')`
    await seedOverdueReservation({ ...f1, userId: u2 })
    sendWebPushMock.mockResolvedValue(NOT_CONFIGURED)

    const count = await (await getJob())(log)
    expect(count).toBe(2)
    expect(await trustScoreOf(f1.userId)).toBe(90)
    expect(await trustScoreOf(u2)).toBe(90)
  })

  it('ne touche pas le trust_score s\'il n\'y a aucune résa overdue', async () => {
    const f = await seedFixtures()  // pas de résa overdue
    await (await getJob())(log)
    expect(await trustScoreOf(f.userId)).toBe(100)
  })
})
