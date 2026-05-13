import { drizzle } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm'
import postgres from 'postgres'

import { env } from '../config/env.js'
import * as schema from './schema.js'

/**
 * postgres-js est lazy : `postgres(url, opts)` n'ouvre AUCUNE connexion TCP.
 * Le serveur démarre donc même si Postgres est down. La première vraie requête
 * lèvera une erreur de connexion ; les routes doivent l'attraper proprement.
 *
 * Le try/catch ci-dessous couvre uniquement le cas (rare) où l'URL est mal
 * formée ou les options invalides — pour ne pas faire crasher le boot.
 */
/**
 * Supabase Transaction pooler (port 6543) tourne sous PgBouncer en mode
 * transaction, lequel ne supporte pas les prepared statements (chaque query
 * peut atterrir sur une connexion physique différente). postgres-js cache
 * ses prepared statements par défaut — on les désactive explicitement
 * quand on détecte le port 6543 dans l'URL.
 *
 * Session pooler (port 5432) et Postgres direct gardent les prepared
 * statements (perf préservée).
 */
function shouldDisablePreparedStatements(url: string): boolean {
  return url.includes(':6543')
}

function buildQueryClient() {
  try {
    return postgres(env.DATABASE_URL, {
      max: env.NODE_ENV === 'production' ? 20 : 5,
      idle_timeout: 30,
      connect_timeout: 5,
      prepare: !shouldDisablePreparedStatements(env.DATABASE_URL),
      onnotice: () => undefined,
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[db] init failed, running in degraded mode:', (err as Error).message)
    // Retourne un client qui throw à la première requête plutôt que de crasher
    // le process au boot — comportement compatible avec les routes qui
    // try/catch leurs accès DB.
    return postgres('postgres://noop:noop@127.0.0.1:1/noop', { max: 0, fetch_types: false })
  }
}

const queryClient = buildQueryClient()

export const db = drizzle(queryClient, { schema })
export type DB = typeof db

/**
 * Sonde lightweight pour le readiness probe. Renvoie `false` si Postgres
 * n'est pas joignable (timeout 2 s) au lieu de propager l'exception.
 */
export async function pingDatabase(): Promise<boolean> {
  try {
    await Promise.race([
      db.execute(sql`SELECT 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('db_ping_timeout')), 2_000)),
    ])
    return true
  } catch {
    return false
  }
}
