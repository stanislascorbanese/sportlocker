import { z } from 'zod'

import { DistributorStatus, LockerEventType } from './enums'
import { DistributorLocker } from './distributor'

/**
 * Événements temps réel poussés vers le dashboard opérateur via WebSocket.
 *
 * Source de vérité partagée entre l'émetteur (`services/api` → bus Redis) et le
 * consommateur (`apps/dashboard` → `LiveLockerGrid` / liste parc). Toute
 * évolution du format se fait ici, jamais en dupliquant le type des deux côtés.
 *
 * Versionnement : `v` permet à un client déployé de rejeter proprement un
 * schéma qu'il ne comprend pas (au lieu de crasher sur un champ manquant).
 * On bump `v` uniquement sur un changement incompatible.
 *
 * `communeId` voyage dans chaque event : le serveur WS s'en sert pour scoper la
 * diffusion (un admin ne reçoit que sa commune ; super_admin reçoit tout) sans
 * relire la DB à chaque message.
 */
export const LIVE_PROTOCOL_VERSION = 1 as const

/**
 * Changement d'état d'un casier — reflète une transition
 * `lockers.state` (idle/reserved/active/returning/fault) et/ou son contenu.
 * `locker` est le DTO complet du casier (même forme que dans
 * `DistributorDetail.lockers`) pour que le client remplace la cellule sans
 * merge partiel ambigu.
 */
export const LiveLockerEvent = z.object({
  v: z.literal(LIVE_PROTOCOL_VERSION),
  kind: z.literal('locker'),
  distributorId: z.string().uuid(),
  communeId: z.string().uuid(),
  /** Type d'événement métier à l'origine du changement (pour toasts/audit UI). */
  eventType: LockerEventType.nullable(),
  locker: DistributorLocker,
  /** ISO 8601 — horodatage serveur de l'émission. */
  at: z.string().datetime(),
})

export type LiveLockerEvent = z.infer<typeof LiveLockerEvent>

/**
 * Changement d'état synthétique d'un distributeur — online/offline (heartbeat,
 * LWT MQTT) ou passage en maintenance. Alimente la vue « parc » (liste) et le
 * bandeau de la page détail.
 */
export const LiveDistributorEvent = z.object({
  v: z.literal(LIVE_PROTOCOL_VERSION),
  kind: z.literal('distributor'),
  distributorId: z.string().uuid(),
  communeId: z.string().uuid(),
  status: DistributorStatus,
  /** Casiers `idle` restants — recalculé à l'émission, null si non fourni. */
  idleLockers: z.number().int().min(0).nullable(),
  lastSeenAt: z.string().datetime().nullable(),
  at: z.string().datetime(),
})

export type LiveDistributorEvent = z.infer<typeof LiveDistributorEvent>

export const LiveEvent = z.discriminatedUnion('kind', [
  LiveLockerEvent,
  LiveDistributorEvent,
])

export type LiveEvent = z.infer<typeof LiveEvent>
