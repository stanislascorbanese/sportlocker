/**
 * Bus temps réel dashboard — Redis pub/sub.
 *
 * Pourquoi Redis et pas Postgres LISTEN/NOTIFY : la prod tourne derrière le
 * pooler Supabase (port 6543, PgBouncer mode transaction) qui ne propage pas
 * les notifications de session → LISTEN serait muet. Redis est déjà en place
 * (cache, rate-limit, BullMQ), le fan-out multi-instance est natif : chaque
 * instance API `SUBSCRIBE` et pousse vers ses propres clients WS.
 *
 * Producteur : [[live-emit]] appelle `publishLiveEvent` post-commit à chaque
 * transition d'état casier/distributeur.
 * Consommateur : [[live-ws]] `subscribeLiveEvents` puis fan-out WebSocket scopé
 * par commune.
 *
 * Résilience : la publication ne doit JAMAIS faire échouer la requête métier
 * qui l'a déclenchée — les callers de [[live-emit]] swallow les erreurs. Le
 * subscriber revalide chaque message (schéma partagé `LiveEvent`) : un payload
 * corrompu est droppé, pas propagé aux sockets.
 */
import type { FastifyBaseLogger } from 'fastify'

import { LiveEvent } from '@sportlocker/types'

import { redis } from '../redis/client.js'

export const LIVE_CHANNEL = 'sl:live'

/**
 * Publie un event sur le canal Redis. `publish` est une commande normale →
 * on réutilise la connexion partagée (pas besoin d'une connexion dédiée, qui
 * n'est requise que côté `subscribe`).
 *
 * Non-bloquant si Redis est indisponible : le client partagé est configuré avec
 * `maxRetriesPerRequest: null` + `enableOfflineQueue`, donc un `publish` émis
 * hors connexion resterait *pending indéfiniment* — ce qui bloquerait la requête
 * métier appelante (l'émission est post-commit mais awaited). On skippe donc
 * quand le statut n'est pas `ready` : le temps réel est best-effort, jamais au
 * prix de la latence des écritures. Les clients WS re-synchronisent au reconnect.
 */
export async function publishLiveEvent(event: LiveEvent): Promise<void> {
  if (redis.status !== 'ready') return
  await redis.publish(LIVE_CHANNEL, JSON.stringify(event))
}

export interface LiveSubscription {
  close: () => Promise<void>
}

/**
 * Ouvre une connexion Redis dédiée (`duplicate`) — un client en mode subscribe
 * ne peut plus émettre de commandes normales, d'où la connexion séparée — et
 * invoque `onEvent` pour chaque `LiveEvent` valide reçu.
 */
export function subscribeLiveEvents(
  onEvent: (event: LiveEvent) => void,
  log: FastifyBaseLogger,
): LiveSubscription {
  const sub = redis.duplicate()

  sub.on('error', (err: Error) => log.error({ err: err.message }, 'live_bus_subscriber_error'))

  sub.subscribe(LIVE_CHANNEL).catch((err: unknown) => {
    log.error({ err }, 'live_bus_subscribe_failed')
  })

  sub.on('message', (channel: string, raw: string) => {
    if (channel !== LIVE_CHANNEL) return
    let payload: unknown
    try {
      payload = JSON.parse(raw)
    } catch {
      log.warn('live_bus_bad_json')
      return
    }
    const parsed = LiveEvent.safeParse(payload)
    if (!parsed.success) {
      log.warn({ issues: parsed.error.issues }, 'live_bus_bad_event')
      return
    }
    onEvent(parsed.data)
  })

  return {
    close: async () => {
      await sub.quit()
    },
  }
}
