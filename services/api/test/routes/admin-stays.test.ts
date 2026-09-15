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

/**
 * Le super-admin, et le garde-fou de volume.
 *
 * Un admin de camping est scopé sur le sien : le `communeId` qu'il enverrait est
 * ignoré, et c'est testé plus haut. Le super-admin, lui, n'a pas de camping — il
 * doit le nommer, et se voir refuser l'import s'il l'oublie. Importer les
 * séjours d'un camping dans un autre ne se rattrape pas : les clients du second
 * pourraient ouvrir les casiers du premier.
 */
describe('super-admin', () => {
  async function seedSuperAdmin(): Promise<string> {
    const id = randomUUID()
    await pgSql`INSERT INTO users (id, firebase_uid, email, role)
      VALUES (${id}, ${'fb-' + id.slice(0, 8)}, ${id.slice(0, 8) + '@t.local'}, 'super_admin')`
    return `Bearer ${app.jwt.sign({ sub: id, role: 'super_admin' })}`
  }

  it('400 commune_id_required s\'il n\'a pas dit dans quel camping importer', async () => {
    const res = await app.inject({
      method: 'POST', url: '/v1/admin/stays/import',
      headers: { authorization: await seedSuperAdmin() },
      payload: { csv: CSV },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'commune_id_required' })

    const [{ count }] = await pgSql<{ count: string }[]>`SELECT count(*) FROM stays`
    expect(Number(count)).toBe(0)
  })

  /*
   * La lecture ne suit pas la même règle que l'import, et c'est délibéré.
   * Exiger un camping pour ÉCRIRE protège d'une erreur irrattrapable ; l'exiger
   * pour LIRE rendait simplement la page Séjours inutilisable au super-admin,
   * qui n'avait aucun moyen de fournir le paramètre. Ces deux tests fixent la
   * frontière, dans les deux sens.
   */
  it('sans camping désigné, il lit les séjours de TOUS les campings', async () => {
    const a = await seedCommune()
    const b = await seedCommune()
    await pgSql`INSERT INTO stays (id, commune_id, stay_ref, last_name, arrives_on, departs_on)
      VALUES (${randomUUID()}, ${a}, 'CHEZ-A', 'Alpha', CURRENT_DATE, CURRENT_DATE + 5)`
    await pgSql`INSERT INTO stays (id, commune_id, stay_ref, last_name, arrives_on, departs_on)
      VALUES (${randomUUID()}, ${b}, 'CHEZ-B', 'Bravo', CURRENT_DATE, CURRENT_DATE + 5)`

    const res = await app.inject({
      method: 'GET', url: '/v1/admin/stays',
      headers: { authorization: await seedSuperAdmin() },
    })
    expect(res.statusCode).toBe(200)
    const refs = res.json().map((r: { stayRef: string }) => r.stayRef).sort()
    expect(refs).toEqual(['CHEZ-A', 'CHEZ-B'])
    // Sans le nom du camping, deux références identiques seraient indiscernables.
    expect(res.json().every((r: { communeName: string | null }) => r.communeName)).toBe(true)
  })

  it('un admin de camping ne voit pas le voisin, même en réclamant son identifiant', async () => {
    const sien = await seedCommune()
    const voisin = await seedCommune()
    await pgSql`INSERT INTO stays (id, commune_id, stay_ref, last_name, arrives_on, departs_on)
      VALUES (${randomUUID()}, ${sien}, 'A-MOI', 'Alpha', CURRENT_DATE, CURRENT_DATE + 5)`
    await pgSql`INSERT INTO stays (id, commune_id, stay_ref, last_name, arrives_on, departs_on)
      VALUES (${randomUUID()}, ${voisin}, 'PAS-A-MOI', 'Bravo', CURRENT_DATE, CURRENT_DATE + 5)`

    const res = await app.inject({
      method: 'GET', url: `/v1/admin/stays?communeId=${voisin}`,
      headers: { authorization: await seedAdmin(sien) },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().map((r: { stayRef: string }) => r.stayRef)).toEqual(['A-MOI'])
  })

  it('importe dans le camping qu\'il désigne', async () => {
    const cible = await seedCommune()
    const res = await app.inject({
      method: 'POST', url: '/v1/admin/stays/import',
      headers: { authorization: await seedSuperAdmin() },
      payload: { csv: CSV, communeId: cible },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ inserted: 2 })

    const rows = await pgSql`SELECT commune_id FROM stays`
    expect(rows.every((r) => r.commune_id === cible)).toBe(true)
  })
})

describe('garde-fou de volume', () => {
  /**
   * 20 000 séjours, c'est déjà dix fois la saison d'un gros camping. Au-delà, le
   * fichier n'est pas un export de séjours : c'est un export de tout autre chose,
   * ou une boucle qui a mal tourné dans le PMS. On refuse plutôt que d'écrire.
   *
   * Les lignes sont volontairement courtes : le corps de requête doit rester
   * sous la limite de 1 Mio de Fastify, sinon on testerait le refus du serveur
   * HTTP au lieu du garde-fou de la route.
   */
  function csvDe(lignes: number): string {
    const out = ['Emplacement;Nom;Arrivée;Départ']
    for (let i = 0; i < lignes; i++) out.push(`${i};Martin;01/01/2027;02/01/2027`)
    return out.join('\n')
  }

  const TROP = 20_001

  it('400 too_many_rows à l\'aperçu', async () => {
    const res = await app.inject({
      method: 'POST', url: '/v1/admin/stays/preview',
      headers: { authorization: adminAuth },
      payload: { csv: csvDe(TROP) },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'too_many_rows' })
  })

  it('400 too_many_rows à l\'import, et rien n\'est écrit', async () => {
    const res = await app.inject({
      method: 'POST', url: '/v1/admin/stays/import',
      headers: { authorization: adminAuth },
      payload: { csv: csvDe(TROP) },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'too_many_rows' })

    const [{ count }] = await pgSql<{ count: string }[]>`SELECT count(*) FROM stays`
    expect(Number(count)).toBe(0)
  })
})
