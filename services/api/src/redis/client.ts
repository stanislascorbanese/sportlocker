import { Redis } from 'ioredis'
import { env } from '../config/env.js'

/**
 * Connexion partagée pour cache et lectures rapides (stocks, sessions).
 * BullMQ utilise sa propre connexion dans queues/index.ts (recommandation officielle).
 */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  // backoff exponentiel plafonné — évite le hot-loop quand Redis est down
  retryStrategy: (times: number) => Math.min(times * 500, 10_000),
})

// Anti-spam : on log la PREMIÈRE erreur (avec un cooldown si on reste déconnecté
// longtemps), puis on attend une reconnexion réussie pour réinitialiser.
let lastErrorLoggedAt = 0
redis.on('error', (err: Error) => {
  const now = Date.now()
  if (now - lastErrorLoggedAt > 30_000) {
    // eslint-disable-next-line no-console
    console.warn(`[redis] not reachable: ${err.message} — retrying in background`)
    lastErrorLoggedAt = now
  }
})
redis.on('ready', () => {
  if (lastErrorLoggedAt > 0) {
    // eslint-disable-next-line no-console
    console.info('[redis] connection restored')
    lastErrorLoggedAt = 0
  }
})

const STOCK_KEY = (distributorId: string, itemTypeId: string) =>
  `stock:${distributorId}:${itemTypeId}`

export async function getStock(distributorId: string, itemTypeId: string): Promise<number | null> {
  const raw = await redis.get(STOCK_KEY(distributorId, itemTypeId))
  return raw == null ? null : Number(raw)
}

export async function setStock(distributorId: string, itemTypeId: string, count: number): Promise<void> {
  await redis.set(STOCK_KEY(distributorId, itemTypeId), count, 'EX', 300)
}

export async function decrStock(distributorId: string, itemTypeId: string): Promise<number> {
  return redis.decr(STOCK_KEY(distributorId, itemTypeId))
}
