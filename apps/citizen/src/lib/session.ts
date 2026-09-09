/**
 * Mémoire locale du vacancier.
 *
 * Il n'y a pas de compte : le seul fil qui relie deux visites est ce qui est
 * gardé dans le navigateur. On y met le strict nécessaire — son numéro de
 * séjour pour ne pas le lui redemander, et l'identifiant de l'emprunt en cours
 * pour qu'il retrouve « rendre l'article » en rouvrant la page.
 *
 * Rien de sensible n'est stocké : ni carte, ni pièce d'identité, ni position.
 * Tout est effacé au retour de l'article.
 */

const STAY_KEY = 'sl-stay'
const LOAN_KEY = 'sl-loan'

export interface StayIdentity {
  /** Numéro d'emplacement ou de réservation, tel qu'il figure sur son contrat. */
  stayRef: string
  /** Nom de famille, pour lever l'ambiguïté sur un emplacement partagé. */
  lastName: string
  /** Numéro de série de la borne où il s'est identifié. */
  serial: string
}

function read<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* navigation privée ou quota plein : le parcours reste jouable sans */
  }
}

function clear(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* idem */
  }
}

export const getStay = () => read<StayIdentity>(STAY_KEY)
export const saveStay = (stay: StayIdentity) => write(STAY_KEY, stay)
export const forgetStay = () => clear(STAY_KEY)

export const getLoanId = () => read<string>(LOAN_KEY)
export const saveLoanId = (id: string) => write(LOAN_KEY, id)
export const forgetLoan = () => clear(LOAN_KEY)
