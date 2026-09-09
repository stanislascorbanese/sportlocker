/**
 * Contrat de l'API vacancier, côté app.
 *
 * Les schémas viennent de `@sportlocker/types` — la même source que l'API
 * utilise pour valider ses réponses. Tant que les deux bouts importent d'ici,
 * une réponse que cette app ne sait pas lire ne peut plus passer les tests du
 * serveur ; c'est ce qui a remplacé les deux définitions parallèles qui
 * dérivaient à chaque évolution de route.
 *
 * Ce qui reste local, c'est ce qui ne regarde que l'app : les libellés
 * français des erreurs, et le type d'erreur qui les porte. Le serveur ne
 * renvoie que des codes.
 *
 * Implémentation serveur : docs/API-VACANCIER.md
 */
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

/** Messages affichés à la place d'un code d'erreur serveur. */
export const ERROR_MESSAGES: Record<string, string> = {
  stay_not_found:
    "Ce numéro de séjour n'est pas reconnu. Vérifiez-le sur votre contrat, ou passez à l'accueil.",
  kiosk_not_found: "Cette borne n'est pas reconnue. Vérifiez le code inscrit dessus.",
  item_unavailable: "Ce matériel vient d'être emprunté par quelqu'un d'autre.",
  loan_already_active: 'Vous avez déjà un article emprunté. Rendez-le pour en prendre un autre.',
  loan_not_found: 'Cet emprunt est déjà clôturé.',
  locker_stuck: "Le casier n'a pas répondu. Prévenez l'accueil, on s'en occupe.",
  no_free_locker: "Tous les casiers sont occupés. Prévenez l'accueil.",
  network: 'Pas de connexion. Approchez-vous de la borne et réessayez.',
}

/** Libellé affichable pour un code d'erreur, connu ou non. */
export function messageFor(
  code: string,
  fallback = "Quelque chose n'a pas marché. Réessayez.",
): string {
  return ERROR_MESSAGES[code] ?? fallback
}
