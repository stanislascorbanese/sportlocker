/**
 * Emprunts côté exploitation — tests d'intégration.
 *
 * Deux choses valent d'être verrouillées ici : le cloisonnement entre campings
 * (un gérant ne doit jamais voir les clients d'un autre site), et le calcul du
 * temps écoulé, parce que trois écrans s'en servent pour décider ce qui remonte
 * comme « pas rentré ».
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

type Site = {
  communeId: string
  distributorId: string
  auth: string
}

async function seedSite(name = 'Camping Test'): Promise<Site> {
  const communeId = randomUUID()
  const insee = String(10000 + Math.floor(Math.random() * 70000))
  await pgSql`INSERT INTO communes (id, insee_code, name, postal_code, department, region)
    VALUES (${communeId}, ${insee}, ${name}, '85160', '85', 'PDL')`

  const distributorId = randomUUID()
  await pgSql`INSERT INTO distributors (id, serial_number, commune_id, name, status, locker_count)
    VALUES (${distributorId}, ${'SL-' + distributorId.slice(0, 8)}, ${communeId},
            'Terrain multisports', 'online', 8)`

  const userId = randomUUID()
  await pgSql`INSERT INTO users (id, firebase_uid, email, role, commune_id)
    VALUES (${userId}, ${'fb-' + userId.slice(0, 8)}, ${userId.slice(0, 8) + '@t.local'},
            'admin', ${communeId})`

  return {
    communeId,
    distributorId,
    auth: `Bearer ${app.jwt.sign({ sub: userId, role: 'admin', communeId })}`,
  }
}

/** Un emprunt complet : séjour, casier, article, ligne de prêt. */
async function seedLoan(
  site: Site,
  opts: { ref: string; lastName: string; hoursAgo?: number; returned?: boolean; position?: number } ,
): Promise<string> {
  const stayId = randomUUID()
  const today = new Date().toISOString().slice(0, 10)
  const later = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)
  await pgSql`INSERT INTO stays (id, commune_id, stay_ref, last_name, arrives_on, departs_on)
    VALUES (${stayId}, ${site.communeId}, ${opts.ref}, ${opts.lastName}, ${today}, ${later})`

  const position = opts.position ?? Math.floor(Math.random() * 1000)
  const lockerId = randomUUID()
  await pgSql`INSERT INTO lockers (id, distributor_id, position, state)
    VALUES (${lockerId}, ${site.distributorId}, ${position}, 'idle')`

  const typeId = randomUUID()
  await pgSql`INSERT INTO item_types (id, slug, name, category, caution_cents, max_duration_minutes)
    VALUES (${typeId}, ${'ballon-basket-' + typeId.slice(0, 6)}, 'Ballon de basket', 'sport', 0, 240)`

  const itemId = randomUUID()
  await pgSql`INSERT INTO items (id, item_type_id, rfid_tag)
    VALUES (${itemId}, ${typeId}, ${'rfid-' + itemId.slice(0, 10)})`

  const loanId = randomUUID()
  const borrowedAt = new Date(Date.now() - (opts.hoursAgo ?? 1) * 3_600_000)
  await pgSql`INSERT INTO loans (id, stay_id, distributor_id, locker_id, item_id, borrowed_at, returned_at)
    VALUES (${loanId}, ${stayId}, ${site.distributorId}, ${lockerId}, ${itemId},
            ${borrowedAt}, ${opts.returned ? new Date() : null})`
  return loanId
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
  await pgSql`TRUNCATE loans, stays, items, lockers, distributors, item_types, users, communes CASCADE`
})

describe('GET /v1/admin/loans', () => {
  it('liste ce qui est dehors, avec le nom et l\'emplacement du client', async () => {
    const site = await seedSite()
    await seedLoan(site, { ref: '214', lastName: 'Martin', hoursAgo: 3, position: 3 })

    const res = await app.inject({
      method: 'GET', url: '/v1/admin/loans', headers: { authorization: site.auth },
    })
    expect(res.statusCode).toBe(200)
    const [loan] = res.json()
    expect(loan.stay.stayRef).toBe('214')
    expect(loan.stay.lastName).toBe('Martin')
    expect(loan.item.label).toBe('Ballon de basket')
    expect(loan.item.kind).toBe('basket')
    // Position 3 en base = casier 4 peint sur la porte.
    expect(loan.lockerNumber).toBe(4)
    expect(loan.hoursOut).toBeGreaterThanOrEqual(2.9)
    expect(loan.returnedAt).toBeNull()
  })

  it('exclut par défaut ce qui est déjà rentré', async () => {
    const site = await seedSite()
    await seedLoan(site, { ref: '1', lastName: 'Dehors' })
    await seedLoan(site, { ref: '2', lastName: 'Rentre', returned: true })

    const open = await app.inject({
      method: 'GET', url: '/v1/admin/loans', headers: { authorization: site.auth },
    })
    expect(open.json()).toHaveLength(1)
    expect(open.json()[0].stay.lastName).toBe('Dehors')

    const all = await app.inject({
      method: 'GET', url: '/v1/admin/loans?status=all', headers: { authorization: site.auth },
    })
    expect(all.json()).toHaveLength(2)
  })

  it('filtre sur le temps passé dehors', async () => {
    const site = await seedSite()
    await seedLoan(site, { ref: '1', lastName: 'Recent', hoursAgo: 1 })
    await seedLoan(site, { ref: '2', lastName: 'Ancien', hoursAgo: 9 })

    const res = await app.inject({
      method: 'GET', url: '/v1/admin/loans?minHoursOut=4', headers: { authorization: site.auth },
    })
    expect(res.json()).toHaveLength(1)
    expect(res.json()[0].stay.lastName).toBe('Ancien')
  })

  it('ne montre jamais les clients d\'un autre camping', async () => {
    const a = await seedSite('Camping A')
    const b = await seedSite('Camping B')
    await seedLoan(a, { ref: 'A1', lastName: 'ChezA' })
    await seedLoan(b, { ref: 'B1', lastName: 'ChezB' })

    const res = await app.inject({
      method: 'GET', url: '/v1/admin/loans', headers: { authorization: a.auth },
    })
    const noms = res.json().map((l: { stay: { lastName: string } }) => l.stay.lastName)
    expect(noms).toEqual(['ChezA'])
  })
})

describe('POST /v1/admin/loans/:id/charge', () => {
  it('marque puis démarque un emprunt passé en compte séjour', async () => {
    const site = await seedSite()
    const loanId = await seedLoan(site, { ref: '214', lastName: 'Martin' })

    const marked = await app.inject({
      method: 'POST', url: `/v1/admin/loans/${loanId}/charge`,
      headers: { authorization: site.auth }, payload: { charged: true },
    })
    expect(marked.statusCode).toBe(200)
    expect(marked.json().chargedAt).not.toBeNull()

    const undone = await app.inject({
      method: 'POST', url: `/v1/admin/loans/${loanId}/charge`,
      headers: { authorization: site.auth }, payload: { charged: false },
    })
    expect(undone.json().chargedAt).toBeNull()
  })

  it('404 sur un emprunt d\'un autre camping — même message que s\'il n\'existait pas', async () => {
    const a = await seedSite('Camping A')
    const b = await seedSite('Camping B')
    const chezB = await seedLoan(b, { ref: 'B1', lastName: 'ChezB' })

    const res = await app.inject({
      method: 'POST', url: `/v1/admin/loans/${chezB}/charge`,
      headers: { authorization: a.auth }, payload: { charged: true },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('GET /v1/admin/loans/daily', () => {
  it('rend une valeur par jour, y compris les jours sans emprunt', async () => {
    const site = await seedSite()
    await seedLoan(site, { ref: '1', lastName: 'Aujourdhui', hoursAgo: 2 })

    const res = await app.inject({
      method: 'GET', url: '/v1/admin/loans/daily?days=7', headers: { authorization: site.auth },
    })
    expect(res.statusCode).toBe(200)
    const series = res.json()
    expect(series).toHaveLength(7)
    // Un jour creux vaut zéro, il ne disparaît pas de la série.
    expect(series.every((p: { count: number }) => typeof p.count === 'number')).toBe(true)
    expect(series.at(-1).count).toBe(1)
  })
})
