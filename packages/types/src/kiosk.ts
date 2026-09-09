import { z } from 'zod'

/**
 * Contrat du parcours vacancier — source unique, partagée par les deux bouts.
 *
 * L'API (`services/api/src/routes/kiosk.ts`) valide ses réponses avec ces
 * schémas, l'app (`apps/citizen/src/lib/contract.ts`) valide ce qu'elle reçoit
 * avec les mêmes. Tant que les deux les importent d'ici, une réponse que l'app
 * ne sait pas lire ne peut plus passer les tests du serveur.
 *
 * C'est le seul endroit du produit où un client final tape quelque chose. Le
 * contrat est donc volontairement minuscule : cinq appels, aucun compte, aucun
 * paiement, aucun prix. Cf. docs/API-VACANCIER.md.
 */

/**
 * Pictogramme affiché par l'app. Il ne pilote que le dessin, jamais une règle
 * métier : un type inconnu tombe sur `autre` et reste empruntable.
 *
 * Les trois ballons ont leur propre motif parce que dans un casier de camping
 * ils coexistent — un glyphe unique obligerait à lire le libellé pour les
 * distinguer, ce qu'on ne fait pas à bout de bras en plein soleil.
 */
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
  /** Exemplaires présents dans la borne. À 0 l'article reste affiché, mais grisé. */
  available: z.number().int().min(0),
  kind: ItemKind,
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
  /**
   * Le numéro peint sur la porte, pas la position en base. Les casiers sont
   * stockés en 0..N-1 et étiquetés 1..N sur la machine ; c'est la seule
   * information que le vacancier doit retenir.
   */
  lockerNumber: z.number().int().positive(),
  borrowedAt: z.string(),
  serial: z.string(),
  siteName: z.string(),
})
export type Loan = z.infer<typeof Loan>

export const Identity = z.object({
  /** Jeton opaque de courte durée, lié au séjour et à la borne. */
  stayId: z.string(),
  guestName: z.string(),
  /** Renseigné si le séjour a déjà un article dehors — l'app propose de rendre. */
  activeLoan: Loan.nullable(),
})
export type Identity = z.infer<typeof Identity>

export const ReturnResult = z.object({
  lockerNumber: z.number().int().positive(),
})
export type ReturnResult = z.infer<typeof ReturnResult>

/**
 * Codes d'erreur du contrat. Le serveur ne renvoie jamais de message
 * utilisateur — seulement un de ces codes, dans `{ "error": "<code>" }`. Les
 * libellés français vivent dans l'app, ce qui évite d'avoir deux endroits où
 * corriger une tournure.
 */
export const KIOSK_ERROR_CODES = [
  'kiosk_not_found',
  'stay_not_found',
  'item_unavailable',
  'loan_already_active',
  'loan_not_found',
  'locker_stuck',
  'no_free_locker',
] as const
export type KioskErrorCode = typeof KIOSK_ERROR_CODES[number]

/** Signature du client, implémentée par le vrai HTTP comme par le mode démo. */
export interface VacancierApi {
  getKiosk(serial: string): Promise<Kiosk>
  identify(serial: string, stayRef: string, lastName: string): Promise<Identity>
  borrow(serial: string, stayId: string, itemTypeId: string): Promise<Loan>
  getLoan(loanId: string): Promise<Loan>
  returnLoan(loanId: string): Promise<ReturnResult>
}
