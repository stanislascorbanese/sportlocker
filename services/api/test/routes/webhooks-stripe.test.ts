/**
 * Tests d'intégration pour /v1/webhooks/stripe :
 *   - 503 si STRIPE_WEBHOOK_SECRET absent
 *   - 503 si STRIPE_SECRET_KEY absent
 *   - 400 si signature manquante
 *   - 400 si signature invalide
 *   - 200 + DB synced pour account.updated d'une commune connue
 *   - 200 silent pour account.updated d'un account inconnu
 *   - 200 silent + onboardedAt préservé pour les autres event types
 *   - Idempotence : 2 events successifs avec mêmes flags ne posent pas
 *     2 onboardedAt différents
 *
 * Stripe SDK mocké via vi.mock — on contourne la vraie vérif signature
 * (qui nécessiterait de signer le payload avec une vraie clé) en faisant
 * que `stripe.webhooks.constructEvent` accepte une signature de notre
 * choix et renvoie un Event canned.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { GenericContainer, type StartedTestContainer } from 'testcontainers'
import postgres from 'postgres'
import IORedis from 'ioredis'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

import type { FastifyInstance } from 'fastify'

import { seedCommune } from '../helpers/seed.js'

vi.mock('firebase-admin', () => {
  const auth = { verifyIdToken: vi.fn() }
  return {
    default: {
      apps: [],
      initializeApp: vi.fn(),
      credential: { cert: vi.fn() },
      auth: () => auth,
    },
  }
})

// Mock Stripe : on contrôle ce que retourne constructEvent. La signature
// est un string opaque qu'on inspecte côté mock pour décider de throw
// (sig invalide) ou de renvoyer un Event forgé.
const constructEventMock = vi.fn()

vi.mock('stripe', () => {
  class MockStripe {
    webhooks = {
      constructEvent: constructEventMock,
    }
    accounts = {
      retrieve: vi.fn(),
      create: vi.fn(),
    }
    accountLinks = {
      create: vi.fn(),
    }
  }
  return { default: MockStripe }
})

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..', '..', '..')
const SCHEMA_PATH = join(REPO_ROOT, 'database', 'schema.sql')
const MIGRATIONS_DIR = join(REPO_ROOT, 'database', 'migrations')

function applyMigrations(pgSql: ReturnType<typeof postgres>) {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  return Promise.all(
    files
      .filter((f) => f.startsWith('0001_'))
      .map((f) => pgSql.unsafe(readFileSync(join(MIGRATIONS_DIR, f), 'utf-8'))),
  )
}

let pgContainer: StartedPostgreSqlContainer
let redisContainer: StartedTestContainer
let pgSql: ReturnType<typeof postgres>
let redisClient: IORedis
let app: FastifyInstance

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
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake_for_integration_tests'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_fake_for_integration_tests'
  // Le webhook paiement (/v1/stripe/webhook) ne s'active qu'en provider stripe.
  process.env.PAYMENTS_PROVIDER = 'stripe'
  process.env.LOG_LEVEL = 'fatal'

  pgSql = postgres(process.env.DATABASE_URL!, { onnotice: () => {} })
  await pgSql.unsafe(readFileSync(SCHEMA_PATH, 'utf-8'))
  await applyMigrations(pgSql)

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
  await pgSql`TRUNCATE TABLE
    communes, users, distributors, lockers, items, item_types,
    reservations, token_nonces, locker_events, distributor_heartbeats,
    maintenance_tickets, push_tokens, notification_logs, reviews,
    admin_invites
    RESTART IDENTITY CASCADE`
  await redisClient.flushdb()
  constructEventMock.mockReset()

  const { resetStripeForTests } = await import('../../src/lib/stripe.js')
  resetStripeForTests()
})

// Helper : construit une requête vers /v1/webhooks/stripe avec un body brut
// (string) et une signature opaque. Le constructEvent mocké va retourner
// ce qu'on lui a paramétré pour ce test.
function postWebhook(payload: object | string, signature = 't=1,v1=fakesig') {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
  return app.inject({
    method: 'POST',
    url: '/v1/webhooks/stripe',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': signature,
    },
    payload: body,
  })
}

// Helper : POST vers le webhook PAIEMENT (/v1/stripe/webhook). `withSignature`
// = false pour tester la garde "signature manquante".
function postPaymentWebhook(withSignature = true) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (withSignature) headers['stripe-signature'] = 't=1,v1=fakesig'
  return app.inject({
    method: 'POST', url: '/v1/stripe/webhook', headers, payload: '{}',
  })
}

/** Seed une résa `pending_payment` + un paiement `pending` (provider stripe). */
async function seedPendingPayment(): Promise<{ paymentId: string; reservationId: string }> {
  const communeId = await seedCommune(pgSql, 'A')
  const userId = randomUUID()
  await pgSql`INSERT INTO users (id, firebase_uid, email)
    VALUES (${userId}, ${'fb-' + userId.slice(0, 8)}, ${userId.slice(0, 8) + '@test.local'})`
  const distributorId = randomUUID()
  await pgSql`INSERT INTO distributors (id, serial_number, commune_id, name, locker_count)
    VALUES (${distributorId}, ${'TEST-' + distributorId.slice(0, 8)}, ${communeId}, 'Dist', 4)`
  const itemTypeId = randomUUID()
  await pgSql`INSERT INTO item_types (id, slug, name, category)
    VALUES (${itemTypeId}, ${'slug-' + itemTypeId.slice(0, 8)}, 'Ballon', 'ballon')`
  const itemId = randomUUID()
  await pgSql`INSERT INTO items (id, item_type_id, rfid_tag)
    VALUES (${itemId}, ${itemTypeId}, ${'RFID-' + itemId.slice(0, 8)})`
  const lockerId = randomUUID()
  await pgSql`INSERT INTO lockers (id, distributor_id, position, state)
    VALUES (${lockerId}, ${distributorId}, 0, 'idle')`
  const reservationId = randomUUID()
  await pgSql`INSERT INTO reservations
    (id, user_id, locker_id, item_id, distributor_id, status, qr_jti, expires_at)
    VALUES (${reservationId}, ${userId}, ${lockerId}, ${itemId}, ${distributorId},
            'pending_payment', ${'jti-' + reservationId.slice(0, 12)}, NOW() + INTERVAL '15 min')`
  const paymentId = randomUUID()
  await pgSql`INSERT INTO payments (id, reservation_id, user_id, amount_cents, status, provider)
    VALUES (${paymentId}, ${reservationId}, ${userId}, 500, 'pending', 'stripe')`
  return { paymentId, reservationId }
}

const paymentEvent = (type: string, metadata: Record<string, string> = {}): unknown => ({
  type,
  data: { object: { metadata, last_payment_error: { message: 'card_declined' } } },
})

// ──────────────────────────────────────────────────────────────────────────
// Gardes de configuration
// ──────────────────────────────────────────────────────────────────────────

describe('POST /v1/webhooks/stripe — config guards', () => {
  it('503 stripe_webhook_not_configured si aucun secret de signature Connect', async () => {
    // `env` est un singleton mutable lu à chaque requête par la route : on peut
    // donc éteindre les deux secrets (dédié Connect + fallback paiements) le
    // temps du test pour exercer la garde ligne 83 de webhooks-stripe.ts.
    const { env } = await import('../../src/config/env.js')
    const originalConnect = env.STRIPE_CONNECT_WEBHOOK_SECRET
    const originalFallback = env.STRIPE_WEBHOOK_SECRET
    env.STRIPE_CONNECT_WEBHOOK_SECRET = undefined
    env.STRIPE_WEBHOOK_SECRET = undefined
    try {
      const res = await postWebhook({ id: 'evt_test', type: 'account.updated' })
      expect(res.statusCode).toBe(503)
      expect(res.json()).toEqual({ error: 'stripe_webhook_not_configured' })
    } finally {
      env.STRIPE_CONNECT_WEBHOOK_SECRET = originalConnect
      env.STRIPE_WEBHOOK_SECRET = originalFallback
    }
  })

  it('503 stripe_not_configured si le secret existe mais STRIPE_SECRET_KEY absent', async () => {
    // Secret de signature présent (on passe la 1ʳᵉ garde) mais SDK Stripe non
    // initialisable faute de clé secrète → requireStripe() throw
    // StripeNotConfiguredError, catché en 503 (ligne 94).
    const { env } = await import('../../src/config/env.js')
    const { resetStripeForTests } = await import('../../src/lib/stripe.js')
    const originalKey = env.STRIPE_SECRET_KEY
    env.STRIPE_SECRET_KEY = undefined
    resetStripeForTests() // vide le singleton pour forcer getStripe() → null
    try {
      const res = await postWebhook({ id: 'evt_test', type: 'account.updated' })
      expect(res.statusCode).toBe(503)
      expect(res.json()).toEqual({ error: 'stripe_not_configured' })
    } finally {
      env.STRIPE_SECRET_KEY = originalKey
      resetStripeForTests() // ré-arme un singleton propre pour les tests suivants
    }
  })

  it('400 si stripe-signature header absent', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/stripe',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'missing_stripe_signature' })
  })

  it('400 si signature invalide (constructEvent throw)', async () => {
    constructEventMock.mockImplementation(() => {
      throw new Error('Invalid signature')
    })
    const res = await postWebhook({ id: 'evt_test', type: 'account.updated' })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'invalid_signature' })
  })
})

// ──────────────────────────────────────────────────────────────────────────
// account.updated → sync DB
// ──────────────────────────────────────────────────────────────────────────

describe('POST /v1/webhooks/stripe — account.updated', () => {
  it('met à jour les flags + onboardedAt pour une commune connue (full verif)', async () => {
    const communeId = await seedCommune(pgSql, 'A')
    await pgSql`UPDATE communes SET stripe_connect_account_id = 'acct_test_known'
      WHERE id = ${communeId}`

    constructEventMock.mockReturnValue({
      id: 'evt_1',
      type: 'account.updated',
      data: {
        object: {
          id: 'acct_test_known',
          charges_enabled: true,
          payouts_enabled: true,
        },
      },
    })

    const res = await postWebhook({
      type: 'account.updated',
      data: { object: { id: 'acct_test_known' } },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ received: true })

    const rows = await pgSql<Array<{
      charges: boolean
      payouts: boolean
      onboarded_at: Date | null
    }>>`SELECT
      stripe_connect_charges_enabled AS charges,
      stripe_connect_payouts_enabled AS payouts,
      stripe_connect_onboarded_at AS onboarded_at
    FROM communes WHERE id = ${communeId}`
    expect(rows[0]?.charges).toBe(true)
    expect(rows[0]?.payouts).toBe(true)
    expect(rows[0]?.onboarded_at).not.toBeNull()
  })

  it('partial verif (charges OK, payouts pending) → flags update mais onboardedAt reste null', async () => {
    const communeId = await seedCommune(pgSql, 'A')
    await pgSql`UPDATE communes SET stripe_connect_account_id = 'acct_test_partial'
      WHERE id = ${communeId}`

    constructEventMock.mockReturnValue({
      id: 'evt_2',
      type: 'account.updated',
      data: {
        object: {
          id: 'acct_test_partial',
          charges_enabled: true,
          payouts_enabled: false,
        },
      },
    })

    const res = await postWebhook({ type: 'account.updated' })
    expect(res.statusCode).toBe(200)

    const rows = await pgSql<Array<{
      charges: boolean
      payouts: boolean
      onboarded_at: Date | null
    }>>`SELECT
      stripe_connect_charges_enabled AS charges,
      stripe_connect_payouts_enabled AS payouts,
      stripe_connect_onboarded_at AS onboarded_at
    FROM communes WHERE id = ${communeId}`
    expect(rows[0]?.charges).toBe(true)
    expect(rows[0]?.payouts).toBe(false)
    expect(rows[0]?.onboarded_at).toBeNull()
  })

  it('account inconnu → 200 silent (log + skip, pas d\'erreur)', async () => {
    constructEventMock.mockReturnValue({
      id: 'evt_3',
      type: 'account.updated',
      data: {
        object: {
          id: 'acct_test_orphan',
          charges_enabled: true,
          payouts_enabled: true,
        },
      },
    })

    const res = await postWebhook({ type: 'account.updated' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ received: true })
  })

  it('idempotence : 2 events successifs ne posent pas 2 onboardedAt différents', async () => {
    const communeId = await seedCommune(pgSql, 'A')
    await pgSql`UPDATE communes SET stripe_connect_account_id = 'acct_test_idem'
      WHERE id = ${communeId}`

    constructEventMock.mockReturnValue({
      id: 'evt_4',
      type: 'account.updated',
      data: {
        object: {
          id: 'acct_test_idem',
          charges_enabled: true,
          payouts_enabled: true,
        },
      },
    })

    await postWebhook({ type: 'account.updated' })
    const firstRows = await pgSql<Array<{ onboarded_at: Date | null }>>`
      SELECT stripe_connect_onboarded_at AS onboarded_at
      FROM communes WHERE id = ${communeId}`
    const firstOnboardedAt = firstRows[0]?.onboarded_at

    // Petit délai pour que NOW() retourne une valeur différente si bug.
    await new Promise((r) => setTimeout(r, 50))

    await postWebhook({ type: 'account.updated' })
    const secondRows = await pgSql<Array<{ onboarded_at: Date | null }>>`
      SELECT stripe_connect_onboarded_at AS onboarded_at
      FROM communes WHERE id = ${communeId}`
    const secondOnboardedAt = secondRows[0]?.onboarded_at

    expect(firstOnboardedAt).not.toBeNull()
    expect(secondOnboardedAt).not.toBeNull()
    // Doit être strictement le même timestamp (préservation).
    expect(secondOnboardedAt?.getTime()).toBe(firstOnboardedAt?.getTime())
  })

  it('onboardedAt préservé même si Stripe re-revoke un flag', async () => {
    const communeId = await seedCommune(pgSql, 'A')
    await pgSql`UPDATE communes SET
      stripe_connect_account_id = 'acct_test_revoke',
      stripe_connect_charges_enabled = true,
      stripe_connect_payouts_enabled = true,
      stripe_connect_onboarded_at = NOW()
      WHERE id = ${communeId}`

    // Stripe désactive temporairement les payouts (AML pause)
    constructEventMock.mockReturnValue({
      id: 'evt_5',
      type: 'account.updated',
      data: {
        object: {
          id: 'acct_test_revoke',
          charges_enabled: true,
          payouts_enabled: false,
        },
      },
    })

    const res = await postWebhook({ type: 'account.updated' })
    expect(res.statusCode).toBe(200)

    const rows = await pgSql<Array<{
      payouts: boolean
      onboarded_at: Date | null
    }>>`SELECT
      stripe_connect_payouts_enabled AS payouts,
      stripe_connect_onboarded_at AS onboarded_at
    FROM communes WHERE id = ${communeId}`
    expect(rows[0]?.payouts).toBe(false)
    // Le timestamp d'onboarding initial reste — pas un dé-onboarding.
    expect(rows[0]?.onboarded_at).not.toBeNull()
  })
})

// ──────────────────────────────────────────────────────────────────────────
// Autres event types
// ──────────────────────────────────────────────────────────────────────────

describe('POST /v1/webhooks/stripe — other events', () => {
  it('200 silent sur un event type non géré', async () => {
    constructEventMock.mockReturnValue({
      id: 'evt_6',
      type: 'charge.succeeded', // pas géré pour l'instant
      data: { object: {} },
    })
    const res = await postWebhook({ type: 'charge.succeeded' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ received: true })
  })
})

// ──────────────────────────────────────────────────────────────────────────
// POST /v1/stripe/webhook — confirmation de paiement (PaymentIntent)
// ──────────────────────────────────────────────────────────────────────────

async function paymentStatus(paymentId: string): Promise<string> {
  const [row] = await pgSql<{ status: string }[]>`SELECT status FROM payments WHERE id = ${paymentId}`
  return row!.status
}
async function reservationStatus(reservationId: string): Promise<string> {
  const [row] = await pgSql<{ status: string }[]>`SELECT status FROM reservations WHERE id = ${reservationId}`
  return row!.status
}

describe('POST /v1/stripe/webhook — paiement', () => {
  it('503 stripe_disabled si PAYMENTS_PROVIDER n\'est pas stripe', async () => {
    // Garde ligne 41 de stripe-webhook.ts : en provider `simulate`, l'endpoint
    // de confirmation de paiement se désactive (aucun webhook Stripe attendu).
    const { env } = await import('../../src/config/env.js')
    const original = env.PAYMENTS_PROVIDER
    env.PAYMENTS_PROVIDER = 'simulate'
    try {
      const res = await postPaymentWebhook()
      expect(res.statusCode).toBe(503)
      expect(res.json()).toEqual({ error: 'stripe_disabled' })
    } finally {
      env.PAYMENTS_PROVIDER = original
    }
  })

  it('400 missing_signature si le header stripe-signature est absent', async () => {
    const res = await postPaymentWebhook(false)
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'missing_signature' })
  })

  it('403 invalid_signature si constructEvent throw', async () => {
    constructEventMock.mockImplementation(() => { throw new Error('bad sig') })
    const res = await postPaymentWebhook()
    expect(res.statusCode).toBe(403)
    expect(res.json()).toEqual({ error: 'invalid_signature' })
  })

  it('payment_intent.succeeded → paiement succeeded + résa scheduled', async () => {
    const { paymentId, reservationId } = await seedPendingPayment()
    constructEventMock.mockReturnValue(paymentEvent('payment_intent.succeeded', { paymentId }))

    const res = await postPaymentWebhook()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ received: true })
    expect(await paymentStatus(paymentId)).toBe('succeeded')
    expect(await reservationStatus(reservationId)).toBe('scheduled')
  })

  it('payment_intent.succeeded sans paymentId en metadata → 200 no-op', async () => {
    const { paymentId } = await seedPendingPayment()
    constructEventMock.mockReturnValue(paymentEvent('payment_intent.succeeded', {}))  // pas de paymentId

    const res = await postPaymentWebhook()
    expect(res.statusCode).toBe(200)
    expect(await paymentStatus(paymentId)).toBe('pending')  // inchangé
  })

  it('payment_intent.payment_failed → paiement failed', async () => {
    const { paymentId, reservationId } = await seedPendingPayment()
    constructEventMock.mockReturnValue(paymentEvent('payment_intent.payment_failed', { paymentId }))

    const res = await postPaymentWebhook()
    expect(res.statusCode).toBe(200)
    expect(await paymentStatus(paymentId)).toBe('failed')
    // La résa reste payable (pending_payment), pas de bascule.
    expect(await reservationStatus(reservationId)).toBe('pending_payment')
  })

  it('event non géré → 200 received sans effet', async () => {
    const { paymentId } = await seedPendingPayment()
    constructEventMock.mockReturnValue(paymentEvent('payment_intent.created', { paymentId }))

    const res = await postPaymentWebhook()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ received: true })
    expect(await paymentStatus(paymentId)).toBe('pending')  // inchangé
  })

  // ─── Recharge porte-monnaie (metadata.kind === 'wallet_topup') ───
  async function seedPendingTopup(): Promise<string> {
    const userId = randomUUID()
    await pgSql`INSERT INTO users (id, firebase_uid, email)
      VALUES (${userId}, ${'fb-' + userId.slice(0, 8)}, ${userId.slice(0, 8) + '@test.local'})`
    const topupId = randomUUID()
    await pgSql`INSERT INTO wallet_topups (id, user_id, amount_cents, currency, provider, status)
      VALUES (${topupId}, ${userId}, 2000, 'EUR', 'stripe', 'pending')`
    return topupId
  }
  const topupStatus = async (id: string): Promise<string> => {
    const [r] = await pgSql<{ status: string }[]>`SELECT status FROM wallet_topups WHERE id = ${id}`
    return r!.status
  }
  const topupEvent = (type: string, metadata: Record<string, string>): unknown =>
    ({ type, data: { object: { metadata, last_payment_error: { message: 'card_declined' } } } })

  it('payment_intent.succeeded kind=wallet_topup → confirmTopup (recharge succeeded)', async () => {
    const topupId = await seedPendingTopup()
    constructEventMock.mockReturnValue(topupEvent('payment_intent.succeeded', { kind: 'wallet_topup', topupId }))
    const res = await postPaymentWebhook()
    expect(res.statusCode).toBe(200)
    expect(await topupStatus(topupId)).toBe('succeeded')
  })

  it('payment_intent.payment_failed kind=wallet_topup → markTopupFailed (recharge failed)', async () => {
    const topupId = await seedPendingTopup()
    constructEventMock.mockReturnValue(topupEvent('payment_intent.payment_failed', { kind: 'wallet_topup', topupId }))
    const res = await postPaymentWebhook()
    expect(res.statusCode).toBe(200)
    expect(await topupStatus(topupId)).toBe('failed')
  })

  it('wallet_topup sans topupId → 200 no-op', async () => {
    constructEventMock.mockReturnValue(topupEvent('payment_intent.succeeded', { kind: 'wallet_topup' }))
    const res = await postPaymentWebhook()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ received: true })
  })

  it('payment_failed kind=wallet_topup sans topupId → 200 no-op (pas de crédit débité)', async () => {
    // Branche jumelle de la précédente côté échec : un topup failed sans
    // topupId en metadata ne doit rien tenter (garde ligne 76 de
    // stripe-webhook.ts) et répondre 200 pour couper les retries Stripe.
    const topupId = await seedPendingTopup()
    constructEventMock.mockReturnValue(topupEvent('payment_intent.payment_failed', { kind: 'wallet_topup' }))
    const res = await postPaymentWebhook()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ received: true })
    expect(await topupStatus(topupId)).toBe('pending') // inchangé
  })

  // ─── Idempotence : Stripe redélivre les events en cas de timeout ou de 5xx.
  // L'API doit traiter le 2ᵉ delivery comme un no-op (la 1ʳᵉ a déjà tout
  // fait). Cf. https://stripe.com/docs/webhooks#best-practices.
  // Les helpers idempotents sont dans lib/payments.ts (markPaymentSucceeded
  // retourne 'already_paid' si status déjà succeeded) et lib/wallet.ts
  // (confirmTopup retourne 'already' si status déjà succeeded). On vérifie
  // ici que la chaîne route → helper fonctionne bout-en-bout. ─────────────

  it('idempotence : payment_intent.succeeded redélivré → 200 sans double effet', async () => {
    const { paymentId, reservationId } = await seedPendingPayment()
    constructEventMock.mockReturnValue(paymentEvent('payment_intent.succeeded', { paymentId }))

    // 1ʳᵉ livraison : transition pending → succeeded + résa → scheduled.
    const res1 = await postPaymentWebhook()
    expect(res1.statusCode).toBe(200)
    expect(await paymentStatus(paymentId)).toBe('succeeded')
    expect(await reservationStatus(reservationId)).toBe('scheduled')

    // Capture paid_at pour vérifier qu'il n'est pas réécrit au 2ᵉ pass.
    const [{ paid_at: paidAt1 }] = await pgSql<{ paid_at: Date }[]>`
      SELECT paid_at FROM payments WHERE id = ${paymentId}`
    expect(paidAt1).not.toBeNull()

    // 2ᵉ livraison du même event (Stripe a vu un 5xx ou un timeout côté
    // notre serveur sur la 1ʳᵉ tentative et retente).
    const res2 = await postPaymentWebhook()
    expect(res2.statusCode).toBe(200)
    expect(res2.json()).toEqual({ received: true })

    // Le paid_at ne doit PAS avoir bougé (la transaction skip si already_paid).
    const [{ paid_at: paidAt2 }] = await pgSql<{ paid_at: Date }[]>`
      SELECT paid_at FROM payments WHERE id = ${paymentId}`
    expect(paidAt2!.getTime()).toBe(paidAt1!.getTime())
    expect(await reservationStatus(reservationId)).toBe('scheduled')
  })

  it('idempotence : wallet_topup succeeded redélivré → 200 sans double crédit', async () => {
    const topupId = await seedPendingTopup()
    constructEventMock.mockReturnValue(topupEvent('payment_intent.succeeded', { kind: 'wallet_topup', topupId }))

    const res1 = await postPaymentWebhook()
    expect(res1.statusCode).toBe(200)
    expect(await topupStatus(topupId)).toBe('succeeded')
    const [{ paid_at: paidAt1 }] = await pgSql<{ paid_at: Date }[]>`
      SELECT paid_at FROM wallet_topups WHERE id = ${topupId}`

    // Re-livraison du même event.
    const res2 = await postPaymentWebhook()
    expect(res2.statusCode).toBe(200)
    const [{ paid_at: paidAt2 }] = await pgSql<{ paid_at: Date }[]>`
      SELECT paid_at FROM wallet_topups WHERE id = ${topupId}`
    expect(paidAt2!.getTime()).toBe(paidAt1!.getTime())  // pas réécrit
  })

  it('robustesse : paymentId inconnu en metadata → 200 graceful (pas de crash)', async () => {
    // Cas d'un PaymentIntent Stripe avec un paymentId qui ne correspond à
    // aucune row de notre table `payments` (ex: paymentId orphelin après
    // un cleanup de test en prod). On doit répondre 200 pour que Stripe
    // arrête de retenter, pas crasher en 500.
    constructEventMock.mockReturnValue(
      paymentEvent('payment_intent.succeeded', { paymentId: randomUUID() }),
    )
    const res = await postPaymentWebhook()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ received: true })
  })

  it('robustesse : event failed reçu après un succeeded → succeeded reste intact', async () => {
    // Scénario rare mais possible : Stripe envoie d'abord un succeeded,
    // puis un payment_failed pour le même PaymentIntent (ex: chargeback
    // déguisé en failure côté Stripe). On NE DOIT PAS dégrader un
    // paiement déjà succeeded. La garde est dans `markPaymentFailed`
    // qui filtre WHERE status = 'pending' au SQL UPDATE.
    const { paymentId, reservationId } = await seedPendingPayment()

    // Étape 1 : succeeded.
    constructEventMock.mockReturnValue(paymentEvent('payment_intent.succeeded', { paymentId }))
    await postPaymentWebhook()
    expect(await paymentStatus(paymentId)).toBe('succeeded')
    expect(await reservationStatus(reservationId)).toBe('scheduled')

    // Étape 2 : failed event arrive après. Ne doit RIEN dégrader.
    constructEventMock.mockReturnValue(paymentEvent('payment_intent.payment_failed', { paymentId }))
    const res = await postPaymentWebhook()
    expect(res.statusCode).toBe(200)
    expect(await paymentStatus(paymentId)).toBe('succeeded')  // toujours succeeded
    expect(await reservationStatus(reservationId)).toBe('scheduled')  // résa intacte
  })
})
