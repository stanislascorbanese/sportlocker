import { z } from 'zod'

/**
 * Contrat de l'API vacancier — types et erreurs partagés entre le client HTTP
 * et le mode démo. Isolé ici pour qu'aucun des deux n'importe l'autre.
 *
 * Implémentation serveur attendue : docs/API-VACANCIER.md
 */

// Les trois ballons ont leur propre motif : dans un casier de camping, ils
// coexistent, et un glyphe unique obligerait à lire le libellé pour les
// distinguer.
export const ItemKind = z.enum([
  'ballon',
  'basket',
  'volley',
  'raquette',
  'disque',
  'plot',
  'corde',
  'boule',
  'autre',
])
export type ItemKind = z.infer<typeof ItemKind>

export const AvailableItem = z.object({
  itemTypeId: z.string(),
  label: z.string(),
  kind: ItemKind,
  /** Exemplaires présents dans la borne. À 0 l'article reste affiché, mais grisé. */
  available: z.number().int().min(0),
})
export type AvailableItem = z.infer<typeof AvailableItem>

export const Kiosk = z.object({
  serial: z.string(),
  siteName: z.string(),
  items: z.array(AvailableItem),
})
export type Kiosk = z.infer<typeof Kiosk>

export const Loan = z.object({
  id: z.string(),
  itemLabel: z.string(),
  kind: ItemKind,
  lockerNumber: z.number().int().positive(),
  borrowedAt: z.string(),
  serial: z.string(),
  siteName: z.string(),
})
export type Loan = z.infer<typeof Loan>

export const Identity = z.object({
  stayId: z.string(),
  guestName: z.string(),
  activeLoan: Loan.nullable(),
})
export type Identity = z.infer<typeof Identity>

export const ReturnResult = z.object({
  lockerNumber: z.number().int().positive(),
})
export type ReturnResult = z.infer<typeof ReturnResult>

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

export interface VacancierApi {
  getKiosk(serial: string): Promise<Kiosk>
  identify(serial: string, stayRef: string, lastName: string): Promise<Identity>
  borrow(serial: string, stayId: string, itemTypeId: string): Promise<Loan>
  getLoan(loanId: string): Promise<Loan>
  returnLoan(loanId: string): Promise<ReturnResult>
}
