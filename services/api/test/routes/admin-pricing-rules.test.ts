/**
 * Tests d'intégration pour /v1/admin/pricing-rules.
 *
 * Périmètre :
 *   - GET / : liste les règles de la commune scopée, joint item_type.
 *             super_admin doit fournir ?communeId, sinon 422.
 *   - PUT / : upsert un triplet (commune × item_type × duration).
 *             Idempotent (2× même payload = update). 422 si itemTypeId inexistant.
 *   - POST /bulk : applique une grille complète en transaction.
 *                  Renvoie {applied: N}. 422 si une ligne référence un itemType
 *                  inconnu (toute la transaction roll back).
 *   - DELETE /:id : retire une règle. 404 si l'admin scoped tente de delete
 *                   une règle d'une autre commune (anti-leak).
 *
 * Pas de pricing_rules dans le TRUNCATE explicite — CASCADE depuis communes
 * / item_types nettoie les rows entre tests.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { GenericContainer, type StartedTestContainer } from 'testcontainers'
import postgres from 'postgres'
import IORedis from 'ioredis'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'

import { seedCommune, seedUser, signSession } from '../helpers/seed.js'

vi.mock('firebase-admin', () => {
  const auth = { verifyIdToken: vi.fn() }
  return {
    default: {
      initializeApp: vi.fn(),
      credential: { cert: vi.fn() },
      auth: () => auth,
    },
  }
})

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..', '..', '..')
const SCHEMA_PATH = join(REPO_ROOT, 'database', 'schema.sql')
const MIGRATION_PATH = join(REPO_ROOT, 'database', 'migrations', '0001_fn_locker_is_available.sql')

let pgContainer: StartedPostgreSqlContainer
let redisContainer: StartedTestContainer
let pgSql: ReturnType<typeof postgres>
let redisClient: IORedis
let app: FastifyInstance

async function seedItemType(opts: {
  slug?: string
  name?: string
  category?: string
} = {}): Promise<string> {
  const id = randomUUID()
  const slug = opts.slug ?? 'slug-' + id.slice(0, 8)
  await pgSql`INSERT INTO item_types
    (id, slug, name, category, caution_cents, max_duration_minutes)
    VALUES (${id}, ${slug}, ${opts.name ?? 'Type ' + slug}, ${opts.category ?? 'ballon'},
            3000, 240)`
  return id
}

async function seedPricingRule(opts: {
  communeId: string
  itemTypeId: string
  durationMinutes: number
  priceCents: number
}): Promise<string> {
  const id = randomUUID()
  await pgSql`INSERT INTO pricing_rules
    (id, commune_id, item_type_id, duration_minutes, price_cents)
    VALUES (${id}, ${opts.communeId}, ${opts.itemTypeId},
            ${opts.durationMinutes}, ${opts.priceCents})`
  return id
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
  process.env.FIREBASE_PROJECT_ID = 'sportlocker-test'
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY = '{"type":"service_account","project_id":"sportlocker-test"}'
  process.env.DASHBOARD_INVITE_BASE_URL = 'https://ops.sportlocker.fr'
  process.env.LOG_LEVEL = 'fatal'

  pgSql = postgres(process.env.DATABASE_URL!, { onnotice: () => {} })
  await pgSql.unsafe(readFileSync(SCHEMA_PATH, 'utf-8'))
  await pgSql.unsafe(readFileSync(MIGRATION_PATH, 'utf-8'))

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
    ])
  } catch { /* ignore */ }
  try {
    const { redis } = await import('../../src/redis/client.js')
    await redis.quit()
  } catch { /* ignore */ }
  await pgSql?.end({ timeout: 5 })
  await redisClient?.quit()
  await pgContainer?.stop()
  await redisContainer?.stop()
})

beforeEach(async () => {
  // pricing_rules nettoyé par CASCADE depuis communes/item_types.
  await pgSql`TRUNCATE TABLE
    communes, users, distributors, lockers, items, item_types,
    reservations, token_nonces, locker_events, distributor_heartbeats,
    maintenance_tickets, push_tokens, notification_logs, reviews,
    admin_invites
    RESTART IDENTITY CASCADE`
  await redisClient.flushdb()
})

// ──────────────────────────────────────────────────────────────────────────
// GET /v1/admin/pricing-rules
// ──────────────────────────────────────────────────────────────────────────

describe('GET /v1/admin/pricing-rules', () => {
  it('citizen → 403', async () => {
    const commune = await seedCommune(pgSql)
    const u = await seedUser(pgSql, { role: 'citizen', communeId: commune })
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/pricing-rules',
      headers: { authorization: signSession(app, u.id, 'citizen') },
    })
    expect(res.statusCode).toBe(403)
  })

  it('admin scoped → liste uniquement ses propres règles, triées ASC name puis duration', async () => {
    const commA = await seedCommune(pgSql, 'A')
    const commB = await seedCommune(pgSql, 'B')
    const ballon = await seedItemType({ slug: 'ballon', name: 'Ballon' })
    const raquette = await seedItemType({ slug: 'raquette', name: 'Raquette' })

    // 3 règles pour comm A, 1 pour comm B (qui doit être filtrée).
    await seedPricingRule({ communeId: commA, itemTypeId: ballon, durationMinutes: 60, priceCents: 100 })
    await seedPricingRule({ communeId: commA, itemTypeId: ballon, durationMinutes: 30, priceCents: 50 })
    await seedPricingRule({ communeId: commA, itemTypeId: raquette, durationMinutes: 60, priceCents: 300 })
    await seedPricingRule({ communeId: commB, itemTypeId: ballon, durationMinutes: 60, priceCents: 999 })

    const u = await seedUser(pgSql, { role: 'admin', communeId: commA })
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/pricing-rules',
      headers: { authorization: signSession(app, u.id, 'admin', commA) },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.items).toHaveLength(3)
    // Tri : Ballon 30, Ballon 60, Raquette 60
    expect(body.items.map((r: { itemTypeName: string; durationMinutes: number }) =>
      `${r.itemTypeName}-${r.durationMinutes}`)).toEqual([
      'Ballon-30', 'Ballon-60', 'Raquette-60',
    ])
    // Jointure item_types correctement faite
    expect(body.items[0].itemTypeSlug).toBe('ballon')
    expect(body.items[0].priceCents).toBe(50)
  })

  it('super_admin sans communeId → 422', async () => {
    const su = await seedUser(pgSql, { role: 'super_admin' })
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/pricing-rules',
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json()).toEqual({ error: 'commune_id_required' })
  })

  it('super_admin avec ?communeId= → 200 et liste la commune spécifiée', async () => {
    const commA = await seedCommune(pgSql, 'A')
    const ballon = await seedItemType({ slug: 'ballon' })
    await seedPricingRule({ communeId: commA, itemTypeId: ballon, durationMinutes: 60, priceCents: 200 })

    const su = await seedUser(pgSql, { role: 'super_admin' })
    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/pricing-rules?communeId=${commA}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().items).toHaveLength(1)
  })

  it('admin scoped : ?communeId est ignoré (le scope impose) → ne fuit pas une autre commune', async () => {
    const commA = await seedCommune(pgSql, 'A')
    const commB = await seedCommune(pgSql, 'B')
    const ballon = await seedItemType({ slug: 'ballon' })
    await seedPricingRule({ communeId: commB, itemTypeId: ballon, durationMinutes: 60, priceCents: 999 })

    const u = await seedUser(pgSql, { role: 'admin', communeId: commA })
    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/pricing-rules?communeId=${commB}`,
      headers: { authorization: signSession(app, u.id, 'admin', commA) },
    })
    expect(res.statusCode).toBe(200)
    // L'admin de A voit ses propres règles (0), pas celle de B malgré le query.
    expect(res.json().items).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────────────────────────────────
// PUT /v1/admin/pricing-rules — upsert
// ──────────────────────────────────────────────────────────────────────────

describe('PUT /v1/admin/pricing-rules', () => {
  it('admin scoped → insert quand triplet absent', async () => {
    const commune = await seedCommune(pgSql, 'A')
    const ballon = await seedItemType({ slug: 'ballon' })
    const u = await seedUser(pgSql, { role: 'admin', communeId: commune })

    const res = await app.inject({
      method: 'PUT',
      url: '/v1/admin/pricing-rules',
      headers: { authorization: signSession(app, u.id, 'admin', commune) },
      payload: { itemTypeId: ballon, durationMinutes: 60, priceCents: 200 },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.communeId).toBe(commune)
    expect(body.itemTypeId).toBe(ballon)
    expect(body.durationMinutes).toBe(60)
    expect(body.priceCents).toBe(200)
    expect(body.itemTypeSlug).toBe('ballon')
  })

  it('idempotent : 2e appel avec même triplet → update du priceCents', async () => {
    const commune = await seedCommune(pgSql, 'A')
    const ballon = await seedItemType({ slug: 'ballon' })
    const u = await seedUser(pgSql, { role: 'admin', communeId: commune })

    const first = await app.inject({
      method: 'PUT',
      url: '/v1/admin/pricing-rules',
      headers: { authorization: signSession(app, u.id, 'admin', commune) },
      payload: { itemTypeId: ballon, durationMinutes: 60, priceCents: 200 },
    })
    expect(first.statusCode).toBe(200)
    const firstId = first.json().id

    const second = await app.inject({
      method: 'PUT',
      url: '/v1/admin/pricing-rules',
      headers: { authorization: signSession(app, u.id, 'admin', commune) },
      payload: { itemTypeId: ballon, durationMinutes: 60, priceCents: 350 },
    })
    expect(second.statusCode).toBe(200)
    const secondBody = second.json()
    // Même row UUID (UPDATE pas INSERT)
    expect(secondBody.id).toBe(firstId)
    expect(secondBody.priceCents).toBe(350)

    // En DB une seule row
    const rows = await pgSql`SELECT count(*)::int as c FROM pricing_rules WHERE commune_id = ${commune}`
    expect(rows[0]?.c).toBe(1)
  })

  it('priceCents = 0 autorisé (cas "ballon enfant gratuit")', async () => {
    const commune = await seedCommune(pgSql, 'A')
    const ballon = await seedItemType({ slug: 'ballon' })
    const u = await seedUser(pgSql, { role: 'admin', communeId: commune })

    const res = await app.inject({
      method: 'PUT',
      url: '/v1/admin/pricing-rules',
      headers: { authorization: signSession(app, u.id, 'admin', commune) },
      payload: { itemTypeId: ballon, durationMinutes: 60, priceCents: 0 },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().priceCents).toBe(0)
  })

  it('durationMinutes hors liste autorisée (45) → 400', async () => {
    const commune = await seedCommune(pgSql, 'A')
    const ballon = await seedItemType({ slug: 'ballon' })
    const u = await seedUser(pgSql, { role: 'admin', communeId: commune })

    const res = await app.inject({
      method: 'PUT',
      url: '/v1/admin/pricing-rules',
      headers: { authorization: signSession(app, u.id, 'admin', commune) },
      payload: { itemTypeId: ballon, durationMinutes: 45, priceCents: 100 },
    })
    // Zod schema rejette → 400 par fastify-type-provider-zod
    expect(res.statusCode).toBe(400)
  })

  it('itemTypeId inconnu → 422 invalid_reference (FK violation)', async () => {
    const commune = await seedCommune(pgSql, 'A')
    const u = await seedUser(pgSql, { role: 'admin', communeId: commune })

    const res = await app.inject({
      method: 'PUT',
      url: '/v1/admin/pricing-rules',
      headers: { authorization: signSession(app, u.id, 'admin', commune) },
      payload: {
        itemTypeId: '00000000-0000-0000-0000-000000000000',
        durationMinutes: 60,
        priceCents: 100,
      },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json()).toEqual({ error: 'invalid_reference' })
  })

  it('priceCents > 100_000_000 → 400 (max raisonnable)', async () => {
    const commune = await seedCommune(pgSql, 'A')
    const ballon = await seedItemType({ slug: 'ballon' })
    const u = await seedUser(pgSql, { role: 'admin', communeId: commune })

    const res = await app.inject({
      method: 'PUT',
      url: '/v1/admin/pricing-rules',
      headers: { authorization: signSession(app, u.id, 'admin', commune) },
      payload: { itemTypeId: ballon, durationMinutes: 60, priceCents: 100_000_001 },
    })
    expect(res.statusCode).toBe(400)
  })
})

// ──────────────────────────────────────────────────────────────────────────
// POST /v1/admin/pricing-rules/bulk
// ──────────────────────────────────────────────────────────────────────────

describe('POST /v1/admin/pricing-rules/bulk', () => {
  it('applique une grille de 4 règles en transaction', async () => {
    const commune = await seedCommune(pgSql, 'A')
    const ballon = await seedItemType({ slug: 'ballon' })
    const u = await seedUser(pgSql, { role: 'admin', communeId: commune })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/pricing-rules/bulk',
      headers: { authorization: signSession(app, u.id, 'admin', commune) },
      payload: {
        rules: [
          { itemTypeId: ballon, durationMinutes: 30, priceCents: 50 },
          { itemTypeId: ballon, durationMinutes: 60, priceCents: 100 },
          { itemTypeId: ballon, durationMinutes: 90, priceCents: 150 },
          { itemTypeId: ballon, durationMinutes: 1440, priceCents: 500 },
        ],
      },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ applied: 4 })

    const rows = await pgSql`SELECT count(*)::int as c FROM pricing_rules WHERE commune_id = ${commune}`
    expect(rows[0]?.c).toBe(4)
  })

  it('idempotent : ré-appliquer la même grille update les prix', async () => {
    const commune = await seedCommune(pgSql, 'A')
    const ballon = await seedItemType({ slug: 'ballon' })
    const u = await seedUser(pgSql, { role: 'admin', communeId: commune })

    const firstPayload = {
      rules: [
        { itemTypeId: ballon, durationMinutes: 30, priceCents: 50 },
        { itemTypeId: ballon, durationMinutes: 60, priceCents: 100 },
      ],
    }
    await app.inject({
      method: 'POST',
      url: '/v1/admin/pricing-rules/bulk',
      headers: { authorization: signSession(app, u.id, 'admin', commune) },
      payload: firstPayload,
    })

    // Bump les prix
    const secondPayload = {
      rules: [
        { itemTypeId: ballon, durationMinutes: 30, priceCents: 80 },
        { itemTypeId: ballon, durationMinutes: 60, priceCents: 160 },
      ],
    }
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/pricing-rules/bulk',
      headers: { authorization: signSession(app, u.id, 'admin', commune) },
      payload: secondPayload,
    })
    expect(res.statusCode).toBe(200)

    const rows = await pgSql`SELECT count(*)::int as c FROM pricing_rules WHERE commune_id = ${commune}`
    expect(rows[0]?.c).toBe(2)

    const prices = await pgSql<{ duration_minutes: number; price_cents: number }[]>`
      SELECT duration_minutes, price_cents FROM pricing_rules
      WHERE commune_id = ${commune}
      ORDER BY duration_minutes`
    expect(prices).toEqual([
      { duration_minutes: 30, price_cents: 80 },
      { duration_minutes: 60, price_cents: 160 },
    ])
  })

  it('une ligne avec itemTypeId inconnu → 422, toute la transaction roll back', async () => {
    const commune = await seedCommune(pgSql, 'A')
    const ballon = await seedItemType({ slug: 'ballon' })
    const u = await seedUser(pgSql, { role: 'admin', communeId: commune })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/pricing-rules/bulk',
      headers: { authorization: signSession(app, u.id, 'admin', commune) },
      payload: {
        rules: [
          { itemTypeId: ballon, durationMinutes: 60, priceCents: 100 },
          { itemTypeId: '00000000-0000-0000-0000-000000000000', durationMinutes: 90, priceCents: 150 },
        ],
      },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json()).toEqual({ error: 'invalid_reference' })

    // Aucune row insérée (rollback complet)
    const rows = await pgSql`SELECT count(*)::int as c FROM pricing_rules WHERE commune_id = ${commune}`
    expect(rows[0]?.c).toBe(0)
  })

  it('rules vide → 400 (Zod min(1))', async () => {
    const commune = await seedCommune(pgSql, 'A')
    const u = await seedUser(pgSql, { role: 'admin', communeId: commune })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/pricing-rules/bulk',
      headers: { authorization: signSession(app, u.id, 'admin', commune) },
      payload: { rules: [] },
    })
    expect(res.statusCode).toBe(400)
  })
})

// ──────────────────────────────────────────────────────────────────────────
// DELETE /v1/admin/pricing-rules/:id
// ──────────────────────────────────────────────────────────────────────────

describe('DELETE /v1/admin/pricing-rules/:id', () => {
  it('admin scoped → 204 sur sa propre règle', async () => {
    const commune = await seedCommune(pgSql, 'A')
    const ballon = await seedItemType({ slug: 'ballon' })
    const id = await seedPricingRule({
      communeId: commune, itemTypeId: ballon, durationMinutes: 60, priceCents: 100,
    })
    const u = await seedUser(pgSql, { role: 'admin', communeId: commune })

    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/pricing-rules/${id}`,
      headers: { authorization: signSession(app, u.id, 'admin', commune) },
    })
    expect(res.statusCode).toBe(204)

    const rows = await pgSql`SELECT count(*)::int as c FROM pricing_rules WHERE id = ${id}`
    expect(rows[0]?.c).toBe(0)
  })

  it('ID inconnu → 404', async () => {
    const commune = await seedCommune(pgSql, 'A')
    const u = await seedUser(pgSql, { role: 'admin', communeId: commune })

    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/admin/pricing-rules/00000000-0000-0000-0000-000000000000',
      headers: { authorization: signSession(app, u.id, 'admin', commune) },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: 'pricing_rule_not_found' })
  })

  it('admin scoped tente de delete une règle d\'une autre commune → 404 anti-leak', async () => {
    const commA = await seedCommune(pgSql, 'A')
    const commB = await seedCommune(pgSql, 'B')
    const ballon = await seedItemType({ slug: 'ballon' })
    const idB = await seedPricingRule({
      communeId: commB, itemTypeId: ballon, durationMinutes: 60, priceCents: 100,
    })
    const u = await seedUser(pgSql, { role: 'admin', communeId: commA })

    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/pricing-rules/${idB}`,
      headers: { authorization: signSession(app, u.id, 'admin', commA) },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: 'pricing_rule_not_found' })

    // La règle existe toujours côté DB (ne pas leak l'info via timing)
    const rows = await pgSql`SELECT count(*)::int as c FROM pricing_rules WHERE id = ${idB}`
    expect(rows[0]?.c).toBe(1)
  })

  it('super_admin → bypass le scope, peut delete dans toute commune', async () => {
    const commune = await seedCommune(pgSql, 'A')
    const ballon = await seedItemType({ slug: 'ballon' })
    const id = await seedPricingRule({
      communeId: commune, itemTypeId: ballon, durationMinutes: 60, priceCents: 100,
    })
    const su = await seedUser(pgSql, { role: 'super_admin' })

    const res = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/pricing-rules/${id}`,
      headers: { authorization: signSession(app, su.id, 'super_admin') },
    })
    expect(res.statusCode).toBe(204)
  })
})
