/**
 * Contrat de l'API vacancier, côté app.
 *
 * Les schémas viennent de `@sportlocker/types` — la même source que l'API
 * utilise pour valider ses réponses. Tant que les deux bouts importent d'ici,
 * une réponse que cette app ne sait pas lire ne peut plus passer les tests du
 * serveur ; c'est ce qui a remplacé les deux définitions parallèles qui
 * dérivaient à chaque évolution de route.
 *
 * Ce qui reste local, c'est le type d'erreur qui porte le code renvoyé par le
 * serveur — celui-ci n'envoie jamais de phrase, seulement un code, que l'écran
 * traduit dans la langue du vacancier.
 *
 * Implémentation serveur : docs/API-VACANCIER.md
 */
import { fr } from './i18n/fr'

export {
  AvailableItem,
  Identity,
  ItemKind,
  Kiosk,
  Loan,
  ReturnResult,
  type VacancierApi,
} from '@sportlocker/types'

/** Erreur dont le message est déjà écrit pour un vacancier, pas pour un dev. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string = 'unknown',
  ) {
    // Un message vide finirait affiché tel quel : on retombe sur le libellé
    // associé au code plutôt que de laisser un encadré rouge sans texte.
    super(message || messageFor(code))
    this.name = 'ApiError'
  }
}

/**
 * Messages de repli, en français.
 *
 * Ils ne sont plus la source affichée : l'écran traduit à partir du code porté
 * par l'ApiError, dans la langue choisie par le vacancier. Ce qui reste ici sert
 * au `message` de l'exception — donc aux journaux, à Sentry, et à tout code qui
 * lirait `err.message` sans passer par le contexte de langue.
 *
 * La table est importée du dictionnaire français plutôt que recopiée : les deux
 * listes avaient déjà divergé une fois, et un code traduit d'un côté mais pas de
 * l'autre est invisible tant qu'un vacancier ne tombe pas dessus.
 */
export const ERROR_MESSAGES: Record<string, string> = fr.errors

/** Libellé affichable pour un code d'erreur, connu ou non. */
export function messageFor(
  code: string,
  fallback = fr.errorFallback,
): string {
  return ERROR_MESSAGES[code] ?? fallback
}
