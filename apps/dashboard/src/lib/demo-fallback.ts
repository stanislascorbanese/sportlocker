/**
 * Garde du fallback « données de démo ».
 *
 * Le dashboard bascule sur des fixtures fictives (`lib/demo-data.ts`) quand
 * l'API admin renvoie 401/403 ou un résultat vide, pour prévisualiser le rendu
 * sans backend branché. En **production** ce comportement est dangereux : un
 * token admin expiré ou un tenant réellement vide afficherait des réservations,
 * revenus et communes fictifs pris pour des données réelles (et exportables en
 * CSV/PDF). On coupe donc le fallback en prod → l'utilisateur voit le vrai état
 * vide ou l'erreur d'API, jamais de fausses données.
 *
 * Override explicite possible via `DASHBOARD_DEMO_FALLBACK=on|off` (ex. preview
 * de démo commerciale sur un déploiement prod-like).
 */
export function isDemoFallbackEnabled(): boolean {
  const flag = process.env.DASHBOARD_DEMO_FALLBACK
  if (flag === 'on') return true
  if (flag === 'off') return false
  return process.env.NODE_ENV !== 'production'
}
