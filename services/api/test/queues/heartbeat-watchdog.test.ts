/**
 * Tests d'intégration pour le cron `runHeartbeatWatchdog`.
 *
 * Couvre le comportement core :
 *   - Flip des distributeurs `online` dont `last_seen_at < NOW() - 5 min`
 *   - Création d'un ticket auto-source (severity 5, opened_by NULL) pour chaque
 *     distributeur flippé
 *   - Idempotence : ne crée pas de doublon de ticket si un précédent auto-ticket
 *     non-résolu existe dans les 24h
 *   - Ne flip PAS les distributeurs `offline` (pas de re-trigger) ni les
 *     `online` avec heartbeat récent
 *   - L'envoi d'e-mail est skip silencieusement quand isEmailConfigured()=false
 *     (cas par défaut en test) — ne fait pas crasher le job
 *
 * Pattern : testcontainers Postgres, no Redis, no Resend (RESEND_API_KEY absent
 * en test → sendEmail n'est jamais appelé).
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

// Logger silencieux pour ne pas polluer la sortie de test.
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
  process.env.REDIS_URL = 'redis://localhost:6379'  // pas utilisé
  process.env.JWT_SESSION_SECRET = 'a'.repeat(64)
  process.env.JWT_DEVICE_SECRET = 'b'.repeat(64)
  process.env.LOG_LEVEL = 'fatal'
  // RESEND_API_KEY volontairement absent → sendEmail() ne sera pas tenté.
  delete process.env.RESEND_API_KEY

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
  await pgSql`TRUNCATE TABLE maintenance_tickets, distributor_heartbeats,
                            locker_events, lockers, distributors, communes
              RESTART IDENTITY CASCADE`
})

async function getJob() {
  return (await import('../../src/queues/heartbeat-watchdog.js')).runHeartbeatWatchdog
}

async function seedCommune(opts?: { contactEmail?: string | null }): Promise<string> {
  const id = randomUUID()
  await pgSql`
    INSERT INTO communes (id, insee_code, name, postal_code, department, region, contact_email)
    VALUES (${id}, ${'7' + Math.floor(Math.random() * 9000 + 1000).toString()}, 'Test Commune',
            '75001', '75', 'IDF', ${opts?.contactEmail ?? null})`
  return id
}

async function seedDistributor(opts: {
  communeId: string
  status?: 'online' | 'offline'
  lastSeenMinutesAgo?: number | null
  name?: string
}): Promise<string> {
  const id = randomUUID()
  const lastSeen = opts.lastSeenMinutesAgo === null || opts.lastSeenMinutesAgo === undefined
    ? null
    : new Date(Date.now() - opts.lastSeenMinutesAgo * 60 * 1000)
  await pgSql`
    INSERT INTO distributors (id, serial_number, commune_id, name, locker_count, status, last_seen_at)
    VALUES (${id}, ${'SL-' + id.slice(0, 8)}, ${opts.communeId}, ${opts.name ?? 'Distributeur Test'},
            8, ${opts.status ?? 'online'}, ${lastSeen})`
  return id
}

describe('runHeartbeatWatchdog', () => {
  it('flippe à offline un distributeur online avec heartbeat > 5 min', async () => {
    const communeId = await seedCommune()
    const distId = await seedDistributor({ communeId, status: 'online', lastSeenMinutesAgo: 10 })

    const run = await getJob()
    await run(log)

    const [row] = await pgSql<{ status: string }[]>`SELECT status FROM distributors WHERE id = ${distId}`
    expect(row?.status).toBe('offline')
  })

  it("ne flippe PAS un distributeur online avec heartbeat récent (< 5 min)", async () => {
    const communeId = await seedCommune()
    const distId = await seedDistributor({ communeId, status: 'online', lastSeenMinutesAgo: 2 })

    const run = await getJob()
    await run(log)

    const [row] = await pgSql<{ status: string }[]>`SELECT status FROM distributors WHERE id = ${distId}`
    expect(row?.status).toBe('online')
  })

  it("ne re-flippe PAS un distributeur déjà offline (n'émet pas de doublon ticket)", async () => {
    const communeId = await seedCommune()
    const distId = await seedDistributor({ communeId, status: 'offline', lastSeenMinutesAgo: 60 })

    const run = await getJob()
    await run(log)

    const [{ count: ticketCount }] = await pgSql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM maintenance_tickets WHERE distributor_id = ${distId}`
    expect(ticketCount).toBe(0)
  })

  it("crée un ticket auto-source (severity 5, opened_by NULL) sur flip online → offline", async () => {
    const communeId = await seedCommune()
    const distId = await seedDistributor({
      communeId, status: 'online', lastSeenMinutesAgo: 10, name: 'Square Test',
    })

    const run = await getJob()
    await run(log)

    const tickets = await pgSql<{
      severity: number; status: string; title: string; opened_by: string | null
    }[]>`
      SELECT severity, status, title, opened_by
      FROM maintenance_tickets WHERE distributor_id = ${distId}`
    expect(tickets).toHaveLength(1)
    expect(tickets[0]!.severity).toBe(5)
    expect(tickets[0]!.status).toBe('open')
    expect(tickets[0]!.opened_by).toBeNull()
    expect(tickets[0]!.title).toContain('Square Test')
  })

  it("idempotence : n'ouvre pas un 2ᵉ ticket auto si un précédent non-résolu existe (< 24h)", async () => {
    const communeId = await seedCommune()
    const distId = await seedDistributor({ communeId, status: 'online', lastSeenMinutesAgo: 10 })

    const run = await getJob()
    // 1er run : flip + ticket créé. Le distributeur passe offline.
    await run(log)
    // On force re-flip : remettre online + last_seen vieux pour re-trigger
    // (cas pathologique : flap online/offline rapide).
    await pgSql`UPDATE distributors
                SET status = 'online', last_seen_at = NOW() - INTERVAL '10 minutes'
                WHERE id = ${distId}`
    // 2ᵉ run : doit re-flipper en offline mais NE PAS créer de 2ᵉ ticket.
    await run(log)

    const [{ count: ticketCount }] = await pgSql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM maintenance_tickets WHERE distributor_id = ${distId}`
    expect(ticketCount).toBe(1)
  })

  it("rouvre un nouveau ticket si l'ancien est résolu et le distributeur re-tombe", async () => {
    const communeId = await seedCommune()
    const distId = await seedDistributor({ communeId, status: 'online', lastSeenMinutesAgo: 10 })

    const run = await getJob()
    await run(log)
    // Ops a résolu le 1er ticket et le distributeur a repris du service —
    // simulé en passant le ticket à 'resolved'.
    await pgSql`UPDATE maintenance_tickets SET status = 'resolved', resolved_at = NOW()
                WHERE distributor_id = ${distId}`
    // Distributeur retombe.
    await pgSql`UPDATE distributors
                SET status = 'online', last_seen_at = NOW() - INTERVAL '10 minutes'
                WHERE id = ${distId}`
    await run(log)

    const [{ count: ticketCount }] = await pgSql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM maintenance_tickets WHERE distributor_id = ${distId}`
    expect(ticketCount).toBe(2)
  })

  it("ne crash pas si la commune n'a pas de contact_email (skip silencieux)", async () => {
    const communeId = await seedCommune({ contactEmail: null })
    const distId = await seedDistributor({ communeId, status: 'online', lastSeenMinutesAgo: 10 })

    const run = await getJob()
    // Sans contact_email, l'envoi d'e-mail est skip mais le ticket doit
    // toujours être créé et le statut basculer.
    await expect(run(log)).resolves.toBeUndefined()
    const [{ status }] = await pgSql<{ status: string }[]>`
      SELECT status FROM distributors WHERE id = ${distId}`
    expect(status).toBe('offline')
    const [{ count }] = await pgSql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM maintenance_tickets WHERE distributor_id = ${distId}`
    expect(count).toBe(1)
  })

  it("traite plusieurs distributeurs offline sur un même tick", async () => {
    const communeId = await seedCommune()
    const d1 = await seedDistributor({ communeId, status: 'online', lastSeenMinutesAgo: 10 })
    const d2 = await seedDistributor({ communeId, status: 'online', lastSeenMinutesAgo: 30 })
    // Distributeur récent — ne doit pas être flip.
    const d3 = await seedDistributor({ communeId, status: 'online', lastSeenMinutesAgo: 1 })

    const run = await getJob()
    await run(log)

    const rows = await pgSql<{ id: string; status: string }[]>`
      SELECT id, status FROM distributors ORDER BY id`
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.status]))
    expect(byId[d1]).toBe('offline')
    expect(byId[d2]).toBe('offline')
    expect(byId[d3]).toBe('online')

    const [{ count }] = await pgSql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM maintenance_tickets WHERE opened_by IS NULL`
    expect(count).toBe(2)
  })
})
