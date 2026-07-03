/**
 * Zod DTOs partagés par les routes de réservations.
 *
 * Extraits de `routes/reservations.ts` (audit dette tech §2). Centralise les
 * schémas d'entrée/sortie pour qu'ils soient réutilisables entre les
 * sous-modules de routes (création, paiement, lifecycle, lecture).
 *
 * Les enums (`ReservationStatus`, `PaymentStatus`, `PaymentProvider`) viennent
 * de `@sportlocker/types` (source de vérité, alignée sur les enums SQL). Cf.
 * PR #316/#320 (dédup enums Zod).
 */
import { z } from 'zod'
import { PaymentProvider, PaymentStatus, ReservationStatus } from '@sportlocker/types'

import { MAX_EXTENSIONS } from './helpers.js'

// ─── Bodies ──────────────────────────────────────────────────────────────────

export const CreateReservationBody = z.object({
  lockerId: z.string().uuid().describe('UUID du casier ciblé (scanné via QR ou choisi depuis l\'app)'),
  itemId: z.string().uuid().describe('UUID de l\'item physique présent dans le casier (doit matcher `currentItemId`)'),
  communeId: z.string().uuid().describe('Tenant du distributeur (cohérence avec le scope de l\'app)'),
})

export const ReturnReservationBody = z.object({
  returnLockerId: z.string().uuid().describe('Casier où l\'item est rendu (peut différer du casier d\'emprunt)'),
  returnDistributorId: z.string().uuid().describe('Distributeur correspondant au returnLockerId'),
})

/**
 * Body de `POST /v1/reservations/:id/review`.
 *
 * `rating` obligatoire (1..5 étoiles), `comment` optionnel plafonné à 280
 * caractères (aligné sur la contrainte produit "micro-avis", pas un pavé).
 * Le trim + la conversion "chaîne vide → null" sont faits côté handler.
 */
export const CreateReviewBody = z.object({
  rating: z.number().int().min(1).max(5).describe('Note de 1 à 5 étoiles'),
  comment: z.string().trim().max(280).optional()
    .describe('Commentaire libre optionnel (280 caractères max)'),
})

export const CreateSlotReservationBody = z.object({
  distributorId: z.string().uuid().describe('Borne ciblée'),
  itemTypeId: z.string().uuid().describe('Sport / type de matériel souhaité (depuis /v1/item-types)'),
  slotStartAt: z.string().datetime({ offset: true })
    .describe('Début du créneau réservé (ISO 8601, aligné sur :00 ou :30 UTC)'),
  durationMinutes: z.number().int()
    .refine((n) => [30, 60, 90, 120, 1440].includes(n), { message: 'duration_not_allowed' })
    .describe('Durée du créneau, valeurs autorisées : 30, 60, 90, 120 (slots courts) ou 1440 (forfait journée)'),
})

// ─── Responses base ──────────────────────────────────────────────────────────

export const ReservationBaseDTO = z.object({
  id: z.string().uuid(),
  status: ReservationStatus
    .describe('État machine : scheduled (créneau futur) → active → returned (nominal modèle slots). pending = legacy modèle immédiat. overdue/cancelled/expired = terminal.'),
  lockerId: z.string().uuid(),
  itemId: z.string().uuid(),
  distributorId: z.string().uuid(),
  expiresAt: z.string().datetime().describe('TTL de la réservation pending (15min). Auto-expire au-delà.'),
  dueAt: z.string().datetime().nullable().describe('Échéance de retour (active). Null tant que pending.'),
  extensionCount: z.number().int().min(0).describe('Nombre de prolongations utilisées (max 2)'),
})

export const ReservationCreatedDTO = ReservationBaseDTO.extend({
  nonce: z.string().uuid().describe('Nonce anti-replay à embarquer dans le JWT QR. Usage unique côté firmware.'),
  deviceToken: z.string().describe(
    'JWT HS256 prêt à afficher en QR. Claims : reservationId, lockerId, distributorId, jti=nonce, exp=15min. '
    + 'Signé avec JWT_DEVICE_SECRET (partagé avec le firmware, vérification offline).',
  ),
})

export const PaymentSummaryDTO = z.object({
  id: z.string().uuid(),
  amountCents: z.number().int().nonnegative(),
  currency: z.string().describe('Code ISO 4217 (ex: EUR)'),
  provider: PaymentProvider,
  status: PaymentStatus,
})

export const SlotReservationCreatedDTO = ReservationBaseDTO.extend({
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

export const PaymentIntentDTO = z.object({
  paymentId: z.string().uuid(),
  provider: PaymentProvider,
  status: PaymentStatus,
  clientSecret: z.string().nullable().describe(
    'Secret du PaymentIntent Stripe à passer à Stripe.js côté client. '
    + 'null en mode `simulate` (le client appelle alors POST /:id/pay/confirm-simulated).',
  ),
})

export const SimulatedConfirmDTO = z.object({
  paymentStatus: PaymentStatus,
  reservationStatus: ReservationStatus,
})

export const WalletPayDTO = z.object({
  paymentStatus: z.literal('succeeded'),
  reservationStatus: z.literal('scheduled'),
  balanceCents: z.number().int().nonnegative()
    .describe('Solde restant du porte-monnaie après débit, en centimes.'),
})

// ─── Read DTOs ───────────────────────────────────────────────────────────────

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
export const ReservationActiveEnrichedDTO = z.object({
  id: z.string().uuid(),
  status: ReservationStatus,
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
export const ReservationHistoryDTO = z.object({
  id: z.string().uuid(),
  status: ReservationStatus,
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

/**
 * DTO renvoyé (201) par `POST /v1/reservations/:id/review`. Écho de l'avis
 * créé — le client s'en sert surtout pour confirmer l'enregistrement.
 */
export const ReviewCreatedDTO = z.object({
  id: z.string().uuid(),
  reservationId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  createdAt: z.string().datetime(),
})

export const ErrorDTO = z.object({ error: z.string() })
