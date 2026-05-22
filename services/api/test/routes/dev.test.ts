/**
 * Tests d'intégration POST /v1/dev/simulate-scan.
 *
 * On ne lance pas de vrai broker MQTT ici : le plugin mqtt-subscriber
 * décore l'app avec un client. On stub ce client (via app.decorate après
 * boot) pour intercepter les publish et valider :
 *   - le bon topic est utilisé (sportlocker/{distributorId}/cmd/open)
 *   - le payload est un JSON valide avec un JWT bien signé
 *   - les claims du JWT incluent reservation/locker/distributor/sub corrects
 *
 * Les codes d'erreur (404 résa absente, 503 mqtt désactivé) sont testés
 * en manipulant l'état (résa supprimée, client retiré du decorate).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { GenericContainer, type StartedTestContainer } from 'testcontainers'
import postgres from 'postgres'
import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..', '..', '..')
const SCHEMA_PATH = join(REPO_ROOT, 'database', 'schema.sql')
const MIGRATIONS_DIR = join(REPO_ROOT, 'database', 'migrations')

let pgContainer: StartedPostgreSqlContainer
let redisContainer: StartedTestContainer
let pgSql: ReturnType<typeof postgres>
let app: FastifyInstance

interface PublishCapture {
  topic: string
  payload: string
}

let captured: PublishCapture[] = []
// Stub minimal du MqttClient — supporte publish(topic, payload, opts, cb).
const stubClient = {
  publish: (topic: string, payload: string | Buffer, _opts: unknown, cb?: (err: Error | null) => void) => {
    captured.push({ topic, payload: payload.toString() })
    cb?.(null)
    return stubClient
  },
} as unknown as import('mqtt').MqttClient

async function seedReservation(): Promise<{
  reservationId: string
  userId: string
  lockerId: string
  distributorId: string
}> {
  const communeId = randomUUID()
  const distributorId = randomUUID()
  const itemTypeId = randomUUID()
  const itemId = randomUUID()
  const lockerId = randomUUID()
  const userId = randomUUID()
  const reservationId = randomUUID()

  await pgSql`INSERT INTO communes (id, insee_code, name, postal_code, department, region)
    VALUES (${communeId}, ${'7' + Math.floor(Math.random() * 9000 + 1000)},
            'Paris Test', '75001', '75', 'IDF')`
  await pgSql`INSERT INTO distributors (id, serial_number, commune_id, name, locker_count)
    VALUES (${distributorId}, ${'T-' + distributorId.slice(0, 8)}, ${communeId},
            'Test Dist', 4)`
  await pgSql`INSERT INTO item_types (id, slug, name, category)
    VALUES (${itemTypeId}, ${'slug-' + itemTypeId.slice(0, 8)}, 'Ballon', 'ballon')`
  await pgSql`INSERT INTO items (id, item_type_id, rfid_tag)
    VALUES (${itemId}, ${itemTypeId}, ${'RFID-' + itemId.slice(0, 8)})`
  await pgSql`INSERT INTO lockers (id, distributor_id, position, state, current_item_id)
    VALUES (${lockerId}, ${distributorId}, 0, 'reserved', ${itemId})`
  await pgSql`INSERT INTO users (id, firebase_uid, email)
    VALUES (${userId}, ${'fb-' + userId.slice(0, 8)}, ${userId.slice(0, 8) + '@test.local'})`
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
  await pgSql.unsafe(
    `INSERT INTO reservations (id, user_id, locker_id, item_id, distributor_id,
                               status, qr_jti, expires_at)
     VALUES ($1, $2, $3, $4, $5, 'scheduled'::reservation_status, $6, $7)`,
    [reservationId, userId, lockerId, itemId, distributorId,
     'jti-' + reservationId.slice(0, 8), expiresAt],
  )
  return { reservationId, userId, lockerId, distributorId }
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
  process.env.JWT_DEVICE_SECRET = 'test-device-secret-32-chars-long-pad'
  process.env.LOG_LEVEL = 'fatal'
  // On désactive le plugin réel — on injecte un stub à la place.
  process.env.MQTT_SUBSCRIBER_ENABLED = 'false'

  pgSql = postgres(process.env.DATABASE_URL!, { onnotice: () => {} })
  await pgSql.unsafe(readFileSync(SCHEMA_PATH, 'utf-8'))
  const migrations = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  for (const f of migrations) {
    await pgSql.unsafe(readFileSync(join(MIGRATIONS_DIR, f), 'utf-8'))
  }

  const { buildApp } = await import('../../src/app.js')
  app = await buildApp()
  // Décore avec le stub APRÈS le boot (le plugin a no-op à cause de MQTT_SUBSCRIBER_ENABLED=false).
  app.decorate('mqttSubscriber', stubClient)
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
      queues.slotReminders.close(),
    ])
  } catch {
    // ignore
  }
  await pgSql.end()
  await pgContainer.stop()
  await redisContainer.stop()
}, 30_000)

beforeEach(async () => {
  captured = []
  await pgSql`TRUNCATE TABLE locker_events, distributor_heartbeats, reviews, reservations,
                              lockers, items, item_types, distributors, users, communes
              RESTART IDENTITY CASCADE`
})

describe('POST /v1/dev/simulate-scan', () => {
  it('publie un JWT device signé sur le topic cmd/open du distributeur', async () => {
    const f = await seedReservation()

    const res = await app.inject({
      method: 'POST',
      url: '/v1/dev/simulate-scan',
      payload: { reservationId: f.reservationId },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { token: string; jti: string; topic: string }
    expect(body.topic).toBe(`sportlocker/${f.distributorId}/cmd/open`)
    expect(body.token).toMatch(/^eyJ/)  // header JWT base64
    expect(body.jti).not.toBe('')

    expect(captured).toHaveLength(1)
    expect(captured[0]!.topic).toBe(`sportlocker/${f.distributorId}/cmd/open`)
    const wirePayload = JSON.parse(captured[0]!.payload)
    expect(wirePayload).toEqual({ token: body.token })
  })

  it('le JWT contient les claims attendus par le firmware', async () => {
    const f = await seedReservation()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/dev/simulate-scan',
      payload: { reservationId: f.reservationId },
    })
    const body = res.json() as { token: string; jti: string }

    const { verifyDeviceToken } = await import('../../src/lib/jwt-device.js')
    const claims = await verifyDeviceToken(body.token)
    expect(claims.distributorId).toBe(f.distributorId)
    expect(claims.lockerId).toBe(f.lockerId)
    expect(claims.reservationId).toBe(f.reservationId)
    expect(claims.sub).toBe(f.userId)
    expect(claims.jti).toBe(body.jti)
    expect(typeof claims.exp).toBe('number')
  })

  it('404 si la réservation n\'existe pas', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/dev/simulate-scan',
      payload: { reservationId: randomUUID() },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: 'reservation_not_found' })
    expect(captured).toHaveLength(0)
  })

  it('400 si reservationId n\'est pas un UUID', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/dev/simulate-scan',
      payload: { reservationId: 'not-a-uuid' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('503 si le client MQTT n\'est pas dispo (MQTT_SUBSCRIBER_ENABLED=false sans stub)', async () => {
    // Simule l'absence du decorate — on retire le stub temporairement.
    const original = (app as unknown as { mqttSubscriber: unknown }).mqttSubscriber
    ;(app as unknown as { mqttSubscriber: unknown }).mqttSubscriber = undefined

    const f = await seedReservation()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/dev/simulate-scan',
      payload: { reservationId: f.reservationId },
    })
    expect(res.statusCode).toBe(503)
    expect(res.json()).toEqual({ error: 'mqtt_disabled' })

    ;(app as unknown as { mqttSubscriber: unknown }).mqttSubscriber = original
  })
})
