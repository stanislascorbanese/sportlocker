/**
 * Émission des events temps réel dashboard — [[live-bus]].
 *
 * Ces helpers reconstruisent le DTO complet (casier + itemType, ou distributeur
 * + compteur idle) à partir d'un `lockerId`/`distributorId`, puis publient sur
 * le bus Redis. À appeler **après** le commit de la transaction métier — jamais
 * dedans — pour ne pas diffuser un état qui serait ensuite rollback.
 *
 * Contrat de robustesse : ces fonctions ne throwent jamais. Une panne Redis ou
 * une ligne introuvable est loguée et avalée — le temps réel est best-effort et
 * ne doit pas casser le chemin métier (réservation, MQTT, expiration…).
 *
 * Coût : une lecture SELECT par transition. Les changements d'état sont rares
 * devant les lectures, donc l'overhead est négligeable ; en contrepartie les
 * sites d'émission restent triviaux (un appel, aucun assemblage de payload).
 */
import { eq, sql } from 'drizzle-orm'
import type { FastifyBaseLogger } from 'fastify'

import type { LiveEvent, LockerEventType } from '@sportlocker/types'

import type { DB } from '../db/client.js'
import { distributors, items, itemTypes, lockers } from '../db/schema.js'
import { publishLiveEvent } from './live-bus.js'

export interface LiveEmitDeps {
  db: DB
  log: FastifyBaseLogger
}

/**
 * Diffuse la nouvelle photo d'un casier après une transition d'état.
 * `eventType` = l'événement métier qui a déclenché le changement (pour les
 * toasts / le fil d'activité côté UI), `null` si non pertinent.
 */
export async function emitLockerChange(
  deps: LiveEmitDeps,
  lockerId: string,
  eventType: LockerEventType | null,
): Promise<void> {
  const { db, log } = deps
  try {
    const [row] = await db
      .select({
        id: lockers.id,
        position: lockers.position,
        state: lockers.state,
        currentItemId: lockers.currentItemId,
        distributorId: lockers.distributorId,
        communeId: distributors.communeId,
        itemTypeId: itemTypes.id,
        itemTypeSlug: itemTypes.slug,
        itemTypeName: itemTypes.name,
        itemTypeCategory: itemTypes.category,
        itemTypeImageUrl: itemTypes.imageUrl,
      })
      .from(lockers)
      .innerJoin(distributors, eq(distributors.id, lockers.distributorId))
      .leftJoin(items, eq(lockers.currentItemId, items.id))
      .leftJoin(itemTypes, eq(items.itemTypeId, itemTypes.id))
      .where(eq(lockers.id, lockerId))
      .limit(1)

    if (!row) {
      log.warn({ lockerId }, 'live_emit_locker_not_found')
      return
    }

    const event: LiveEvent = {
      v: 1,
      kind: 'locker',
      distributorId: row.distributorId,
      communeId: row.communeId,
      eventType,
      locker: {
        id: row.id,
        position: row.position,
        state: row.state,
        currentItemId: row.currentItemId,
        itemType: row.itemTypeId
          ? {
              id: row.itemTypeId,
              slug: row.itemTypeSlug!,
              name: row.itemTypeName!,
              category: row.itemTypeCategory!,
              imageUrl: row.itemTypeImageUrl,
            }
          : null,
      },
      at: new Date().toISOString(),
    }

    await publishLiveEvent(event)
  } catch (err) {
    log.error({ err, lockerId }, 'live_emit_locker_failed')
  }
}

/**
 * Diffuse le nouvel état synthétique d'un distributeur (online/offline/
 * maintenance) + son nombre de casiers `idle` courant. Alimente la vue parc.
 */
export async function emitDistributorChange(
  deps: LiveEmitDeps,
  distributorId: string,
): Promise<void> {
  const { db, log } = deps
  try {
    const idleCount = sql<number>`(
      SELECT COUNT(*)::int FROM lockers
      WHERE lockers.distributor_id = ${distributors.id}
        AND lockers.state = 'idle'
    )`.as('idle_lockers')

    const [row] = await db
      .select({
        id: distributors.id,
        communeId: distributors.communeId,
        status: distributors.status,
        lastSeenAt: distributors.lastSeenAt,
        idleLockers: idleCount,
      })
      .from(distributors)
      .where(eq(distributors.id, distributorId))
      .limit(1)

    if (!row) {
      log.warn({ distributorId }, 'live_emit_distributor_not_found')
      return
    }

    const event: LiveEvent = {
      v: 1,
      kind: 'distributor',
      distributorId: row.id,
      communeId: row.communeId,
      status: row.status,
      idleLockers: row.idleLockers,
      lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
      at: new Date().toISOString(),
    }

    await publishLiveEvent(event)
  } catch (err) {
    log.error({ err, distributorId }, 'live_emit_distributor_failed')
  }
}
