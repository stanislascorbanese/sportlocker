/**
 * Tests d'intégration pour le job RGPD `runRgpdAnonymize`.
 *
 * Vérifie :
 *   - Anonymisation effective des users `gdpr_delete_requested_at < NOW() - 30j`
 *   - Préservation des users récents (demande < 30j → pas touchés)
 *   - Idempotence (un user déjà anonymisé n'est pas re-touché)
 *   - Champs PII effacés (email pseudonymisé, firebase_uid pseudonymisé,
 *     display_name/phone/banned_reason/last_active_at → NULL)
 *   - Champs préservés (id, created_at, role, commune_id, trust_score,
 *     total_reservations, is_banned, gdpr_delete_requested_at)
 *   - Effacement des comments de reviews du user
 *   - Window tunable via RGPD_ANONYMIZE_AFTER_DAYS
 *
 * Pattern : testcontainers Postgres direct (pas besoin d'app Fastify ni
 * Redis ici — le job parle uniquement à `db`). On instancie une fois
 * Postgres au beforeAll et on TRUNCATE entre tests.
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

// Logger no-op typé pour le job.
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
  // Applique toutes les migrations dans l'ordre (idempotent)
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
  // Truncate dans l'ordre qui respecte les FK (reviews → reservations → users → communes)
  await pgSql`TRUNCATE TABLE reviews, locker_events, reservations, lockers, items, item_types, distributors, users, communes RESTART IDENTITY CASCADE`
})

// Import dynamique après que les env vars soient posées
async function getJob() {
  return (await import('../../src/queues/rgpd-anonymize.js')).runRgpdAnonymize
}

async function seedUserWithGdpr(opts: {
  requestedDaysAgo: number | null
  alreadyDeleted?: boolean
  displayName?: string
  phone?: string
  bannedReason?: string
}): Promise<{ id: string; email: string; firebaseUid: string }> {
  const id = randomUUID()
  const email = id.slice(0, 8) + '@test.local'
  const firebaseUid = 'fb-' + id.slice(0, 8)
  const requestedAt = opts.requestedDaysAgo === null
    ? null
    : new Date(Date.now() - opts.requestedDaysAgo * 24 * 60 * 60 * 1000)
  const deletedAt = opts.alreadyDeleted ? new Date() : null

  await pgSql`
    INSERT INTO users (id, firebase_uid, email, display_name, phone, role, banned_reason,
                       last_active_at, gdpr_delete_requested_at, gdpr_deleted_at)
    VALUES (${id}, ${firebaseUid}, ${email}, ${opts.displayName ?? null}, ${opts.phone ?? null},
            'citizen', ${opts.bannedReason ?? null}, NOW(), ${requestedAt}, ${deletedAt})
  `
  return { id, email, firebaseUid }
}

describe('runRgpdAnonymize', () => {
  it('anonymise un user dont la demande RGPD a > 30 jours', async () => {
    const u = await seedUserWithGdpr({
      requestedDaysAgo: 31,
      displayName: 'Jean Test',
      phone: '+33600000000',
      bannedReason: 'spam comportemental',
    })

    await (await getJob())(log)

    const [row] = await pgSql<{
      email: string; firebase_uid: string; display_name: string | null;
      phone: string | null; banned_reason: string | null;
      last_active_at: Date | null; gdpr_deleted_at: Date | null;
    }[]>`SELECT email, firebase_uid, display_name, phone, banned_reason,
                last_active_at, gdpr_deleted_at FROM users WHERE id = ${u.id}`

    expect(row!.email).toBe(`deleted-${u.id}@anonymized.local`)
    expect(row!.firebase_uid).toBe(`deleted-${u.id}`)
    expect(row!.display_name).toBeNull()
    expect(row!.phone).toBeNull()
    expect(row!.banned_reason).toBeNull()
    expect(row!.last_active_at).toBeNull()
    expect(row!.gdpr_deleted_at).not.toBeNull()
  })

  it('NE touche PAS un user dont la demande est récente (< 30 jours)', async () => {
    const u = await seedUserWithGdpr({ requestedDaysAgo: 15, displayName: 'Récent' })

    await (await getJob())(log)

    const [row] = await pgSql<{ email: string; display_name: string | null; gdpr_deleted_at: Date | null }[]>`
      SELECT email, display_name, gdpr_deleted_at FROM users WHERE id = ${u.id}`

    expect(row!.email).toBe(u.email)
    expect(row!.display_name).toBe('Récent')
    expect(row!.gdpr_deleted_at).toBeNull()
  })

  it('NE touche PAS un user sans demande RGPD', async () => {
    const u = await seedUserWithGdpr({ requestedDaysAgo: null, displayName: 'Sans demande' })

    await (await getJob())(log)

    const [row] = await pgSql<{ email: string; gdpr_deleted_at: Date | null }[]>`
      SELECT email, gdpr_deleted_at FROM users WHERE id = ${u.id}`

    expect(row!.email).toBe(u.email)
    expect(row!.gdpr_deleted_at).toBeNull()
  })

  it('est idempotent : un user déjà anonymisé n\'est pas re-touché', async () => {
    const u = await seedUserWithGdpr({
      requestedDaysAgo: 60,
      alreadyDeleted: true,
      displayName: 'Déjà fait',
    })

    // Snapshot avant
    const [before] = await pgSql<{ email: string; gdpr_deleted_at: Date }[]>`
      SELECT email, gdpr_deleted_at FROM users WHERE id = ${u.id}`

    await (await getJob())(log)

    const [after] = await pgSql<{ email: string; gdpr_deleted_at: Date }[]>`
      SELECT email, gdpr_deleted_at FROM users WHERE id = ${u.id}`

    // gdpr_deleted_at ne doit pas avoir bougé (timestamp inchangé)
    expect(after!.email).toBe(before!.email)
    expect(after!.gdpr_deleted_at.getTime()).toBe(before!.gdpr_deleted_at.getTime())
  })

  it('préserve les champs non-PII (role, commune_id, trust_score, total_reservations, is_banned)', async () => {
    const id = randomUUID()
    const email = id.slice(0, 8) + '@test.local'
    await pgSql`INSERT INTO communes (id, insee_code, name, postal_code, department, region)
      VALUES (${randomUUID()}, '75011', 'Paris 11e', '75011', '75', 'IDF')`
    const [{ id: communeId }] = await pgSql<{ id: string }[]>`SELECT id FROM communes LIMIT 1`
    await pgSql`
      INSERT INTO users (id, firebase_uid, email, role, commune_id, trust_score,
                         total_reservations, is_banned, gdpr_delete_requested_at)
      VALUES (${id}, 'fb-' || ${id}, ${email}, 'citizen', ${communeId},
              72, 14, true, NOW() - INTERVAL '31 days')
    `

    await (await getJob())(log)

    const [row] = await pgSql<{
      role: string; commune_id: string; trust_score: number;
      total_reservations: number; is_banned: boolean;
    }[]>`SELECT role, commune_id, trust_score, total_reservations, is_banned
         FROM users WHERE id = ${id}`

    expect(row!.role).toBe('citizen')
    expect(row!.commune_id).toBe(communeId)
    expect(row!.trust_score).toBe(72)
    expect(row!.total_reservations).toBe(14)
    expect(row!.is_banned).toBe(true)
  })

  it('efface les comments de reviews du user anonymisé', async () => {
    const u = await seedUserWithGdpr({ requestedDaysAgo: 35 })

    // Crée une commune + distributeur + locker + item_type + item + reservation pour le user
    const communeId = randomUUID()
    await pgSql`INSERT INTO communes (id, insee_code, name, postal_code, department, region)
      VALUES (${communeId}, '69001', 'Lyon 1', '69001', '69', 'ARA')`
    const distributorId = randomUUID()
    await pgSql`INSERT INTO distributors (id, serial_number, commune_id, name, locker_count)
      VALUES (${distributorId}, 'SL-TEST-001', ${communeId}, 'TestDist', 4)`
    const lockerId = randomUUID()
    await pgSql`INSERT INTO lockers (id, distributor_id, position, state)
      VALUES (${lockerId}, ${distributorId}, 0, 'idle')`
    const itemTypeId = randomUUID()
    await pgSql`INSERT INTO item_types (id, slug, name, category)
      VALUES (${itemTypeId}, 'ballon', 'Ballon', 'sport')`
    const itemId = randomUUID()
    await pgSql`INSERT INTO items (id, item_type_id, rfid_tag) VALUES (${itemId}, ${itemTypeId}, 'RFID-A')`
    const reservationId = randomUUID()
    await pgSql`INSERT INTO reservations (id, user_id, locker_id, item_id, distributor_id,
                                          status, qr_jti, expires_at)
      VALUES (${reservationId}, ${u.id}, ${lockerId}, ${itemId}, ${distributorId},
              'returned', 'jti-test', NOW())`
    const reviewId = randomUUID()
    await pgSql`INSERT INTO reviews (id, reservation_id, user_id, rating, comment)
      VALUES (${reviewId}, ${reservationId}, ${u.id}, 4, 'Mon avis personnel détaillé')`

    await (await getJob())(log)

    const [row] = await pgSql<{ comment: string | null; rating: number }[]>`
      SELECT comment, rating FROM reviews WHERE id = ${reviewId}`

    expect(row!.comment).toBeNull()
    expect(row!.rating).toBe(4)  // rating numérique préservé (pas PII)
  })

  it('respecte la fenêtre RGPD_ANONYMIZE_AFTER_DAYS', async () => {
    // User à -15 jours : ne serait pas anonymisé en mode défaut (30j)
    const u = await seedUserWithGdpr({ requestedDaysAgo: 15, displayName: 'Pile-poil' })

    // Force la fenêtre à 10 jours
    const old = process.env['RGPD_ANONYMIZE_AFTER_DAYS']
    process.env['RGPD_ANONYMIZE_AFTER_DAYS'] = '10'

    try {
      await (await getJob())(log)
    } finally {
      if (old === undefined) delete process.env['RGPD_ANONYMIZE_AFTER_DAYS']
      else process.env['RGPD_ANONYMIZE_AFTER_DAYS'] = old
    }

    const [row] = await pgSql<{ email: string; gdpr_deleted_at: Date | null }[]>`
      SELECT email, gdpr_deleted_at FROM users WHERE id = ${u.id}`

    expect(row!.email).toBe(`deleted-${u.id}@anonymized.local`)
    expect(row!.gdpr_deleted_at).not.toBeNull()
  })

  it('fallback à 30 jours si RGPD_ANONYMIZE_AFTER_DAYS est invalide', async () => {
    const u = await seedUserWithGdpr({ requestedDaysAgo: 31, displayName: 'Standard 30j' })

    const old = process.env['RGPD_ANONYMIZE_AFTER_DAYS']
    process.env['RGPD_ANONYMIZE_AFTER_DAYS'] = 'pasunentier'

    try {
      await (await getJob())(log)
    } finally {
      if (old === undefined) delete process.env['RGPD_ANONYMIZE_AFTER_DAYS']
      else process.env['RGPD_ANONYMIZE_AFTER_DAYS'] = old
    }

    // Anonymisé car > 30j (fenêtre fallback)
    const [row] = await pgSql<{ email: string }[]>`SELECT email FROM users WHERE id = ${u.id}`
    expect(row!.email).toBe(`deleted-${u.id}@anonymized.local`)
  })

  it('traite plusieurs users dans un seul run', async () => {
    const u1 = await seedUserWithGdpr({ requestedDaysAgo: 31, displayName: 'A' })
    const u2 = await seedUserWithGdpr({ requestedDaysAgo: 45, displayName: 'B' })
    const u3 = await seedUserWithGdpr({ requestedDaysAgo: 60, displayName: 'C' })
    // Ce 4e ne doit pas être touché
    const u4 = await seedUserWithGdpr({ requestedDaysAgo: 5, displayName: 'D-pas-touche' })

    await (await getJob())(log)

    const rows = await pgSql<{ id: string; display_name: string | null; gdpr_deleted_at: Date | null }[]>`
      SELECT id, display_name, gdpr_deleted_at FROM users WHERE id IN (${u1.id}, ${u2.id}, ${u3.id}, ${u4.id})`

    const byId = new Map(rows.map((r) => [r.id, r]))
    expect(byId.get(u1.id)!.gdpr_deleted_at).not.toBeNull()
    expect(byId.get(u1.id)!.display_name).toBeNull()
    expect(byId.get(u2.id)!.gdpr_deleted_at).not.toBeNull()
    expect(byId.get(u3.id)!.gdpr_deleted_at).not.toBeNull()
    expect(byId.get(u4.id)!.gdpr_deleted_at).toBeNull()
    expect(byId.get(u4.id)!.display_name).toBe('D-pas-touche')
  })
})
