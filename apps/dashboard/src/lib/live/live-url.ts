/**
 * Construction de l'URL du flux WebSocket temps réel côté browser.
 *
 * L'API est sur un sous-domaine distinct (api.) exposé publiquement via
 * `NEXT_PUBLIC_API_URL`. On convertit le scheme http(s) → ws(s) et on ajoute le
 * ticket (mono-usage, régénéré à chaque connexion) + un éventuel filtre
 * distributeur pour la page détail.
 *
 * Fonction pure : testée sans DOM ni WebSocket réel.
 */
export function buildLiveWsUrl(
  apiUrl: string,
  params: { ticket: string; distributorId?: string | null },
): string {
  // http → ws, https → wss (le préfixe 'http' de 'https' devient 'wss').
  const base = apiUrl.replace(/^http/, 'ws').replace(/\/+$/, '')
  const url = new URL(`${base}/v1/admin/live`)
  url.searchParams.set('ticket', params.ticket)
  if (params.distributorId) url.searchParams.set('distributorId', params.distributorId)
  return url.toString()
}
