/**
 * Tests d'intégration de la boucle de feedback citoyen :
 *   - POST /v1/reservations/:id/review  (dépôt d'avis)
 *   - GET  /v1/distributors/:id/reviews (liste publique + agrégats)
 *
 * Stack identique à reservations.test.ts : Postgres 16 + Redis 7 via
 * testcontainers, schema.sql appliqué au boot, TRUNCATE entre tests,
 * `app.inject(...)` (pas de port), JWT de session forgé via `app.jwt.sign`.
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
const MIGRATION_PATHS = [
  join(REPO_ROOT, 'database', 'migrations', '0001_fn_locker_is_available.sql'),
  join(REPO_ROOT, 'database', 'migrations', '0018_reservations_unique_active.sql'),
]

let pgContainer: StartedPostgreSqlContainer
let redisContainer: StartedTestContainer
let pgSql: ReturnType<typeof postgres>
let redisClient: IORedis
let app: FastifyInstance

interface Fixtures {
  userId: string
  communeId: string
  distributorId: string
  itemTypeId: string
  itemId: string
  lockerId: string
}

/** Seed le socle commun (user + commune + distributeur + item + casier). */
async function seedAll(displayName: string | null = 'Marie Lambert'): Promise<Fixtures> {
  const userId = randomUUID()
  const communeId = randomUUID()
  const distributorId = randomUUID()
  const itemTypeId = randomUUID()
  const itemId = randomUUID()
  const lockerId = randomUUID()

  await pgSql`INSERT INTO users (id, firebase_uid, email, display_name)
    VALUES (${userId}, ${'fb-' + userId.slice(0, 8)}, ${userId.slice(0, 8) + '@test.local'},
            ${displayName})`

  await pgSql`INSERT INTO communes (id, insee_code, name, postal_code, department, region)
    VALUES (${communeId}, ${'7' + Math.floor(Math.random() * 9000 + 1000)},
            'Paris Test', '75001', '75', 'IDF')`

  await pgSql`INSERT INTO distributors (id, serial_number, commune_id, name, latitude, longitude, locker_count)
    VALUES (${distributorId}, ${'TEST-' + distributorId.slice(0, 8)}, ${communeId},
            'Test Distributor', 48.8566, 2.3522, 4)`

  await pgSql`INSERT INTO item_types (id, slug, name, category)
    VALUES (${itemTypeId}, ${'slug-' + itemTypeId.slice(0, 8)}, 'Ballon de foot', 'ballon')`

  await pgSql`INSERT INTO items (id, item_type_id, rfid_tag)
    VALUES (${itemId}, ${itemTypeId}, ${'RFID-' + itemId.slice(0, 8)})`

  await pgSql`INSERT INTO lockers (id, distributor_id, position, state, current_item_id)
    VALUES (${lockerId}, ${distributorId}, 0, 'idle', ${itemId})`

  return { userId, communeId, distributorId, itemTypeId, itemId, lockerId }
}

/** Insère une réservation dans le statut voulu et renvoie son id. */
async function seedReservation(
  f: Fixtures,
  status: string,
  opts: { userId?: string } = {},
): Promise<string> {
  const reservationId = randomUUID()
  const owner = opts.userId ?? f.userId
  await pgSql`INSERT INTO reservations
    (id, user_id, locker_id, item_id, distributor_id, status, qr_jti, expires_at, returned_at)
    VALUES (${reservationId}, ${owner}, ${f.lockerId}, ${f.itemId}, ${f.distributorId},
            ${status}, ${randomUUID()}, NOW() + INTERVAL '15 minutes',
            ${status === 'returned' ? pgSql`NOW()` : null})`
  return reservationId
}

function authHeader(userId: string): string {
  return `Bearer ${app.jwt.sign({ sub: userId, role: 'citizen' })}`
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
  for (const p of MIGRATION_PATHS) {
    await pgSql.unsafe(readFileSync(p, 'utf-8'))
  }

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
      queues.rgpdAnonymize.close(),
    ])
  } catch {
    /* ignore */
  }
  try {
    const { redis } = await import('../../src/redis/client.js')
    await redis.quit()
  } catch {
    /* ignore */
  }
  await pgSql?.end({ timeout: 5 })
  await redisClient?.quit()
  await pgContainer?.stop()
  await redisContainer?.stop()
})

beforeEach(async () => {
  await pgSql`TRUNCATE TABLE
    communes, users, distributors, lockers, items, item_types,
    reservations, token_nonces, locker_events, distributor_heartbeats,
    maintenance_tickets, push_tokens, notification_logs, reviews
    RESTART IDENTITY CASCADE`
  await redisClient.flushdb()
})

describe('POST /v1/reservations/:id/review', () => {
  it('crée un avis (note + commentaire) et renvoie 201', async () => {
    const f = await seedAll()
    const reservationId = await seedReservation(f, 'returned')

    const res = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${reservationId}/review`,
      headers: { authorization: authHeader(f.userId) },
      payload: { rating: 5, comment: 'Super expérience, matériel nickel !' },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.reservationId).toBe(reservationId)
    expect(body.rating).toBe(5)
    expect(body.comment).toBe('Super expérience, matériel nickel !')

    const rows = await pgSql`SELECT rating, comment, user_id FROM reviews
                              WHERE reservation_id = ${reservationId}`
    expect(rows).toHaveLength(1)
    expect(rows[0]!.rating).toBe(5)
    expect(rows[0]!.user_id).toBe(f.userId)
  })

  it('accepte un avis sans commentaire (comment → null)', async () => {
    const f = await seedAll()
    const reservationId = await seedReservation(f, 'returned')

    const res = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${reservationId}/review`,
      headers: { authorization: authHeader(f.userId) },
      payload: { rating: 4 },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().comment).toBeNull()
  })

  it('normalise un commentaire vide/espaces en null', async () => {
    const f = await seedAll()
    const reservationId = await seedReservation(f, 'returned')

    const res = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${reservationId}/review`,
      headers: { authorization: authHeader(f.userId) },
      payload: { rating: 3, comment: '   ' },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().comment).toBeNull()
  })

  it('renvoie 409 reservation_not_reviewable si la résa n\'est pas returned', async () => {
    const f = await seedAll()
    const reservationId = await seedReservation(f, 'active')

    const res = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${reservationId}/review`,
      headers: { authorization: authHeader(f.userId) },
      payload: { rating: 5 },
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().error).toBe('reservation_not_reviewable')
  })

  it('renvoie 409 review_already_exists au second avis', async () => {
    const f = await seedAll()
    const reservationId = await seedReservation(f, 'returned')

    const first = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${reservationId}/review`,
      headers: { authorization: authHeader(f.userId) },
      payload: { rating: 5 },
    })
    expect(first.statusCode).toBe(201)

    const second = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${reservationId}/review`,
      headers: { authorization: authHeader(f.userId) },
      payload: { rating: 1, comment: 'je change d\'avis' },
    })
    expect(second.statusCode).toBe(409)
    expect(second.json().error).toBe('review_already_exists')

    // L'avis original n'a pas bougé.
    const rows = await pgSql`SELECT rating FROM reviews WHERE reservation_id = ${reservationId}`
    expect(rows).toHaveLength(1)
    expect(rows[0]!.rating).toBe(5)
  })

  it('sérialise deux envois concurrents : exactement un 201, le reste 409', async () => {
    const f = await seedAll()
    const reservationId = await seedReservation(f, 'returned')

    const attempts = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        app.inject({
          method: 'POST',
          url: `/v1/reservations/${reservationId}/review`,
          headers: { authorization: authHeader(f.userId) },
          payload: { rating: ((i % 5) + 1), comment: `envoi ${i}` },
        }),
      ),
    )

    const created = attempts.filter((r) => r.statusCode === 201)
    const conflicts = attempts.filter((r) => r.statusCode === 409)
    expect(created).toHaveLength(1)
    expect(conflicts).toHaveLength(5)
    for (const c of conflicts) {
      expect(c.json().error).toBe('review_already_exists')
    }

    const rows = await pgSql`SELECT id FROM reviews WHERE reservation_id = ${reservationId}`
    expect(rows).toHaveLength(1)
  })

  it('renvoie 404 si la réservation n\'existe pas', async () => {
    const f = await seedAll()
    const res = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${randomUUID()}/review`,
      headers: { authorization: authHeader(f.userId) },
      payload: { rating: 5 },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('reservation_not_found')
  })

  it('renvoie 404 quand un autre user tente de noter la résa (anti-énumération)', async () => {
    const f = await seedAll()
    const reservationId = await seedReservation(f, 'returned')

    const otherUserId = randomUUID()
    await pgSql`INSERT INTO users (id, firebase_uid, email)
      VALUES (${otherUserId}, ${'fb-' + otherUserId.slice(0, 8)}, ${'attacker@test.local'})`

    const res = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${reservationId}/review`,
      headers: { authorization: authHeader(otherUserId) },
      payload: { rating: 1 },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('reservation_not_found')

    const rows = await pgSql`SELECT id FROM reviews WHERE reservation_id = ${reservationId}`
    expect(rows).toHaveLength(0)
  })

  it('renvoie 400 si la note est hors bornes (0 ou 6)', async () => {
    const f = await seedAll()
    const reservationId = await seedReservation(f, 'returned')

    for (const rating of [0, 6, 3.5]) {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/reservations/${reservationId}/review`,
        headers: { authorization: authHeader(f.userId) },
        payload: { rating },
      })
      expect(res.statusCode).toBe(400)
    }
  })

  it('renvoie 400 si le commentaire dépasse 280 caractères', async () => {
    const f = await seedAll()
    const reservationId = await seedReservation(f, 'returned')

    const res = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${reservationId}/review`,
      headers: { authorization: authHeader(f.userId) },
      payload: { rating: 5, comment: 'x'.repeat(281) },
    })
    expect(res.statusCode).toBe(400)
  })

  it('renvoie 401 sans authentification', async () => {
    const f = await seedAll()
    const reservationId = await seedReservation(f, 'returned')
    const res = await app.inject({
      method: 'POST',
      url: `/v1/reservations/${reservationId}/review`,
      payload: { rating: 5 },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('GET /v1/distributors/:id/reviews', () => {
  it('renvoie moyenne, total et avis triés du plus récent au plus ancien', async () => {
    const f = await seedAll('Marie Lambert')
    // 3 résas rendues + avis notés 5, 4, 3 à des dates croissantes.
    const ratings = [5, 4, 3]
    for (let i = 0; i < ratings.length; i++) {
      const rid = await seedReservation(f, 'returned')
      await pgSql`INSERT INTO reviews (reservation_id, user_id, rating, comment, created_at)
        VALUES (${rid}, ${f.userId}, ${ratings[i]!}, ${'avis ' + i},
                NOW() + (${i} || ' minutes')::interval)`
    }

    const res = await app.inject({ method: 'GET', url: `/v1/distributors/${f.distributorId}/reviews` })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.count).toBe(3)
    expect(body.average).toBe(4) // (5+4+3)/3 = 4.0
    expect(body.items).toHaveLength(3)
    // Le plus récent (dernier inséré, rating 3) en tête.
    expect(body.items[0]!.rating).toBe(3)
    expect(body.items[2]!.rating).toBe(5)
    expect(body.items[0]!.authorName).toBe('Marie L.')
  })

  it('anonymise un prénom seul (pas d\'initiale de nom)', async () => {
    const f = await seedAll('Jean')
    const rid = await seedReservation(f, 'returned')
    await pgSql`INSERT INTO reviews (reservation_id, user_id, rating) VALUES (${rid}, ${f.userId}, 5)`

    const res = await app.inject({ method: 'GET', url: `/v1/distributors/${f.distributorId}/reviews` })
    expect(res.json().items[0]!.authorName).toBe('Jean')
  })

  it('renvoie authorName null quand le displayName est absent', async () => {
    const f = await seedAll(null)
    const rid = await seedReservation(f, 'returned')
    await pgSql`INSERT INTO reviews (reservation_id, user_id, rating) VALUES (${rid}, ${f.userId}, 4)`

    const res = await app.inject({ method: 'GET', url: `/v1/distributors/${f.distributorId}/reviews` })
    expect(res.json().items[0]!.authorName).toBeNull()
  })

  it('pagine via limit et offset', async () => {
    const f = await seedAll('Marie Lambert')
    for (let i = 0; i < 5; i++) {
      const rid = await seedReservation(f, 'returned')
      await pgSql`INSERT INTO reviews (reservation_id, user_id, rating, created_at)
        VALUES (${rid}, ${f.userId}, ${((i % 5) + 1)}, NOW() + (${i} || ' minutes')::interval)`
    }

    const page1 = await app.inject({
      method: 'GET',
      url: `/v1/distributors/${f.distributorId}/reviews?limit=2&offset=0`,
    })
    expect(page1.json().count).toBe(5) // agrégat sur TOUS les avis
    expect(page1.json().items).toHaveLength(2)

    const page2 = await app.inject({
      method: 'GET',
      url: `/v1/distributors/${f.distributorId}/reviews?limit=2&offset=4`,
    })
    expect(page2.json().items).toHaveLength(1)
  })

  it('renvoie une liste vide et une moyenne null sans avis', async () => {
    const f = await seedAll()
    const res = await app.inject({ method: 'GET', url: `/v1/distributors/${f.distributorId}/reviews` })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.count).toBe(0)
    expect(body.average).toBeNull()
    expect(body.items).toEqual([])
  })

  it('renvoie 404 pour un distributeur inexistant', async () => {
    const res = await app.inject({ method: 'GET', url: `/v1/distributors/${randomUUID()}/reviews` })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('distributor_not_found')
  })

  it('renvoie 400 pour un limit hors bornes', async () => {
    const f = await seedAll()
    const res = await app.inject({
      method: 'GET',
      url: `/v1/distributors/${f.distributorId}/reviews?limit=999`,
    })
    expect(res.statusCode).toBe(400)
  })
})
