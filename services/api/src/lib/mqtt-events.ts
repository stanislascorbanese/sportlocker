/**
 * Handlers métier pour les événements MQTT publiés par les distributeurs.
 *
 * Topics traités :
 *   - sportlocker/{deviceId}/event      → événements signés HMAC (door_unlocked, …)
 *   - sportlocker/{deviceId}/heartbeat  → télémétrie périodique (non signée)
 *   - sportlocker/{deviceId}/status     → online/offline retained + LWT (non signé)
 *
 * Sécurité :
 *   - Les events sont vérifiés HMAC via [[mqtt-hmac]]. Sans signature valide,
 *     on log un warning et on drop — un attaquant qui pwn le broker ne peut
 *     pas flipper une réservation en `active`.
 *   - Le heartbeat et le status ne sont pas signés (info de bas niveau,
 *     pas d'impact sécuritaire — au pire un attaquant fait croire qu'un
 *     distributeur est online → opérateur appelle le terrain).
 *
 * Idempotence : tous les handlers sont sûrs de rejouer plusieurs fois la
 * même payload (no-op si l'état terminal est déjà atteint).
 */
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { FastifyBaseLogger } from 'fastify'

import type { DB } from '../db/client.js'
import {
  distributorHeartbeats,
  distributors,
  lockerEvents,
  lockers,
  reservations,
} from '../db/schema.js'
import { parseSignedEnvelope, verifySignature } from './mqtt-hmac.js'
import { emitDistributorChange, emitLockerChange } from './live-emit.js'

export interface MqttEventDeps {
  db: DB
  log: FastifyBaseLogger
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

// ─── /event ────────────────────────────────────────────────────────────────

interface DoorUnlockedData {
  type: 'door_unlocked'
  deviceId: string
  reservationId: string
  lockerId: string
  jti: string
  openedAt: number
  mode: 'online' | 'offline' | undefined
}

function parseDoorUnlocked(data: Record<string, unknown>): DoorUnlockedData | null {
  if (data.type !== 'door_unlocked') return null
  if (!isUuid(data.deviceId)) return null
  if (!isUuid(data.reservationId)) return null
  if (!isUuid(data.lockerId)) return null
  if (typeof data.jti !== 'string' || !data.jti) return null
  if (typeof data.openedAt !== 'number' || !Number.isFinite(data.openedAt)) return null
  const mode: 'online' | 'offline' | undefined =
    data.mode === 'offline' || data.mode === 'online' ? data.mode : undefined
  return {
    type: 'door_unlocked',
    deviceId: data.deviceId,
    reservationId: data.reservationId,
    lockerId: data.lockerId,
    jti: data.jti,
    openedAt: data.openedAt,
    mode,
  }
}

/**
 * Vérifie HMAC + dispatch sur le bon sous-handler (type ∈ {door_unlocked, …}).
 * Retourne `false` si signature invalide ou format pas reconnu — utile pour
 * les tests.
 */
export async function handleEnvelope(
  envelope: unknown,
  deviceIdFromTopic: string,
  deps: MqttEventDeps,
): Promise<boolean> {
  const parsed = parseSignedEnvelope(envelope)
  if (!parsed) {
    deps.log.warn({ deviceId: deviceIdFromTopic }, 'mqtt_event_bad_envelope')
    return false
  }
  if (!verifySignature(parsed.data, parsed.sig)) {
    deps.log.warn({ deviceId: deviceIdFromTopic }, 'mqtt_event_bad_signature')
    return false
  }
  // Protection contre l'usurpation de deviceId : le topic dicte l'identité.
  if (parsed.data.deviceId !== deviceIdFromTopic) {
    deps.log.warn(
      { topicDevice: deviceIdFromTopic, payloadDevice: parsed.data.deviceId },
      'mqtt_event_device_mismatch',
    )
    return false
  }

  if (parsed.data.type === 'door_unlocked') {
    const event = parseDoorUnlocked(parsed.data)
    if (!event) {
      deps.log.warn({ data: parsed.data }, 'mqtt_event_door_unlocked_bad_payload')
      return false
    }
    await handleDoorUnlocked(event, deps)
    return true
  }

  deps.log.debug({ type: parsed.data.type }, 'mqtt_event_unknown_type')
  return false
}

/**
 * Transition résa scheduled/pending → active + état casier + locker_events.
 *
 * Idempotent : si la résa est déjà active ou dans un état terminal
 * (returned/cancelled/expired), on no-op.
 */
export async function handleDoorUnlocked(
  event: DoorUnlockedData,
  deps: MqttEventDeps,
): Promise<void> {
  const { db, log } = deps
  const openedAt = new Date(event.openedAt * 1000)

  await db.transaction(async (tx) => {
    const [res] = await tx
      .select({
        id: reservations.id,
        status: reservations.status,
        lockerId: reservations.lockerId,
        distributorId: reservations.distributorId,
        openedAt: reservations.openedAt,
        slotEndAt: reservations.slotEndAt,
      })
      .from(reservations)
      .where(eq(reservations.id, event.reservationId))
      .limit(1)

    if (!res) {
      log.warn({ reservationId: event.reservationId }, 'mqtt_door_unlocked_resa_not_found')
      return
    }
    if (res.distributorId !== event.deviceId || res.lockerId !== event.lockerId) {
      log.warn(
        {
          reservationId: event.reservationId,
          expected: { distributorId: res.distributorId, lockerId: res.lockerId },
          got: { distributorId: event.deviceId, lockerId: event.lockerId },
        },
        'mqtt_door_unlocked_locker_mismatch',
      )
      return
    }

    if (res.status === 'active' && res.openedAt) {
      // Idempotent : event rejoué (firmware reconnect + flush pending_events).
      log.debug({ reservationId: event.reservationId }, 'mqtt_door_unlocked_idempotent')
      return
    }
    if (res.status !== 'scheduled' && res.status !== 'pending' && res.status !== 'active') {
      log.warn(
        { reservationId: event.reservationId, status: res.status },
        'mqtt_door_unlocked_unexpected_status',
      )
      return
    }

    await tx
      .update(reservations)
      .set({
        status: 'active',
        openedAt,
        // Deadline de retour = fin du créneau réservé (CGU art. 5 : « la
        // restitution doit intervenir avant la fin du créneau réservé »). Sans
        // ça, due_at restait NULL → detect-overdue (pénalité trust_score + push)
        // ET la prolongation de résa étaient inopérants en prod. Résa legacy sans
        // slot (slot_end_at NULL) : due_at reste NULL, comportement inchangé.
        dueAt: res.slotEndAt,
        updatedAt: sql`now()`,
      })
      .where(eq(reservations.id, event.reservationId))

    await tx
      .update(lockers)
      .set({
        state: 'active',
        lastStateAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(lockers.id, event.lockerId))

    await tx.insert(lockerEvents).values({
      lockerId: event.lockerId,
      reservationId: event.reservationId,
      eventType: 'opened',
      source: 'mqtt',
      metadata: { jti: event.jti, mode: event.mode ?? 'online', deviceId: event.deviceId },
    })

    log.info(
      { reservationId: event.reservationId, lockerId: event.lockerId, mode: event.mode },
      'mqtt_door_unlocked_applied',
    )
  })

  // Diffusion temps réel post-commit (best-effort, ne throw jamais). On émet
  // aussi sur un rejeu idempotent : la cellule est simplement remplacée par un
  // état identique côté dashboard — inoffensif et sans branche conditionnelle
  // fragile à maintenir en synchro avec les early-returns de la transaction.
  await emitLockerChange(deps, event.lockerId, 'opened')
}

// ─── /heartbeat ────────────────────────────────────────────────────────────

interface HeartbeatPayload {
  deviceId: string
  uptimeSeconds: number | undefined
  cpuTempC: number | null | undefined
  freeMemMb: number | null | undefined
}

function parseHeartbeat(payload: unknown): HeartbeatPayload | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (!isUuid(p.deviceId)) return null
  const uptime = typeof p.uptimeSeconds === 'number' ? p.uptimeSeconds : undefined
  const cpu =
    p.cpuTempC === null
      ? null
      : typeof p.cpuTempC === 'number'
        ? p.cpuTempC
        : undefined
  const mem =
    p.freeMemMb === null
      ? null
      : typeof p.freeMemMb === 'number'
        ? p.freeMemMb
        : undefined
  return { deviceId: p.deviceId, uptimeSeconds: uptime, cpuTempC: cpu, freeMemMb: mem }
}

export async function handleHeartbeat(
  payload: unknown,
  deviceIdFromTopic: string,
  deps: MqttEventDeps,
): Promise<boolean> {
  const hb = parseHeartbeat(payload)
  if (!hb || hb.deviceId !== deviceIdFromTopic) {
    deps.log.warn({ deviceId: deviceIdFromTopic }, 'mqtt_heartbeat_bad_payload')
    return false
  }

  // Un heartbeat arrive périodiquement (télémétrie) : on ne diffuse un event
  // "distributeur" QUE si le statut change réellement (offline → online). Sinon
  // on inonderait le bus/dashboard à chaque battement.
  let cameOnline = false

  await deps.db.transaction(async (tx) => {
    const [dist] = await tx
      .select({ id: distributors.id, status: distributors.status })
      .from(distributors)
      .where(eq(distributors.id, hb.deviceId))
      .limit(1)
    if (!dist) {
      deps.log.warn({ deviceId: hb.deviceId }, 'mqtt_heartbeat_unknown_device')
      return
    }
    cameOnline = dist.status !== 'online' && dist.status !== 'maintenance'

    await tx.insert(distributorHeartbeats).values({
      distributorId: hb.deviceId,
      uptimeSeconds: hb.uptimeSeconds ?? null,
      // numeric() en Drizzle accepte string ou null
      cpuTempC: hb.cpuTempC == null ? null : String(hb.cpuTempC),
      freeMemMb: hb.freeMemMb ?? null,
    })

    await tx
      .update(distributors)
      .set({
        lastSeenAt: sql`now()`,
        // Si le distributeur était offline/maintenance, le heartbeat le ramène online.
        // On laisse 'maintenance' tel quel — c'est un override opérateur.
        status: dist.status === 'maintenance' ? dist.status : 'online',
        updatedAt: sql`now()`,
      })
      .where(eq(distributors.id, hb.deviceId))
  })

  if (cameOnline) await emitDistributorChange(deps, hb.deviceId)
  return true
}

// ─── /status (LWT + online retained) ───────────────────────────────────────

interface StatusPayload {
  deviceId: string
  online: boolean
  reason: string | undefined
}

function parseStatus(payload: unknown): StatusPayload | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (!isUuid(p.deviceId)) return null
  if (typeof p.online !== 'boolean') return null
  return {
    deviceId: p.deviceId,
    online: p.online,
    reason: typeof p.reason === 'string' ? p.reason : undefined,
  }
}

export async function handleStatus(
  payload: unknown,
  deviceIdFromTopic: string,
  deps: MqttEventDeps,
): Promise<boolean> {
  const st = parseStatus(payload)
  if (!st || st.deviceId !== deviceIdFromTopic) {
    deps.log.warn({ deviceId: deviceIdFromTopic }, 'mqtt_status_bad_payload')
    return false
  }

  const result = await deps.db
    .update(distributors)
    .set({
      // Comme heartbeat : on respecte un override 'maintenance' explicite.
      status: sql`CASE WHEN ${distributors.status} = 'maintenance' THEN ${distributors.status}
                       ELSE ${st.online ? 'online' : 'offline'}::distributor_status END`,
      ...(st.online ? { lastSeenAt: sql`now()` } : {}),
      updatedAt: sql`now()`,
    })
    .where(eq(distributors.id, st.deviceId))
    .returning({ id: distributors.id })

  if (result.length === 0) {
    deps.log.warn({ deviceId: st.deviceId }, 'mqtt_status_unknown_device')
    return false
  }
  deps.log.debug(
    { deviceId: st.deviceId, online: st.online, reason: st.reason },
    'mqtt_status_applied',
  )
  // Transition online/offline explicite (connexion / LWT) → toujours diffusée.
  await emitDistributorChange(deps, st.deviceId)
  return true
}

// ─── Routing par topic ─────────────────────────────────────────────────────

/**
 * Extrait `(deviceId, suffix)` d'un topic ``sportlocker/<deviceId>/<suffix>``.
 * Retourne `null` si format incompatible.
 */
export function parseTopic(topic: string): { deviceId: string; suffix: string } | null {
  const parts = topic.split('/')
  if (parts.length < 3 || parts[0] !== 'sportlocker') return null
  const deviceId = parts[1]
  const suffix = parts.slice(2).join('/')
  if (!isUuid(deviceId)) return null
  return { deviceId, suffix }
}

/**
 * Point d'entrée unifié : route un message arbitraire vers le bon handler.
 * Les messages dont le topic ne matche aucun handler sont silencieusement
 * ignorés (autres clients sur le même broker).
 */
export async function dispatchMqttMessage(
  topic: string,
  payload: unknown,
  deps: MqttEventDeps,
): Promise<{ matched: boolean; ok: boolean }> {
  // On ne traite pas les sous-topics cmd/* — ils sont entrants (API → firmware)
  // et ne doivent jamais être consommés par l'API elle-même (loopback).
  const parsed = parseTopic(topic)
  if (!parsed) return { matched: false, ok: false }

  if (parsed.suffix === 'event') {
    const ok = await handleEnvelope(payload, parsed.deviceId, deps)
    return { matched: true, ok }
  }
  if (parsed.suffix === 'heartbeat') {
    const ok = await handleHeartbeat(payload, parsed.deviceId, deps)
    return { matched: true, ok }
  }
  if (parsed.suffix === 'status') {
    const ok = await handleStatus(payload, parsed.deviceId, deps)
    return { matched: true, ok }
  }
  return { matched: false, ok: false }
}
