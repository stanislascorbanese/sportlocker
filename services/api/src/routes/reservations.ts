import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { and, eq, gt, inArray, lt, ne, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { db } from '../db/client.js'
import {
  distributors, itemTypes, items, lockerEvents, lockers, pricingRules, reservations, tokenNonces,
} from '../db/schema.js'
import { signDeviceToken } from '../lib/jwt-device.js'
import { isPgViolation, PG_ERRORS } from '../lib/pg-errors.js'
import {
  computeSlotEnd, NO_SHOW_GRACE_MINUTES, validateSlotRequest,
} from '../lib/slots.js'
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
  status: z.enum(['scheduled', 'pending', 'active', 'returned', 'overdue', 'cancelled', 'expired'])
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

const SlotReservationCreatedDTO = ReservationBaseDTO.extend({
  slotStartAt: z.string().datetime().describe('Début du créneau réservé'),
  slotEndAt: z.string().datetime().describe('Fin du créneau (= start + durationMinutes)'),
  durationMinutes: z.number().int().describe('Durée du créneau en minutes'),
  priceCents: z.number().int().nonnegative().describe('Prix d\'affichage figé à la création (snapshot)'),
  nonce: z.string().uuid(),
  deviceToken: z.string().describe(
    'JWT HS256 prêt à afficher en QR. Valide jusqu\'à slot_end_at + grâce no-show.',
  ),
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
  status: z.enum(['scheduled', 'pending', 'active', 'returned', 'overdue', 'cancelled', 'expired']),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  dueAt: z.string().datetime().nullable(),
  qrToken: z.string().describe('JWT HS256 prêt à afficher en QR, re-signé à chaque GET avec le qr_jti stable.'),
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
      description: 'Crée une résa `scheduled` sur la fenêtre [slotStartAt, slotStartAt + durationMinutes). '
        + 'L\'API choisit un item dispo du type demandé (snapshot) et fige le prix d\'affichage depuis `pricing_rules`. '
        + 'Pas de paiement MVP : `priceCents` est informatif.\n\n'
        + 'Garde anti-monopole : 1 résa "vivante" max par user (scheduled/pending/active). '
        + 'Le QR (`deviceToken`) est valable jusqu\'à `slot_end_at + grâce` ; au-delà, le cron expire la résa.\n\n'
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
            status: 'scheduled',
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

      const ttlSec = Math.max(60, Math.floor(
        (result.qrExpiresAt.getTime() - Date.now()) / 1000,
      ))
      // `slotStartAt` est embarqué comme claim — le firmware refuse
      // l'ouverture avant cet instant (cf. PR 0010, slot-aware check-in).
      const deviceToken = await signDeviceToken({
        reservationId: result.reservation.id,
        lockerId: result.reservation.lockerId,
        distributorId,
        slotStartAt: Math.floor(result.reservation.slotStartAt!.getTime() / 1000),
      }, ttlSec, result.nonce)

      return reply.code(201).send({
        ...toDto(result.reservation),
        slotStartAt: result.reservation.slotStartAt!.toISOString(),
        slotEndAt: result.reservation.slotEndAt!.toISOString(),
        durationMinutes: result.reservation.durationMinutes!,
        priceCents: result.reservation.priceCents!,
        nonce: result.nonce,
        deviceToken,
      })
    } finally {
      await redis.del(lockKey)
    }
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
        inArray(reservations.status, ['scheduled', 'pending', 'active']),
      ))
      .limit(1)

    if (!row) return reply.code(404).send({ error: 'no_active_reservation' })

    // Re-signe un device JWT avec le qr_jti stable. TTL = jusqu'à expiresAt
    // (clamp à 60s minimum pour éviter un token déjà expiré sur un edge case).
    // Embarque `slotStartAt` pour les résas scheduled — le firmware s'en sert
    // pour bloquer un scan trop tôt (cf. PR 0010 slot-aware check-in).
    const ttlSec = Math.max(60, Math.floor((row.expiresAt.getTime() - Date.now()) / 1000))
    const qrToken = await signDeviceToken({
      reservationId: row.id,
      lockerId: row.lockerId,
      distributorId: row.distributorId,
      ...(row.slotStartAt ? { slotStartAt: Math.floor(row.slotStartAt.getTime() / 1000) } : {}),
    }, ttlSec, row.qrJti)

    return reply.code(200).send({
      id: row.id,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      dueAt: row.dueAt?.toISOString() ?? null,
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
   */
  app.get('/me', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Réservations'],
      summary: 'Historique du citoyen courant',
      description: 'Renvoie les 50 dernières réservations du user authentifié (statuts pending/active/returned/overdue).',
      security: [{ bearerAuth: [] }],
      response: { 200: z.object({ items: z.array(ReservationBaseDTO) }) },
    },
  }, async (req) => {
    const rows = await db
      .select()
      .from(reservations)
      .where(and(eq(reservations.userId, req.user.sub), inArray(reservations.status, [
        'scheduled', 'pending', 'active', 'returned', 'overdue',
      ])))
      .orderBy(reservations.createdAt)
      .limit(50)

    return { items: rows.map(toDto) }
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
      summary: 'Annule une réservation pending ou scheduled',
      description: `Accepte les statuts \`pending\` (legacy immédiat) et \`scheduled\` (slot futur). `
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

    return db.transaction(async (tx: DbTx) => {
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
        return reply.code(404).send({ error: 'reservation_not_cancellable' })
      }
      if (existing.status !== 'pending' && existing.status !== 'scheduled') {
        return reply.code(409).send({ error: 'reservation_not_cancellable' })
      }
      if (existing.status === 'scheduled' && existing.slotStartAt) {
        const minutesUntilStart = (existing.slotStartAt.getTime() - Date.now()) / 60_000
        if (minutesUntilStart < CANCEL_CUTOFF_MIN) {
          return reply.code(409).send({ error: 'too_late_to_cancel' })
        }
      }

      await tx
        .update(reservations)
        .set({ status: 'cancelled', cancellationReason: 'user_cancel', updatedAt: new Date() })
        .where(eq(reservations.id, id))

      // Le casier physique n'est lock que pour les résas `pending`
      // (POST /v1/reservations). Les `scheduled` ne réservent que l'item
      // (snapshot) — le casier reste idle.
      if (existing.status === 'pending') {
        await tx.update(lockers)
          .set({ state: 'idle', lastStateAt: new Date(), updatedAt: new Date() })
          .where(eq(lockers.id, existing.lockerId))
      }

      return reply.code(200).send({ ok: true as const })
    })
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
