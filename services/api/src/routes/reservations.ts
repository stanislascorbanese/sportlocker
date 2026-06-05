import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { and, desc, eq, gt, inArray, lt, ne, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { env } from '../config/env.js'
import { db } from '../db/client.js'
import {
  distributors, itemTypes, items, lockerEvents, lockers, payments, pricingRules, reservations, tokenNonces,
} from '../db/schema.js'
import { signDeviceToken } from '../lib/jwt-device.js'
import { markPaymentSucceeded } from '../lib/payments.js'
import { isPgViolation, PG_ERRORS } from '../lib/pg-errors.js'
import {
  computeSlotEnd, NO_SHOW_GRACE_MINUTES, validateSlotRequest,
} from '../lib/slots.js'
import { requireStripe } from '../lib/stripe.js'
import { redis } from '../redis/client.js'

const RESERVATION_TTL_MS = 15 * 60 * 1000
const DEVICE_TOKEN_TTL_SEC = 15 * 60
const LOCK_TTL_SEC = 30
const MAX_EXTENSIONS = 2
const IDEMPOTENCY_TTL_SEC = 24 * 60 * 60
const IDEMPOTENCY_KEY_MAX_LEN = 255
// Fenêtre de blocage de l'annulation côté citoyen avant le début du slot.
// Au-delà de ce délai, le créneau est considéré comme engagé (cf. CDC :
// donne le temps au tenant de planifier le rechargement matériel et évite
// les annulations "régret" juste avant arrivée).
const CANCEL_CUTOFF_MIN = 30

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0]

const CreateReservationBody = z.object({
  lockerId: z.string().uuid().describe('UUID du casier ciblé (scanné via QR ou choisi depuis l\'app)'),
  itemId: z.string().uuid().describe('UUID de l\'item physique présent dans le casier (doit matcher `currentItemId`)'),
  communeId: z.string().uuid().describe('Tenant du distributeur (cohérence avec le scope de l\'app)'),
})

const ReturnReservationBody = z.object({
  returnLockerId: z.string().uuid().describe('Casier où l\'item est rendu (peut différer du casier d\'emprunt)'),
  returnDistributorId: z.string().uuid().describe('Distributeur correspondant au returnLockerId'),
})

const ReservationBaseDTO = z.object({
  id: z.string().uuid(),
  status: z.enum(['pending_payment', 'scheduled', 'pending', 'active', 'returned', 'overdue', 'cancelled', 'expired'])
    .describe('État machine : scheduled (créneau futur) → active → returned (nominal modèle slots). pending = legacy modèle immédiat. overdue/cancelled/expired = terminal.'),
  lockerId: z.string().uuid(),
  itemId: z.string().uuid(),
  distributorId: z.string().uuid(),
  expiresAt: z.string().datetime().describe('TTL de la réservation pending (15min). Auto-expire au-delà.'),
  dueAt: z.string().datetime().nullable().describe('Échéance de retour (active). Null tant que pending.'),
  extensionCount: z.number().int().min(0).describe('Nombre de prolongations utilisées (max 2)'),
})

const ReservationCreatedDTO = ReservationBaseDTO.extend({
  nonce: z.string().uuid().describe('Nonce anti-replay à embarquer dans le JWT QR. Usage unique côté firmware.'),
  deviceToken: z.string().describe(
    'JWT HS256 prêt à afficher en QR. Claims : reservationId, lockerId, distributorId, jti=nonce, exp=15min. '
    + 'Signé avec JWT_DEVICE_SECRET (partagé avec le firmware, vérification offline).',
  ),
})

const CreateSlotReservationBody = z.object({
  distributorId: z.string().uuid().describe('Borne ciblée'),
  itemTypeId: z.string().uuid().describe('Sport / type de matériel souhaité (depuis /v1/item-types)'),
  slotStartAt: z.string().datetime({ offset: true })
    .describe('Début du créneau réservé (ISO 8601, aligné sur :00 ou :30 UTC)'),
  durationMinutes: z.number().int()
    .refine((n) => [30, 60, 90, 120, 1440].includes(n), { message: 'duration_not_allowed' })
    .describe('Durée du créneau, valeurs autorisées : 30, 60, 90, 120 (slots courts) ou 1440 (forfait journée)'),
})

const PaymentSummaryDTO = z.object({
  id: z.string().uuid(),
  amountCents: z.number().int().nonnegative(),
  currency: z.string().describe('Code ISO 4217 (ex: EUR)'),
  provider: z.enum(['stripe', 'simulate']),
  status: z.enum(['pending', 'succeeded', 'failed', 'cancelled', 'refunded']),
})

const SlotReservationCreatedDTO = ReservationBaseDTO.extend({
  slotStartAt: z.string().datetime().describe('Début du créneau réservé'),
  slotEndAt: z.string().datetime().describe('Fin du créneau (= start + durationMinutes)'),
  durationMinutes: z.number().int().describe('Durée du créneau en minutes'),
  priceCents: z.number().int().nonnegative().describe('Prix figé à la création (snapshot)'),
  payment: PaymentSummaryDTO.describe(
    'Paiement à régler pour confirmer la résa. Tant que `status !== succeeded`, '
    + 'la résa reste `pending_payment` et AUCUN QR n\'est délivré. '
    + 'Appeler ensuite POST /:id/pay pour obtenir le clientSecret (stripe) ou confirmer (simulate).',
  ),
})

const PaymentIntentDTO = z.object({
  paymentId: z.string().uuid(),
  provider: z.enum(['stripe', 'simulate']),
  status: z.enum(['pending', 'succeeded', 'failed', 'cancelled', 'refunded']),
  clientSecret: z.string().nullable().describe(
    'Secret du PaymentIntent Stripe à passer à Stripe.js côté client. '
    + 'null en mode `simulate` (le client appelle alors POST /:id/pay/confirm-simulated).',
  ),
})

const SimulatedConfirmDTO = z.object({
  paymentStatus: z.enum(['pending', 'succeeded', 'failed', 'cancelled', 'refunded']),
  reservationStatus: z.enum([
    'pending_payment', 'scheduled', 'pending', 'active', 'returned', 'overdue', 'cancelled', 'expired',
  ]),
})

/**
 * DTO enrichi renvoyé par `GET /v1/reservations/active` : joint le distributeur
 * (name, adresse) et le type d'item (nom affichable) attendus par les clients
 * mobile/PWA pour rendre l'écran "réservation en cours" sans 2e round-trip.
 *
 * `qrToken` = JWT HS256 re-signé à la volée avec le `qr_jti` stable de la résa
 * (réutilisation du nonce → le firmware accepte au 1er scan, anti-replay
 * géré par `token_nonces`). TTL = secondes jusqu'à `expiresAt`.
 *
 * Les champs slot (`slotStartAt`, `slotEndAt`, `durationMinutes`, `priceCents`)
 * sont nullables : peuplés UNIQUEMENT pour les résas créées via le flow
 * `POST /v1/reservations/slots` (statut `scheduled`). Les résas legacy
 * `pending`/`active` les ont à null.
 */
const ReservationActiveEnrichedDTO = z.object({
  id: z.string().uuid(),
  status: z.enum(['pending_payment', 'scheduled', 'pending', 'active', 'returned', 'overdue', 'cancelled', 'expired']),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  dueAt: z.string().datetime().nullable(),
  extensionCount: z.number().int().min(0)
    .describe('Nombre de prolongations utilisées (max ' + String(MAX_EXTENSIONS) + ')'),
  qrToken: z.string().nullable().describe(
    'JWT HS256 prêt à afficher en QR, re-signé à chaque GET avec le qr_jti stable. '
    + 'null tant que la résa est `pending_payment` (paiement non réglé → pas de QR).',
  ),
  distributor: z.object({
    id: z.string().uuid(),
    name: z.string(),
    addressLine: z.string().nullable(),
  }),
  item: z.object({
    id: z.string().uuid(),
    typeName: z.string(),
  }),
  slotStartAt: z.string().datetime().nullable(),
  slotEndAt: z.string().datetime().nullable(),
  durationMinutes: z.number().int().nullable(),
  priceCents: z.number().int().nonnegative().nullable(),
})

/**
 * DTO enrichi pour `GET /v1/reservations/me` (historique).
 *
 * Inclut tous les statuts (vivants ET terminaux) et joint les noms du
 * distributeur et du type d'item — la page /profile citizen affiche
 * directement sans round-trip supplémentaire.
 *
 * Pas de qrToken ici (l'historique n'en a pas besoin ; pour scanner la
 * résa vivante, le citoyen va sur /reservations/<id> qui appelle /active).
 */
const ReservationHistoryDTO = z.object({
  id: z.string().uuid(),
  status: z.enum(['pending_payment', 'scheduled', 'pending', 'active', 'returned', 'overdue', 'cancelled', 'expired']),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  dueAt: z.string().datetime().nullable(),
  openedAt: z.string().datetime().nullable(),
  returnedAt: z.string().datetime().nullable(),
  extensionCount: z.number().int().min(0),
  slotStartAt: z.string().datetime().nullable(),
  slotEndAt: z.string().datetime().nullable(),
  durationMinutes: z.number().int().nullable(),
  priceCents: z.number().int().nonnegative().nullable(),
  distributor: z.object({
    id: z.string().uuid(),
    name: z.string(),
  }),
  item: z.object({
    id: z.string().uuid(),
    typeName: z.string(),
  }),
})

const ErrorDTO = z.object({ error: z.string() })

function readIdempotencyKey(headers: Record<string, unknown>): string | null {
  const raw = headers['idempotency-key']
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (trimmed.length === 0 || trimmed.length > IDEMPOTENCY_KEY_MAX_LEN) return null
  return trimmed
}

type ReservationRow = typeof reservations.$inferSelect

function toDto(r: ReservationRow) {
  return {
    id: r.id,
    status: r.status,
    lockerId: r.lockerId,
    itemId: r.itemId,
    distributorId: r.distributorId,
    expiresAt: r.expiresAt.toISOString(),
    dueAt: r.dueAt?.toISOString() ?? null,
    extensionCount: r.extensionCount,
  }
}

export async function reservationRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

  /**
   * POST /v1/reservations — réserve un casier et émet un nonce QR.
   */
  app.post('/', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Réservations'],
      summary: 'Réserve un casier (citoyen)',
      description: 'Verrouille le casier (Redis SETNX TTL 30s) puis crée la réservation en transaction. '
        + 'Émet un `nonce` anti-replay et un `deviceToken` (JWT HS256, exp 15min, jti=nonce) prêt à afficher en QR. '
        + 'Le firmware vérifie le JWT offline avec `JWT_DEVICE_SECRET`.\n\n'
        + 'Header optionnel `Idempotency-Key` : si fourni, la réponse est mise en cache 24h par (user, key) ; '
        + 'rejouer la même requête renvoie la même réponse sans créer de nouvelle réservation.\n\n'
        + '**Erreurs** :\n'
        + '- 404 `locker_not_found`\n'
        + '- 409 `already_active` (le user a déjà une réservation pending/active)\n'
        + '- 409 `locker_being_processed` (autre user en train de réserver)\n'
        + '- 409 `locker_not_available` (state ≠ idle ou aucun item)\n'
        + '- 409 `item_mismatch` (itemId fourni ≠ currentItemId du casier)\n'
        + '- 409 `commune_mismatch` (communeId ≠ commune du distributeur)',
      security: [{ bearerAuth: [] }],
      body: CreateReservationBody,
      response: {
        201: ReservationCreatedDTO,
        404: ErrorDTO,
        409: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const userId = req.user.sub
    const { lockerId, itemId, communeId } = req.body

    // Idempotency-Key : si la même clé arrive 2× (réseau flaky, retry app), on
    // renvoie la réponse cachée. Scope = par user pour éviter qu'une clé
    // devine collide entre utilisateurs.
    const idempKey = readIdempotencyKey(req.headers as Record<string, unknown>)
    const idempCacheKey = idempKey ? `idem:reservations:${userId}:${idempKey}` : null
    if (idempCacheKey) {
      const cached = await redis.get(idempCacheKey)
      if (cached) {
        try {
          // On ne cache que les 201 (cf. plus bas) ⇒ shape ReservationCreatedDTO.
          const parsed = JSON.parse(cached) as { status: 201; body: z.infer<typeof ReservationCreatedDTO> }
          return reply.code(parsed.status).send(parsed.body)
        } catch {
          // Cache corrompu — on poursuit comme si rien n'était caché.
        }
      }
    }

    const lockKey = `lock:locker:${lockerId}`
    const acquired = await redis.set(lockKey, userId, 'EX', LOCK_TTL_SEC, 'NX')
    if (acquired !== 'OK') {
      return reply.code(409).send({ error: 'locker_being_processed' })
    }

    try {
      const result = await db.transaction(async (tx) => {
        // Garde "une seule réservation vivante par user" — première ligne de
        // défense (erreur métier propre). Le filet de sécurité est l'index
        // partiel unique idx_reservations_one_active_per_user (migration 0005)
        // capté plus bas dans le catch.
        const existingActive = await tx
          .select({ id: reservations.id })
          .from(reservations)
          .where(and(
            eq(reservations.userId, userId),
            inArray(reservations.status, ['scheduled', 'pending', 'active']),
          ))
          .limit(1)
        if (existingActive.length > 0) {
          return { kind: 'already_active' as const }
        }

        const [locker] = await tx
          .select({
            id: lockers.id,
            distributorId: lockers.distributorId,
            currentItemId: lockers.currentItemId,
          })
          .from(lockers)
          .where(eq(lockers.id, lockerId))
          .limit(1)

        if (!locker) {
          return { kind: 'locker_not_found' as const }
        }

        const availabilityRows = await tx.execute<{ is_available: boolean }>(
          sql`SELECT fn_locker_is_available(${lockerId}::uuid) AS is_available`,
        )
        if (availabilityRows[0]?.is_available !== true) {
          return { kind: 'locker_not_available' as const }
        }

        if (locker.currentItemId !== itemId) {
          return { kind: 'item_mismatch' as const }
        }

        const [dist] = await tx
          .select({ communeId: distributors.communeId })
          .from(distributors)
          .where(eq(distributors.id, locker.distributorId))
          .limit(1)
        if (!dist || dist.communeId !== communeId) {
          return { kind: 'commune_mismatch' as const }
        }

        const nonce = randomUUID()
        const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS)
        const now = new Date()

        const [reservation] = await tx
          .insert(reservations)
          .values({
            userId,
            lockerId,
            itemId,
            distributorId: locker.distributorId,
            status: 'pending',
            qrJti: nonce,
            expiresAt,
          })
          .returning()

        await tx.insert(tokenNonces).values({
          nonce,
          reservationId: reservation!.id,
          distributorId: locker.distributorId,
        })

        await tx
          .update(lockers)
          .set({ state: 'reserved', lastStateAt: now, updatedAt: now })
          .where(eq(lockers.id, lockerId))

        await tx.insert(lockerEvents).values({
          lockerId,
          reservationId: reservation!.id,
          eventType: 'reserved',
          source: 'api',
        })

        return { kind: 'ok' as const, reservation: reservation!, nonce, distributorId: locker.distributorId }
      }).catch((err: unknown) => {
        // Race entre 2 POST simultanés du même user (lockers différents) :
        // le SELECT préalable peut voir "rien" mais l'INSERT viole l'index
        // partiel unique idx_reservations_one_live_per_user (migration 0008,
        // remplace 0005). On traite comme `already_active`.
        if (isPgViolation(err, PG_ERRORS.UNIQUE_VIOLATION, 'one_live_per_user')) {
          return { kind: 'already_active' as const }
        }
        throw err
      })

      if (result.kind === 'locker_not_found') {
        return reply.code(404).send({ error: 'locker_not_found' })
      }
      if (result.kind === 'already_active') {
        return reply.code(409).send({ error: 'already_active' })
      }
      if (result.kind === 'locker_not_available') {
        return reply.code(409).send({ error: 'locker_not_available' })
      }
      if (result.kind === 'item_mismatch') {
        return reply.code(409).send({ error: 'item_mismatch' })
      }
      if (result.kind === 'commune_mismatch') {
        return reply.code(409).send({ error: 'commune_mismatch' })
      }

      const deviceToken = await signDeviceToken({
        reservationId: result.reservation.id,
        lockerId,
        distributorId: result.distributorId,
      }, DEVICE_TOKEN_TTL_SEC, result.nonce)

      const body = { ...toDto(result.reservation), nonce: result.nonce, deviceToken }

      if (idempCacheKey) {
        await redis.set(
          idempCacheKey,
          JSON.stringify({ status: 201, body }),
          'EX',
          IDEMPOTENCY_TTL_SEC,
        )
      }

      return reply.code(201).send(body)
    } finally {
      await redis.del(lockKey)
    }
  })

  /**
   * POST /v1/reservations/slots — réserve un créneau futur (modèle slots).
   *
   * Pendant slot-aware de POST /v1/reservations (qui lui crée une résa
   * "immédiate" en `pending` et lock le casier). Ici on crée une résa
   * `scheduled` qui ne réserve PAS le casier physique : seul l'item est
   * snapshot. À slot_start_at, le user vient scanner et la résa transite
   * vers `active` (mécanique du firmware/check-in, hors scope PR 2).
   */
  app.post('/slots', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Réservations'],
      summary: 'Réserve un créneau futur (modèle slots)',
      description: 'Crée une résa `pending_payment` sur la fenêtre [slotStartAt, slotStartAt + durationMinutes). '
        + 'L\'API choisit un item dispo du type demandé (snapshot) et fige le prix depuis `pricing_rules`. '
        + 'Le slot/item sont tenus mais AUCUN QR n\'est délivré tant que le paiement n\'a pas réussi : '
        + 'appeler ensuite `POST /:id/pay`, puis (stripe) attendre le webhook ou (simulate) '
        + '`POST /:id/pay/confirm-simulated`. À la réussite, la résa passe `scheduled` et le QR est servi par `GET /active`.\n\n'
        + 'Garde anti-monopole : 1 résa "vivante" max par user (pending_payment/scheduled/pending/active). '
        + 'Une résa `pending_payment` impayée est expirée par le cron après `PAYMENT_TTL_MINUTES`.\n\n'
        + '**Erreurs** :\n'
        + '- 404 `distributor_not_found`\n'
        + '- 409 `already_active` (le user a déjà une résa vivante)\n'
        + '- 409 `slot_not_available` (aucun item libre sur le slot)\n'
        + '- 409 `slot_being_processed` (autre user en train de réserver le même slot)\n'
        + '- 422 `slot_not_aligned` / `slot_in_past` / `slot_too_far` / `slot_outside_opening_hours` / `duration_not_allowed`\n'
        + '- 422 `no_pricing` (pas de pricing_rule pour ce triplet — tenant non configuré)',
      security: [{ bearerAuth: [] }],
      body: CreateSlotReservationBody,
      response: {
        201: SlotReservationCreatedDTO,
        404: ErrorDTO,
        409: ErrorDTO,
        422: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const userId = req.user.sub
    const { distributorId, itemTypeId, slotStartAt: slotStartAtStr, durationMinutes } = req.body

    const slotStartAt = new Date(slotStartAtStr)
    const validation = validateSlotRequest({ slotStartAt, durationMinutes })
    if (validation !== null) return reply.code(422).send({ error: validation })

    const slotEndAt = computeSlotEnd(slotStartAt, durationMinutes)

    const [dist] = await db
      .select({ id: distributors.id, communeId: distributors.communeId })
      .from(distributors)
      .where(eq(distributors.id, distributorId))
      .limit(1)
    if (!dist) return reply.code(404).send({ error: 'distributor_not_found' })

    // Tarif (commune × item_type × duration). Pas de règle = créneau non
    // proposé pour ce sport dans cette commune.
    const [price] = await db
      .select({ priceCents: pricingRules.priceCents })
      .from(pricingRules)
      .where(and(
        eq(pricingRules.communeId, dist.communeId),
        eq(pricingRules.itemTypeId, itemTypeId),
        eq(pricingRules.durationMinutes, durationMinutes),
      ))
      .limit(1)
    if (!price) return reply.code(422).send({ error: 'no_pricing' })

    // Sérialise les booking concurrents sur le même créneau. Évite que deux
    // citoyens grabbent le dernier item du type au même moment.
    const slotIso = slotStartAt.toISOString()
    const lockKey = `lock:slot:${distributorId}:${itemTypeId}:${slotIso}:${durationMinutes}`
    const acquired = await redis.set(lockKey, userId, 'EX', LOCK_TTL_SEC, 'NX')
    if (acquired !== 'OK') return reply.code(409).send({ error: 'slot_being_processed' })

    try {
      const result = await db.transaction(async (tx) => {
        // Anti-monopole : 1 résa vivante max par user. SELECT préalable +
        // filet via l'index partiel unique (catché dans le .catch en sortie).
        const existing = await tx
          .select({ id: reservations.id })
          .from(reservations)
          .where(and(
            eq(reservations.userId, userId),
            inArray(reservations.status, ['scheduled', 'pending', 'active']),
          ))
          .limit(1)
        if (existing.length > 0) return { kind: 'already_active' as const }

        // Items du type sur ce distributeur.
        const candidates = await tx
          .select({ id: items.id, lockerId: lockers.id })
          .from(items)
          .innerJoin(lockers, eq(items.currentLockerId, lockers.id))
          .where(and(
            eq(lockers.distributorId, distributorId),
            eq(items.itemTypeId, itemTypeId),
          ))
        if (candidates.length === 0) return { kind: 'slot_not_available' as const }

        // Items déjà occupés par une résa qui overlap [slotStartAt, slotEndAt).
        const busy = await tx
          .select({ itemId: reservations.itemId })
          .from(reservations)
          .where(and(
            inArray(reservations.itemId, candidates.map((c) => c.id)),
            inArray(reservations.status, ['scheduled', 'pending', 'active']),
            sql`${reservations.slotStartAt} IS NOT NULL`,
            sql`${reservations.slotEndAt} IS NOT NULL`,
            lt(reservations.slotStartAt, slotEndAt),
            gt(reservations.slotEndAt, slotStartAt),
          ))
        const busyIds = new Set(busy.map((b) => b.itemId))
        const free = candidates.find((c) => !busyIds.has(c.id))
        if (!free) return { kind: 'slot_not_available' as const }

        const nonce = randomUUID()
        // Le QR est valable jusqu'à la fin du slot + la fenêtre de grâce
        // no-show — au-delà, le cron expire la résa et le firmware refusera
        // de toute façon (token expiré). On garde la `expires_at` du modèle
        // legacy pour la cohérence des cron existants, mais c'est en
        // pratique une bound supérieure de l'usage.
        const qrExpiresAt = new Date(slotEndAt.getTime() + NO_SHOW_GRACE_MINUTES * 60 * 1000)

        const [reservation] = await tx
          .insert(reservations)
          .values({
            userId,
            lockerId: free.lockerId,
            itemId: free.id,
            distributorId,
            status: 'pending_payment',
            qrJti: nonce,
            expiresAt: qrExpiresAt,
            slotStartAt,
            slotEndAt,
            durationMinutes,
            priceCents: price.priceCents,
          })
          .returning()

        await tx.insert(tokenNonces).values({
          nonce,
          reservationId: reservation!.id,
          distributorId,
        })

        // Paiement à régler avant que la résa ne devienne `scheduled`. Le
        // provider est figé selon l'env au moment de la création : un paiement
        // créé en `simulate` reste confirmable en simulate même si l'API passe
        // en stripe entre-temps.
        const [payment] = await tx
          .insert(payments)
          .values({
            reservationId: reservation!.id,
            userId,
            amountCents: price.priceCents,
            currency: 'EUR',
            provider: env.PAYMENTS_PROVIDER,
            status: 'pending',
          })
          .returning()

        await tx.insert(lockerEvents).values({
          lockerId: free.lockerId,
          reservationId: reservation!.id,
          eventType: 'reserved',
          source: 'api',
          metadata: {
            slotStartAt: slotStartAt.toISOString(),
            slotEndAt: slotEndAt.toISOString(),
            durationMinutes,
            priceCents: price.priceCents,
            mode: 'slot',
          },
        })

        return {
          kind: 'ok' as const,
          reservation: reservation!,
          payment: payment!,
          nonce,
          qrExpiresAt,
        }
      }).catch((err: unknown) => {
        if (isPgViolation(err, PG_ERRORS.UNIQUE_VIOLATION, 'one_live_per_user')) {
          return { kind: 'already_active' as const }
        }
        throw err
      })

      if (result.kind === 'already_active') {
        return reply.code(409).send({ error: 'already_active' })
      }
      if (result.kind === 'slot_not_available') {
        return reply.code(409).send({ error: 'slot_not_available' })
      }

      // Pas de deviceToken ici : le QR n'est délivré (par GET /active) qu'une
      // fois la résa passée `scheduled`, c.-à-d. après paiement réussi.
      return reply.code(201).send({
        ...toDto(result.reservation),
        slotStartAt: result.reservation.slotStartAt!.toISOString(),
        slotEndAt: result.reservation.slotEndAt!.toISOString(),
        durationMinutes: result.reservation.durationMinutes!,
        priceCents: result.reservation.priceCents!,
        payment: {
          id: result.payment.id,
          amountCents: result.payment.amountCents,
          currency: result.payment.currency,
          provider: result.payment.provider as 'stripe' | 'simulate',
          status: result.payment.status,
        },
      })
    } finally {
      await redis.del(lockKey)
    }
  })

  /**
   * POST /v1/reservations/:id/pay — initialise le paiement de la location.
   *
   * - `stripe`   : crée (ou réutilise) un PaymentIntent et renvoie son
   *   `clientSecret` pour Stripe.js. Idempotent : un 2e appel retrouve le PI
   *   existant via `stripe_payment_intent_id`.
   * - `simulate` : aucun appel Stripe, renvoie `clientSecret: null`. Le client
   *   enchaîne sur `POST /:id/pay/confirm-simulated`.
   *
   * Réservé au propriétaire de la résa, qui doit être en `pending_payment`.
   */
  app.post('/:id/pay', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Réservations'],
      summary: 'Initialise le paiement d\'une location (PaymentIntent Stripe ou simulate)',
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string().uuid() }),
      response: {
        200: PaymentIntentDTO,
        403: ErrorDTO,
        404: ErrorDTO,
        409: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const userId = req.user.sub
    const { id } = req.params

    const [pay] = await db
      .select({
        id: payments.id,
        userId: payments.userId,
        status: payments.status,
        provider: payments.provider,
        amountCents: payments.amountCents,
        currency: payments.currency,
        reservationId: payments.reservationId,
        stripePaymentIntentId: payments.stripePaymentIntentId,
        reservationStatus: reservations.status,
      })
      .from(payments)
      .innerJoin(reservations, eq(reservations.id, payments.reservationId))
      .where(eq(payments.reservationId, id))
      .limit(1)

    if (!pay) return reply.code(404).send({ error: 'payment_not_found' })
    if (pay.userId !== userId) return reply.code(403).send({ error: 'forbidden' })
    if (pay.status === 'succeeded') return reply.code(409).send({ error: 'already_paid' })
    if (pay.reservationStatus !== 'pending_payment') {
      return reply.code(409).send({ error: 'reservation_not_payable' })
    }

    if (pay.provider === 'simulate') {
      return reply.code(200).send({
        paymentId: pay.id,
        provider: 'simulate' as const,
        status: pay.status,
        clientSecret: null,
      })
    }

    // Provider stripe : crée le PaymentIntent au 1er appel, le réutilise ensuite.
    const stripe = requireStripe()
    let clientSecret: string | null
    if (pay.stripePaymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(pay.stripePaymentIntentId)
      clientSecret = pi.client_secret
    } else {
      const pi = await stripe.paymentIntents.create({
        amount: pay.amountCents,
        currency: pay.currency.toLowerCase(),
        metadata: { paymentId: pay.id, reservationId: pay.reservationId, userId },
        // Carte uniquement : la carte embarque nativement Apple Pay & Google Pay
        // (wallets) dans le PaymentElement. On évite ainsi Link / Revolut /
        // UnionPay qui polluaient l'UI citoyenne (vs automatic_payment_methods
        // qui exposait tous les moyens activés sur le compte Stripe).
        payment_method_types: ['card'],
      }, { idempotencyKey: `pay_${pay.id}` })
      clientSecret = pi.client_secret
      await db
        .update(payments)
        .set({ stripePaymentIntentId: pi.id, updatedAt: new Date() })
        .where(eq(payments.id, pay.id))
    }

    return reply.code(200).send({
      paymentId: pay.id,
      provider: 'stripe' as const,
      status: pay.status,
      clientSecret,
    })
  })

  /**
   * POST /v1/reservations/:id/pay/confirm-simulated — confirme un paiement
   * simulé (dev/staging sans Stripe). Réservé aux paiements `provider=simulate`.
   *
   * En prod (PAYMENTS_PROVIDER=stripe), les paiements naissent avec
   * provider=stripe, donc cet endpoint renvoie 409 `not_simulated` : pas de
   * porte dérobée pour valider un vrai paiement sans passer par Stripe.
   */
  app.post('/:id/pay/confirm-simulated', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Réservations'],
      summary: 'Confirme un paiement simulé → bascule la résa en scheduled',
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string().uuid() }),
      response: {
        200: SimulatedConfirmDTO,
        403: ErrorDTO,
        404: ErrorDTO,
        409: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const userId = req.user.sub
    const { id } = req.params

    const [pay] = await db
      .select({
        id: payments.id,
        userId: payments.userId,
        provider: payments.provider,
        status: payments.status,
      })
      .from(payments)
      .where(eq(payments.reservationId, id))
      .limit(1)

    if (!pay) return reply.code(404).send({ error: 'payment_not_found' })
    if (pay.userId !== userId) return reply.code(403).send({ error: 'forbidden' })
    if (pay.provider !== 'simulate') return reply.code(409).send({ error: 'not_simulated' })

    const res = await markPaymentSucceeded(pay.id, app.log)
    if (res.kind === 'not_found') return reply.code(404).send({ error: 'payment_not_found' })
    if (res.kind === 'reservation_not_pending') {
      return reply.code(409).send({ error: 'reservation_not_payable' })
    }

    const [row] = await db
      .select({ paymentStatus: payments.status, reservationStatus: reservations.status })
      .from(payments)
      .innerJoin(reservations, eq(reservations.id, payments.reservationId))
      .where(eq(payments.id, pay.id))
      .limit(1)

    return reply.code(200).send({
      paymentStatus: row!.paymentStatus,
      reservationStatus: row!.reservationStatus,
    })
  })

  /**
   * GET /v1/reservations/active — réservation scheduled/pending/active courante.
   *
   * Pendant de la garde "une seule réservation vivante par user" : l'app
   * mobile interroge cet endpoint au boot pour savoir s'il y a un emprunt
   * en cours. Renvoie 404 sinon (plutôt que 200 avec null) pour éviter le
   * piège des clients qui oublient de check null.
   *
   * Le DTO est enrichi (distributor.name, item.typeName, slot fields) pour
   * que l'écran "résa en cours" se rende sans 2e round-trip. Le `qrToken`
   * est un JWT re-signé à la volée à partir du `qr_jti` stable — le firmware
   * accepte au 1er scan, anti-replay via `token_nonces`.
   */
  app.get('/active', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Réservations'],
      summary: 'Réservation scheduled/pending/active du citoyen courant',
      description: 'Renvoie la réservation vivante du user (au plus 1 par contrainte métier), '
        + 'enrichie avec le nom du distributeur, le type d\'item et un qrToken JWT prêt à scanner. '
        + '404 `no_active_reservation` si aucune.',
      security: [{ bearerAuth: [] }],
      response: { 200: ReservationActiveEnrichedDTO, 404: ErrorDTO },
    },
  }, async (req, reply) => {
    const [row] = await db
      .select({
        id: reservations.id,
        status: reservations.status,
        lockerId: reservations.lockerId,
        itemId: reservations.itemId,
        distributorId: reservations.distributorId,
        qrJti: reservations.qrJti,
        createdAt: reservations.createdAt,
        expiresAt: reservations.expiresAt,
        dueAt: reservations.dueAt,
        extensionCount: reservations.extensionCount,
        slotStartAt: reservations.slotStartAt,
        slotEndAt: reservations.slotEndAt,
        durationMinutes: reservations.durationMinutes,
        priceCents: reservations.priceCents,
        distributorName: distributors.name,
        distributorAddressLine: distributors.addressLine,
        itemTypeName: itemTypes.name,
      })
      .from(reservations)
      .innerJoin(distributors, eq(distributors.id, reservations.distributorId))
      .innerJoin(items, eq(items.id, reservations.itemId))
      .innerJoin(itemTypes, eq(itemTypes.id, items.itemTypeId))
      .where(and(
        eq(reservations.userId, req.user.sub),
        inArray(reservations.status, ['pending_payment', 'scheduled', 'pending', 'active']),
      ))
      .limit(1)

    if (!row) return reply.code(404).send({ error: 'no_active_reservation' })

    // Re-signe un device JWT avec le qr_jti stable. TTL = jusqu'à expiresAt
    // (clamp à 60s minimum pour éviter un token déjà expiré sur un edge case).
    // Embarque `slotStartAt` pour les résas scheduled — le firmware s'en sert
    // pour bloquer un scan trop tôt (cf. PR 0010 slot-aware check-in).
    //
    // Exception `pending_payment` : aucun QR tant que le paiement n'a pas
    // réussi. Le client affiche l'écran de paiement, pas le QR.
    const qrToken = row.status === 'pending_payment'
      ? null
      : await signDeviceToken({
        reservationId: row.id,
        lockerId: row.lockerId,
        distributorId: row.distributorId,
        ...(row.slotStartAt ? { slotStartAt: Math.floor(row.slotStartAt.getTime() / 1000) } : {}),
      }, Math.max(60, Math.floor((row.expiresAt.getTime() - Date.now()) / 1000)), row.qrJti)

    return reply.code(200).send({
      id: row.id,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      dueAt: row.dueAt?.toISOString() ?? null,
      extensionCount: row.extensionCount,
      qrToken,
      distributor: {
        id: row.distributorId,
        name: row.distributorName,
        addressLine: row.distributorAddressLine,
      },
      item: {
        id: row.itemId,
        typeName: row.itemTypeName,
      },
      slotStartAt: row.slotStartAt?.toISOString() ?? null,
      slotEndAt: row.slotEndAt?.toISOString() ?? null,
      durationMinutes: row.durationMinutes,
      priceCents: row.priceCents,
    })
  })

  /**
   * GET /v1/reservations/me — historique de l'utilisateur courant.
   *
   * DTO enrichi (distributor.name, item.typeName, champs slot) pour permettre
   * à la page /profile citizen d'afficher la liste sans round-trip
   * supplémentaire. Trié createdAt DESC (la plus récente en premier).
   */
  app.get('/me', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Réservations'],
      summary: 'Historique du citoyen courant',
      description: 'Renvoie les 50 dernières réservations du user authentifié, '
        + 'enrichies avec le nom du distributeur, le type d\'item et les champs slot, '
        + 'triées par createdAt DESC. Inclut les statuts terminaux (returned/cancelled/'
        + 'expired) en plus des vivants (scheduled/pending/active/overdue).',
      security: [{ bearerAuth: [] }],
      response: { 200: z.object({ items: z.array(ReservationHistoryDTO) }) },
    },
  }, async (req) => {
    const rows = await db
      .select({
        id: reservations.id,
        status: reservations.status,
        createdAt: reservations.createdAt,
        expiresAt: reservations.expiresAt,
        dueAt: reservations.dueAt,
        openedAt: reservations.openedAt,
        returnedAt: reservations.returnedAt,
        extensionCount: reservations.extensionCount,
        slotStartAt: reservations.slotStartAt,
        slotEndAt: reservations.slotEndAt,
        durationMinutes: reservations.durationMinutes,
        priceCents: reservations.priceCents,
        distributorId: reservations.distributorId,
        distributorName: distributors.name,
        itemId: reservations.itemId,
        itemTypeName: itemTypes.name,
      })
      .from(reservations)
      .innerJoin(distributors, eq(distributors.id, reservations.distributorId))
      .innerJoin(items, eq(items.id, reservations.itemId))
      .innerJoin(itemTypes, eq(itemTypes.id, items.itemTypeId))
      .where(eq(reservations.userId, req.user.sub))
      .orderBy(desc(reservations.createdAt))
      .limit(50)

    return {
      items: rows.map((row) => ({
        id: row.id,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        dueAt: row.dueAt?.toISOString() ?? null,
        openedAt: row.openedAt?.toISOString() ?? null,
        returnedAt: row.returnedAt?.toISOString() ?? null,
        extensionCount: row.extensionCount,
        slotStartAt: row.slotStartAt?.toISOString() ?? null,
        slotEndAt: row.slotEndAt?.toISOString() ?? null,
        durationMinutes: row.durationMinutes,
        priceCents: row.priceCents,
        distributor: { id: row.distributorId, name: row.distributorName },
        item: { id: row.itemId, typeName: row.itemTypeName },
      })),
    }
  })

  /**
   * POST /v1/reservations/:id/cancel — annule avant ouverture.
   *
   * Modes :
   *   - `pending`   : cancel à tout moment avant le scan firmware (legacy).
   *                   Le casier est libéré (state→idle).
   *   - `scheduled` : cancel jusqu'à `CANCEL_CUTOFF_MIN` minutes avant
   *                   `slotStartAt`. Au-delà, refus 409 `too_late_to_cancel`
   *                   pour laisser à l'opérateur le temps d'anticiper.
   *                   Pas de libération de casier (rien n'était réservé physiquement).
   */
  app.post('/:id/cancel', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Réservations'],
      summary: 'Annule une réservation pending_payment, pending ou scheduled',
      description: `Accepte les statuts \`pending_payment\` (paiement non réglé), \`pending\` (legacy immédiat) et \`scheduled\` (slot futur). `
        + `Pour \`scheduled\`, refuse 409 \`too_late_to_cancel\` si \`slotStartAt - now < ${CANCEL_CUTOFF_MIN} min\`. `
        + 'Pour une annulation en cours d\'usage (status `active`), voir `POST /v1/admin/reservations/:id/force-cancel` côté admin.',
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string().uuid() }),
      response: {
        200: z.object({ ok: z.literal(true) }),
        404: ErrorDTO,
        409: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const userId = req.user.sub
    const { id } = req.params

    // On calcule le résultat DANS la transaction mais on n'envoie la réponse
    // qu'APRÈS le commit. Appeler `reply.send()` à l'intérieur du callback
    // flushait la réponse 200 avant que drizzle n'émette `COMMIT` : un client
    // (ou un test relisant la résa sur une autre connexion) pouvait alors voir
    // l'ancien statut `pending` juste après avoir reçu `{ ok: true }`.
    type CancelResult =
      | { code: 200; body: { ok: true } }
      | { code: 404 | 409; body: { error: string } }

    const result = await db.transaction(async (tx: DbTx): Promise<CancelResult> => {
      const [existing] = await tx
        .select({
          id: reservations.id,
          status: reservations.status,
          lockerId: reservations.lockerId,
          slotStartAt: reservations.slotStartAt,
        })
        .from(reservations)
        .where(and(eq(reservations.id, id), eq(reservations.userId, userId)))
        .limit(1)

      if (!existing) {
        return { code: 404, body: { error: 'reservation_not_cancellable' } }
      }
      const cancellable = ['pending_payment', 'pending', 'scheduled']
      if (!cancellable.includes(existing.status)) {
        return { code: 409, body: { error: 'reservation_not_cancellable' } }
      }
      if (existing.status === 'scheduled' && existing.slotStartAt) {
        const minutesUntilStart = (existing.slotStartAt.getTime() - Date.now()) / 60_000
        if (minutesUntilStart < CANCEL_CUTOFF_MIN) {
          return { code: 409, body: { error: 'too_late_to_cancel' } }
        }
      }

      await tx
        .update(reservations)
        .set({ status: 'cancelled', cancellationReason: 'user_cancel', updatedAt: new Date() })
        .where(eq(reservations.id, id))

      // Annule aussi le paiement en attente le cas échéant (résa jamais payée).
      // No-op si le paiement est déjà succeeded/failed (filtre sur 'pending').
      if (existing.status === 'pending_payment') {
        await tx.update(payments)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(and(eq(payments.reservationId, id), eq(payments.status, 'pending')))
      }

      // Le casier physique n'est lock que pour les résas `pending`
      // (POST /v1/reservations). Les `scheduled`/`pending_payment` ne réservent
      // que l'item (snapshot) — le casier reste idle.
      if (existing.status === 'pending') {
        await tx.update(lockers)
          .set({ state: 'idle', lastStateAt: new Date(), updatedAt: new Date() })
          .where(eq(lockers.id, existing.lockerId))
      }

      return { code: 200, body: { ok: true as const } }
    })

    return reply.code(result.code).send(result.body)
  })

  /**
   * POST /v1/reservations/:id/return — confirme le retour d'un item.
   */
  app.post('/:id/return', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Réservations'],
      summary: 'Confirme le retour d\'un item',
      description: 'Accepte statuts `active` (retour dans les temps) ET `overdue` (retour hors délai). '
        + 'Le flag `wasOverdue` permet au client d\'afficher un toast adapté. Libère le casier d\'emprunt initial.',
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string().uuid() }),
      body: ReturnReservationBody,
      response: {
        200: ReservationBaseDTO.extend({
          wasOverdue: z.boolean().describe('True si le retour intervient après dueAt (status="overdue" au moment du retour)'),
        }),
        404: ErrorDTO,
        409: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const userId = req.user.sub
    const { id } = req.params
    const { returnLockerId, returnDistributorId } = req.body
    const now = new Date()

    const result = await db.transaction(async (tx: DbTx) => {
      const [existing] = await tx
        .select()
        .from(reservations)
        .where(eq(reservations.id, id))
        .limit(1)

      if (!existing || existing.userId !== userId) {
        return { kind: 'not_found' as const }
      }
      // Accepte 'active' (retour dans les temps) ET 'overdue' (retour hors délai).
      // Le client distingue via le status renvoyé : 'returned' vs le wasOverdue ci-dessous.
      const wasOverdue = existing.status === 'overdue'
      if (existing.status !== 'active' && !wasOverdue) {
        return { kind: 'not_returnable' as const }
      }

      const [updated] = await tx
        .update(reservations)
        .set({
          status: 'returned',
          returnedAt: now,
          returnLockerId,
          returnDistributorId,
          updatedAt: now,
        })
        .where(eq(reservations.id, id))
        .returning()

      await tx.update(lockers)
        .set({ state: 'idle', lastStateAt: now, updatedAt: now })
        .where(eq(lockers.id, existing.lockerId))

      await tx.insert(lockerEvents).values({
        lockerId: returnLockerId,
        reservationId: id,
        eventType: 'returned',
        source: 'api',
      })

      return { kind: 'ok' as const, reservation: updated!, wasOverdue }
    })

    if (result.kind === 'not_found') {
      return reply.code(404).send({ error: 'reservation_not_found' })
    }
    if (result.kind === 'not_returnable') {
      return reply.code(409).send({ error: 'reservation_not_returnable' })
    }

    return reply.code(200).send({ ...toDto(result.reservation), wasOverdue: result.wasOverdue })
  })

  /**
   * PATCH /v1/reservations/:id/extend — prolonge l'emprunt actif.
   *
   * Règles métier :
   *   - réservation appartient à l'utilisateur courant (sinon 404)
   *   - status = 'active' (sinon 409 reservation_not_extendable)
   *   - extension_count < 2 (sinon 409 max_extensions_reached)
   *   - aucune autre résa pending/active sur le même locker (sinon 409 locker_conflict)
   *
   * Calcul : new_due_at = due_at + item_types.max_duration_minutes.
   * Transaction PG avec SELECT FOR UPDATE pour sérialiser deux PATCH concurrents.
   */
  app.patch('/:id/extend', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Réservations'],
      summary: 'Prolonge un emprunt actif',
      description: 'Max 2 prolongations. Ajoute `item_types.max_duration_minutes` à `due_at`. '
        + 'Erreurs : 409 `reservation_not_extendable` (status ≠ active), 409 `max_extensions_reached`, '
        + '409 `locker_conflict` (autre résa pending/active sur le même casier).',
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string().uuid() }),
      response: {
        200: ReservationBaseDTO,
        404: ErrorDTO,
        409: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const userId = req.user.sub
    const { id } = req.params

    const result = await db.transaction(async (tx: DbTx) => {
      const [r] = await tx
        .select()
        .from(reservations)
        .where(eq(reservations.id, id))
        .for('update')
        .limit(1)

      if (!r || r.userId !== userId) return { kind: 'not_found' as const }
      if (r.status !== 'active' || !r.dueAt) {
        return { kind: 'not_extendable' as const }
      }
      if (r.extensionCount >= MAX_EXTENSIONS) {
        return { kind: 'max_reached' as const }
      }

      // Conflit : une autre réservation pending/active sur le même casier.
      // En régime nominal personne d'autre ne peut être pending/active sur ce
      // locker (state machine), mais on garde la vérif comme garde-fou.
      const conflicts = await tx
        .select({ id: reservations.id })
        .from(reservations)
        .where(and(
          eq(reservations.lockerId, r.lockerId),
          ne(reservations.id, id),
          inArray(reservations.status, ['pending', 'active']),
        ))
        .limit(1)
      if (conflicts.length > 0) return { kind: 'locker_conflict' as const }

      const [itemInfo] = await tx
        .select({ maxDurationMinutes: itemTypes.maxDurationMinutes })
        .from(items)
        .innerJoin(itemTypes, eq(itemTypes.id, items.itemTypeId))
        .where(eq(items.id, r.itemId))
        .limit(1)
      if (!itemInfo) return { kind: 'item_type_missing' as const }

      const newDueAt = new Date(r.dueAt.getTime() + itemInfo.maxDurationMinutes * 60 * 1000)
      const newExtensionCount = r.extensionCount + 1
      const now = new Date()

      const [updated] = await tx
        .update(reservations)
        .set({
          dueAt: newDueAt,
          extensionCount: newExtensionCount,
          updatedAt: now,
        })
        .where(eq(reservations.id, id))
        .returning()

      await tx.insert(lockerEvents).values({
        lockerId: r.lockerId,
        reservationId: id,
        eventType: 'extended',
        source: 'api',
        metadata: {
          newDueAt: newDueAt.toISOString(),
          extensionCount: newExtensionCount,
          addedMinutes: itemInfo.maxDurationMinutes,
        },
      })

      return { kind: 'ok' as const, reservation: updated! }
    })

    if (result.kind === 'not_found') {
      return reply.code(404).send({ error: 'reservation_not_found' })
    }
    if (result.kind === 'not_extendable') {
      return reply.code(409).send({ error: 'reservation_not_extendable' })
    }
    if (result.kind === 'max_reached') {
      return reply.code(409).send({ error: 'max_extensions_reached' })
    }
    if (result.kind === 'locker_conflict') {
      return reply.code(409).send({ error: 'locker_conflict' })
    }
    if (result.kind === 'item_type_missing') {
      return reply.code(409).send({ error: 'item_type_missing' })
    }

    return reply.code(200).send(toDto(result.reservation))
  })
}
