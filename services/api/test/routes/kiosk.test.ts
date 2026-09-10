/**
 * Tests d'intégration du parcours vacancier (`/v1/kiosk/*`).
 *
 * Couvre le parcours complet — je scanne, je m'identifie, j'emprunte, je rends —
 * et chacun des sept codes d'erreur du contrat, parce que l'app n'a que le code
 * pour choisir quoi afficher : un code faux donne un écran faux.
 *
 * Base de données : par défaut un conteneur Postgres jetable, comme le reste de
 * la suite. `TEST_PG_URL` permet de viser une base déjà lancée — utile sur une
 * machine sans Docker, où le reste de la suite ne tourne pas.
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

// ─── Fixtures ──────────────────────────────────────────────────────────────

async function seedCommune(): Promise<string> {
  const id = randomUUID()
  const insee = String(10000 + Math.floor(Math.random() * 70000))
  await pgSql`INSERT INTO communes (id, insee_code, name, postal_code, department, region)
    VALUES (${id}, ${insee}, 'Camping Test', '85160', '85', 'PDL')`
  return id
}

async function seedKiosk(communeId: string, lockerCount = 4): Promise<{ id: string; serial: string }> {
  const id = randomUUID()
  const serial = 'SL-' + id.slice(0, 8)
  await pgSql`INSERT INTO distributors
    (id, serial_number, commune_id, name, status, locker_count)
    VALUES (${id}, ${serial}, ${communeId}, 'Camping des Dunes', 'online', ${lockerCount})`
  return { id, serial }
}

async function seedLocker(distributorId: string, position: number): Promise<string> {
  const id = randomUUID()
  await pgSql`INSERT INTO lockers (id, distributor_id, position, state)
    VALUES (${id}, ${distributorId}, ${position}, 'idle')`
  return id
}

async function seedItemType(name: string, slug: string): Promise<string> {
  const id = randomUUID()
  await pgSql`INSERT INTO item_types (id, slug, name, category, caution_cents, max_duration_minutes)
    VALUES (${id}, ${slug + '-' + id.slice(0, 6)}, ${name}, 'sport', 0, 240)`
  return id
}

/** Pose un exemplaire dans un casier — c'est l'état « garni ». */
async function seedItemInLocker(itemTypeId: string, lockerId: string): Promise<string> {
  const id = randomUUID()
  await pgSql`INSERT INTO items (id, item_type_id, rfid_tag, current_locker_id)
    VALUES (${id}, ${itemTypeId}, ${'rfid-' + id.slice(0, 10)}, ${lockerId})`
  await pgSql`UPDATE lockers SET current_item_id = ${id} WHERE id = ${lockerId}`
  return id
}

async function seedStay(
  communeId: string,
  opts: { ref: string; lastName: string; firstName?: string; from?: string; to?: string } ,
): Promise<string> {
  const id = randomUUID()
  const from = opts.from ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const to = opts.to ?? new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)
  await pgSql`INSERT INTO stays (id, commune_id, stay_ref, last_name, first_name, arrives_on, departs_on)
    VALUES (${id}, ${communeId}, ${opts.ref}, ${opts.lastName}, ${opts.firstName ?? null}, ${from}, ${to})`
  return id
}

// ─── Boot ──────────────────────────────────────────────────────────────────

beforeAll(async () => {
  let databaseUrl = process.env.TEST_PG_URL
  if (!databaseUrl) {
    pgContainer = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('sportlocker_test')
      .withUsername('test')
      .withPassword('test')
      .start()
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
  await pgSql`TRUNCATE loans, stays, items, lockers, distributors, item_types, communes CASCADE`
})

// ─── GET /v1/kiosk/:serial ─────────────────────────────────────────────────

describe('GET /v1/kiosk/:serial', () => {
  it('renvoie le nom du camping et le contenu de la borne', async () => {
    const communeId = await seedCommune()
    const kiosk = await seedKiosk(communeId)
    const l0 = await seedLocker(kiosk.id, 0)
    const l1 = await seedLocker(kiosk.id, 1)
    const foot = await seedItemType('Ballon de football', 'ballon-foot')
    await seedItemInLocker(foot, l0)
    await seedItemInLocker(foot, l1)

    const res = await app.inject({ method: 'GET', url: `/v1/kiosk/${kiosk.serial}` })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.siteName).toBe('Camping des Dunes')
    const ballon = body.items.find((i: { itemTypeId: string }) => i.itemTypeId === foot)
    expect(ballon.available).toBe(2)
    expect(ballon.kind).toBe('ballon')
  })

  it('renvoie les types épuisés avec available: 0 plutôt que de les cacher', async () => {
    const communeId = await seedCommune()
    const kiosk = await seedKiosk(communeId)
    const raquette = await seedItemType('Raquette de badminton', 'raquette-badminton')

    const res = await app.inject({ method: 'GET', url: `/v1/kiosk/${kiosk.serial}` })
    const body = res.json()
    const row = body.items.find((i: { itemTypeId: string }) => i.itemTypeId === raquette)
    expect(row).toBeDefined()
    expect(row.available).toBe(0)
    expect(row.kind).toBe('raquette')
  })

  it('404 kiosk_not_found sur un numéro de série inconnu', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/kiosk/SL-INCONNU' })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: 'kiosk_not_found' })
  })
})

// ─── POST /identify ────────────────────────────────────────────────────────

describe('POST /v1/kiosk/:serial/identify', () => {
  it('accepte le nom sans tenir compte de la casse ni des accents', async () => {
    const communeId = await seedCommune()
    const kiosk = await seedKiosk(communeId)
    await seedStay(communeId, { ref: '214', lastName: 'Lefèvre', firstName: 'Camille' })

    for (const typed of ['Lefèvre', 'lefevre', 'LEFEVRE', '  Lefevre  ']) {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/kiosk/${kiosk.serial}/identify`,
        payload: { stayRef: '214', lastName: typed },
      })
      expect(res.statusCode, `saisie « ${typed} »`).toBe(200)
      expect(res.json().guestName).toBe('Camille Lefèvre')
      expect(res.json().activeLoan).toBeNull()
    }
  })

  it('accepte un nom composé saisi sans tiret ni apostrophe', async () => {
    const communeId = await seedCommune()
    const kiosk = await seedKiosk(communeId)
    await seedStay(communeId, { ref: '7', lastName: "D'Arc-Martin" })

    const res = await app.inject({
      method: 'POST',
      url: `/v1/kiosk/${kiosk.serial}/identify`,
      payload: { stayRef: '7', lastName: 'darcmartin' },
    })
    expect(res.statusCode).toBe(200)
  })

  it('404 stay_not_found si le nom ne correspond pas', async () => {
    const communeId = await seedCommune()
    const kiosk = await seedKiosk(communeId)
    await seedStay(communeId, { ref: '214', lastName: 'Martin' })

    const res = await app.inject({
      method: 'POST',
      url: `/v1/kiosk/${kiosk.serial}/identify`,
      payload: { stayRef: '214', lastName: 'Dupont' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: 'stay_not_found' })
  })

  it('404 stay_not_found pour un séjour déjà terminé', async () => {
    const communeId = await seedCommune()
    const kiosk = await seedKiosk(communeId)
    await seedStay(communeId, {
      ref: '99',
      lastName: 'Martin',
      from: '2020-07-01',
      to: '2020-07-14',
    })

    const res = await app.inject({
      method: 'POST',
      url: `/v1/kiosk/${kiosk.serial}/identify`,
      payload: { stayRef: '99', lastName: 'Martin' },
    })
    expect(res.statusCode).toBe(404)
  })

  it("ne trouve pas un séjour d'un autre camping", async () => {
    const communeA = await seedCommune()
    const communeB = await seedCommune()
    const kioskA = await seedKiosk(communeA)
    await seedStay(communeB, { ref: '214', lastName: 'Martin' })

    const res = await app.inject({
      method: 'POST',
      url: `/v1/kiosk/${kioskA.serial}/identify`,
      payload: { stayRef: '214', lastName: 'Martin' },
    })
    expect(res.statusCode).toBe(404)
  })
})

// ─── Parcours complet ──────────────────────────────────────────────────────

async function setupBorrowable() {
  const communeId = await seedCommune()
  const kiosk = await seedKiosk(communeId)
  const l0 = await seedLocker(kiosk.id, 0)
  const l1 = await seedLocker(kiosk.id, 1)
  const foot = await seedItemType('Ballon de football', 'ballon-foot')
  await seedItemInLocker(foot, l0)
  await seedStay(communeId, { ref: '214', lastName: 'Martin', firstName: 'Camille' })

  const ident = await app.inject({
    method: 'POST',
    url: `/v1/kiosk/${kiosk.serial}/identify`,
    payload: { stayRef: '214', lastName: 'Martin' },
  })
  return { communeId, kiosk, l0, l1, foot, stayId: ident.json().stayId as string }
}

describe('parcours complet', () => {
  it('emprunte, relit, puis rend', async () => {
    const { kiosk, foot, stayId } = await setupBorrowable()

    const loanRes = await app.inject({
      method: 'POST',
      url: `/v1/kiosk/${kiosk.serial}/loans`,
      payload: { stayId, itemTypeId: foot },
    })
    expect(loanRes.statusCode).toBe(200)
    const loan = loanRes.json()
    // Numéro peint sur la porte : position 0 en base = casier 1 sur la machine.
    expect(loan.lockerNumber).toBe(1)
    expect(loan.itemLabel).toBe('Ballon de football')
    expect(loan.kind).toBe('ballon')

    const get = await app.inject({ method: 'GET', url: `/v1/kiosk/loans/${loan.id}` })
    expect(get.statusCode).toBe(200)
    expect(get.json().id).toBe(loan.id)

    const ret = await app.inject({ method: 'POST', url: `/v1/kiosk/loans/${loan.id}/return` })
    expect(ret.statusCode).toBe(200)
    expect(typeof ret.json().lockerNumber).toBe('number')

    // Emprunt clôturé : l'app doit pouvoir effacer sa trace locale.
    const after = await app.inject({ method: 'GET', url: `/v1/kiosk/loans/${loan.id}` })
    expect(after.statusCode).toBe(404)
    expect(after.json()).toEqual({ error: 'loan_not_found' })
  })

  it('409 loan_already_active : un seul article dehors par séjour', async () => {
    const { kiosk, foot, stayId } = await setupBorrowable()
    const first = await app.inject({
      method: 'POST',
      url: `/v1/kiosk/${kiosk.serial}/loans`,
      payload: { stayId, itemTypeId: foot },
    })
    expect(first.statusCode).toBe(200)

    const second = await app.inject({
      method: 'POST',
      url: `/v1/kiosk/${kiosk.serial}/loans`,
      payload: { stayId, itemTypeId: foot },
    })
    expect(second.statusCode).toBe(409)
    expect(second.json()).toEqual({ error: 'loan_already_active' })
  })

  it("expose l'emprunt en cours au ré-identifiant", async () => {
    const { kiosk, foot, stayId } = await setupBorrowable()
    const loan = await app.inject({
      method: 'POST',
      url: `/v1/kiosk/${kiosk.serial}/loans`,
      payload: { stayId, itemTypeId: foot },
    })
    expect(loan.statusCode).toBe(200)

    const again = await app.inject({
      method: 'POST',
      url: `/v1/kiosk/${kiosk.serial}/identify`,
      payload: { stayRef: '214', lastName: 'Martin' },
    })
    expect(again.json().activeLoan.id).toBe(loan.json().id)
  })

  it('409 item_unavailable quand plus aucun exemplaire n\'est posé', async () => {
    const { kiosk, stayId } = await setupBorrowable()
    const absent = await seedItemType('Raquette de badminton', 'raquette-badminton')

    const res = await app.inject({
      method: 'POST',
      url: `/v1/kiosk/${kiosk.serial}/loans`,
      payload: { stayId, itemTypeId: absent },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toEqual({ error: 'item_unavailable' })
  })

  it('401 stay_not_found avec un stayId forgé', async () => {
    const { kiosk, foot } = await setupBorrowable()
    const res = await app.inject({
      method: 'POST',
      url: `/v1/kiosk/${kiosk.serial}/loans`,
      payload: { stayId: 'pas-un-jeton', itemTypeId: foot },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toEqual({ error: 'stay_not_found' })
  })

  it("401 stay_not_found si le jeton vient d'une autre borne", async () => {
    const { communeId, stayId } = await setupBorrowable()
    const other = await seedKiosk(communeId)
    const l = await seedLocker(other.id, 0)
    const type = await seedItemType('Ballon de volley', 'ballon-volley')
    await seedItemInLocker(type, l)

    const res = await app.inject({
      method: 'POST',
      url: `/v1/kiosk/${other.serial}/loans`,
      payload: { stayId, itemTypeId: type },
    })
    expect(res.statusCode).toBe(401)
  })

  it('404 loan_not_found sur un emprunt inexistant', async () => {
    const res = await app.inject({ method: 'GET', url: `/v1/kiosk/loans/${randomUUID()}` })
    expect(res.statusCode).toBe(404)
  })

  it('409 no_free_locker quand la borne est pleine au moment du retour', async () => {
    const communeId = await seedCommune()
    const kiosk = await seedKiosk(communeId, 1)
    const only = await seedLocker(kiosk.id, 0)
    const foot = await seedItemType('Ballon de football', 'ballon-foot')
    await seedItemInLocker(foot, only)
    await seedStay(communeId, { ref: '1', lastName: 'Martin' })

    const ident = await app.inject({
      method: 'POST',
      url: `/v1/kiosk/${kiosk.serial}/identify`,
      payload: { stayRef: '1', lastName: 'Martin' },
    })
    const loan = await app.inject({
      method: 'POST',
      url: `/v1/kiosk/${kiosk.serial}/loans`,
      payload: { stayId: ident.json().stayId, itemTypeId: foot },
    })
    expect(loan.statusCode).toBe(200)

    // On rebouche l'unique casier avec un autre article : plus de place.
    const autre = await seedItemType('Frisbee', 'frisbee')
    await seedItemInLocker(autre, only)
    await pgSql`UPDATE lockers SET state = 'idle' WHERE id = ${only}`

    const ret = await app.inject({ method: 'POST', url: `/v1/kiosk/loans/${loan.json().id}/return` })
    expect(ret.statusCode).toBe(409)
    expect(ret.json()).toEqual({ error: 'no_free_locker' })
  })
})

/**
 * Les deux chemins d'erreur du retour.
 *
 * Le parcours nominal est testé plus haut. Ces deux-là sont ceux qu'on rencontre
 * un dimanche de juillet : quelqu'un qui appuie deux fois, et une porte qui ne
 * répond pas. Ni l'un ni l'autre ne doit rendre un 500 — le vacancier est debout
 * devant la borne et il a besoin d'une phrase, pas d'une trace de pile.
 */
describe('retour — chemins d\'erreur', () => {
  it('404 quand l\'emprunt a déjà été rendu', async () => {
    const { kiosk, foot, stayId } = await setupBorrowable()

    const loan = await app.inject({
      method: 'POST',
      url: `/v1/kiosk/${kiosk.serial}/loans`,
      payload: { stayId, itemTypeId: foot },
    })
    const loanId = loan.json().id as string

    const premier = await app.inject({
      method: 'POST', url: `/v1/kiosk/loans/${loanId}/return`,
    })
    expect(premier.statusCode).toBe(200)

    // Double appui, ou le même lien rouvert depuis l'historique du téléphone.
    const second = await app.inject({
      method: 'POST', url: `/v1/kiosk/loans/${loanId}/return`,
    })
    expect(second.statusCode).toBe(404)
    expect(second.json()).toEqual({ error: 'loan_not_found' })
  })

  it('502 locker_stuck quand la borne ne confirme pas l\'ouverture', async () => {
    const { kiosk, foot, stayId } = await setupBorrowable()

    const loan = await app.inject({
      method: 'POST',
      url: `/v1/kiosk/${kiosk.serial}/loans`,
      payload: { stayId, itemTypeId: foot },
    })
    const loanId = loan.json().id as string

    // Sans broker, `openLocker` considère l'ouverture faite : c'est ce qui rend
    // tout le reste du fichier testable sans matériel. On lui en pose donc un
    // faux, dont la publication échoue tout de suite — le cas du broker
    // injoignable, sans attendre les huit secondes du délai de confirmation.
    const vrai = (app as { mqttSubscriber?: unknown }).mqttSubscriber
    ;(app as { mqttSubscriber?: unknown }).mqttSubscriber = {
      publish(_t: string, _p: string, _o: unknown, cb: (e?: Error | null) => void) {
        cb(new Error('broker down'))
      },
    }

    try {
      const res = await app.inject({
        method: 'POST', url: `/v1/kiosk/loans/${loanId}/return`,
      })
      expect(res.statusCode).toBe(502)
      expect(res.json()).toEqual({ error: 'locker_stuck' })

      // L'emprunt reste ouvert : on n'a pas rendu ce qu'on n'a pas pu déposer.
      const [row] = await pgSql`SELECT returned_at FROM loans WHERE id = ${loanId}`
      expect(row!.returned_at).toBeNull()
    } finally {
      ;(app as { mqttSubscriber?: unknown }).mqttSubscriber = vrai
    }
  })
})
