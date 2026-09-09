/**
 * Import des séjours — tests d'intégration.
 *
 * Le cas qui compte le plus est le redépôt : un gérant renvoie chaque semaine
 * l'export complet de la saison, pas seulement le delta. Un import qui créerait
 * des doublons casserait l'identification à la borne (deux séjours pour la même
 * référence) sans que personne ne s'en aperçoive avant le premier client bloqué.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { GenericContainer, type StartedTestContainer } from 'testcontainers'
import postgres from 'postgres'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..', '..', '..')
const SCHEMA_PATH = join(REPO_ROOT, 'database', 'schema.sql')
const MIGRATIONS = [
  join(REPO_ROOT, 'database', 'migrations', '0001_fn_locker_is_available.sql'),
  join(REPO_ROOT, 'database', 'migrations', '0021_stays_and_loans.sql'),
]

let pgContainer: StartedPostgreSqlContainer | undefined
let redisContainer: StartedTestContainer | undefined
let pgSql: ReturnType<typeof postgres>
let app: FastifyInstance
let communeId: string
let adminAuth: string

const CSV = [
  'Emplacement;Nom;Prénom;Arrivée;Départ',
  '214;Martin;Camille;14/07/2027;21/07/2027',
  'A12;Lefèvre;Jean;15/07/2027;22/07/2027',
].join('\n')

async function seedCommune(): Promise<string> {
  const id = randomUUID()
  const insee = String(10000 + Math.floor(Math.random() * 70000))
  await pgSql`INSERT INTO communes (id, insee_code, name, postal_code, department, region)
    VALUES (${id}, ${insee}, 'Camping Test', '85160', '85', 'PDL')`
  return id
}

async function seedAdmin(commune: string): Promise<string> {
  const id = randomUUID()
  await pgSql`INSERT INTO users (id, firebase_uid, email, role, commune_id)
    VALUES (${id}, ${'fb-' + id.slice(0, 8)}, ${id.slice(0, 8) + '@test.local'}, 'admin', ${commune})`
  return `Bearer ${app.jwt.sign({ sub: id, role: 'admin', communeId: commune })}`
}

beforeAll(async () => {
  let databaseUrl = process.env.TEST_PG_URL
  if (!databaseUrl) {
    pgContainer = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('sportlocker_test').withUsername('test').withPassword('test').start()
    databaseUrl = pgContainer.getConnectionUri()
  }
  let redisUrl = process.env.TEST_REDIS_URL
  if (!redisUrl) {
    redisContainer = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start()
    redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`
  }

  process.env.NODE_ENV = 'test'
  process.env.DATABASE_URL = databaseUrl
  process.env.REDIS_URL = redisUrl
  process.env.JWT_SESSION_SECRET = 'a'.repeat(64)
  process.env.JWT_DEVICE_SECRET = 'b'.repeat(64)
  process.env.LOG_LEVEL = 'fatal'

  pgSql = postgres(databaseUrl, { onnotice: () => {} })
  await pgSql.unsafe(readFileSync(SCHEMA_PATH, 'utf-8'))
  for (const m of MIGRATIONS) await pgSql.unsafe(readFileSync(m, 'utf-8'))

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
  await pgContainer?.stop()
  await redisContainer?.stop()
})

beforeEach(async () => {
  await pgSql`TRUNCATE loans, stays, users, communes CASCADE`
  communeId = await seedCommune()
  adminAuth = await seedAdmin(communeId)
})

describe('POST /v1/admin/stays/preview', () => {
  it('montre ce qui serait importé sans rien écrire', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/stays/preview',
      headers: { authorization: adminAuth },
      payload: { csv: CSV },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.totalRows).toBe(2)
    expect(body.separator).toBe(';')
    expect(body.mapping['Emplacement']).toBe('stayRef')

    const [{ count }] = await pgSql<{ count: string }[]>`SELECT count(*) FROM stays`
    expect(Number(count)).toBe(0)
  })

  it('refuse un utilisateur non admin', async () => {
    const id = randomUUID()
    await pgSql`INSERT INTO users (id, firebase_uid, email, role)
      VALUES (${id}, ${'fb-' + id.slice(0, 8)}, ${id.slice(0, 8) + '@t.local'}, 'citizen')`
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/stays/preview',
      headers: { authorization: `Bearer ${app.jwt.sign({ sub: id, role: 'citizen' })}` },
      payload: { csv: CSV },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('POST /v1/admin/stays/import', () => {
  it('importe les séjours du camping de l\'admin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/stays/import',
      headers: { authorization: adminAuth },
      payload: { csv: CSV },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ inserted: 2, updated: 0 })

    const rows = await pgSql`SELECT stay_ref, last_name, commune_id FROM stays ORDER BY stay_ref`
    expect(rows).toHaveLength(2)
    expect(rows[0]!.commune_id).toBe(communeId)
  })

  it('est idempotent : redéposer le même fichier ne crée pas de doublon', async () => {
    const once = await app.inject({
      method: 'POST', url: '/v1/admin/stays/import',
      headers: { authorization: adminAuth }, payload: { csv: CSV },
    })
    expect(once.json().inserted).toBe(2)

    const twice = await app.inject({
      method: 'POST', url: '/v1/admin/stays/import',
      headers: { authorization: adminAuth }, payload: { csv: CSV },
    })
    expect(twice.json()).toMatchObject({ inserted: 0, updated: 2 })

    const [{ count }] = await pgSql<{ count: string }[]>`SELECT count(*) FROM stays`
    expect(Number(count)).toBe(2)
  })

  it('met à jour un nom corrigé entre deux exports', async () => {
    await app.inject({
      method: 'POST', url: '/v1/admin/stays/import',
      headers: { authorization: adminAuth }, payload: { csv: CSV },
    })
    const corrected = CSV.replace('Martin;Camille', 'Martin-Dubois;Camille')
    await app.inject({
      method: 'POST', url: '/v1/admin/stays/import',
      headers: { authorization: adminAuth }, payload: { csv: corrected },
    })

    const [row] = await pgSql`SELECT last_name FROM stays WHERE stay_ref = '214'`
    expect(row!.last_name).toBe('Martin-Dubois')
  })

  it('remonte les lignes rejetées sans bloquer les bonnes', async () => {
    const csv = [
      'Emplacement;Nom;Arrivée;Départ',
      '1;Martin;14/07/2027;21/07/2027',
      '2;;14/07/2027;21/07/2027',
    ].join('\n')

    const res = await app.inject({
      method: 'POST', url: '/v1/admin/stays/import',
      headers: { authorization: adminAuth }, payload: { csv },
    })
    expect(res.json().inserted).toBe(1)
    expect(res.json().rejected).toHaveLength(1)
    expect(res.json().rejected[0].reason).toBe('missing_last_name')
  })

  it('400 no_valid_row quand rien n\'est exploitable', async () => {
    const res = await app.inject({
      method: 'POST', url: '/v1/admin/stays/import',
      headers: { authorization: adminAuth },
      payload: { csv: 'Montant;Solde\n180;0' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'no_valid_row' })
  })

  it('ignore le communeId envoyé par un admin — il reste sur son camping', async () => {
    const autre = await seedCommune()
    await app.inject({
      method: 'POST', url: '/v1/admin/stays/import',
      headers: { authorization: adminAuth },
      payload: { csv: CSV, communeId: autre },
    })
    const rows = await pgSql`SELECT commune_id FROM stays`
    expect(rows.every((r) => r.commune_id === communeId)).toBe(true)
  })
})

describe('GET /v1/admin/stays', () => {
  it('liste les séjours en cours ou à venir', async () => {
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
    const past = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
    await pgSql`INSERT INTO stays (commune_id, stay_ref, last_name, arrives_on, departs_on)
      VALUES (${communeId}, 'FUTUR', 'Martin', ${future}, ${future})`
    await pgSql`INSERT INTO stays (commune_id, stay_ref, last_name, arrives_on, departs_on)
      VALUES (${communeId}, 'PASSE', 'Durand', ${past}, ${past})`

    const res = await app.inject({
      method: 'GET', url: '/v1/admin/stays',
      headers: { authorization: adminAuth },
    })
    expect(res.statusCode).toBe(200)
    const refs = res.json().map((s: { stayRef: string }) => s.stayRef)
    expect(refs).toContain('FUTUR')
    expect(refs).not.toContain('PASSE')
  })
})
