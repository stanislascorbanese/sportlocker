/**
 * Délai de reconnexion WebSocket — backoff exponentiel plafonné + jitter.
 *
 * - Croissance : 1s, 2s, 4s, 8s… bornée à `capMs` (30s par défaut).
 * - Jitter ±20% : désynchronise les reconnexions d'une flotte de dashboards
 *   après une coupure API (évite le thundering herd au retour du service).
 *
 * `random` est injectable pour rendre la fonction déterministe en test.
 */
export function nextBackoffMs(
  attempt: number,
  opts: { baseMs?: number; capMs?: number; random?: () => number } = {},
): number {
  const base = opts.baseMs ?? 1_000
  const cap = opts.capMs ?? 30_000
  const random = opts.random ?? Math.random
  const raw = Math.min(cap, base * 2 ** Math.max(0, attempt))
  const jitter = 1 + (random() * 0.4 - 0.2) // ±20%
  return Math.round(raw * jitter)
}
