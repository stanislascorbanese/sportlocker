/**
 * Anonymisation du nom d'auteur pour l'affichage public des avis.
 *
 * On ne veut jamais exposer le nom complet d'un citoyen sur une page publique
 * (RGPD, minimisation). On réduit `displayName` à un prénom + initiale du nom :
 * "Marie Lambert" → "Marie L.", "Jean" → "Jean". Quand aucun nom exploitable
 * n'est disponible, on renvoie `null` — l'UI affiche alors un libellé générique
 * localisé ("Anonyme" / "Anonymous").
 */
export function anonymizeAuthorName(displayName: string | null | undefined): string | null {
  if (!displayName) return null
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return null
  const first = parts[0]!
  if (parts.length === 1) return first
  const lastInitial = parts[1]!.charAt(0).toUpperCase()
  return `${first} ${lastInitial}.`
}
