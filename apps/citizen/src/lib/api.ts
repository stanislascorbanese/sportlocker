import {
  ApiError,
  Identity,
  Kiosk,
  Loan,
  messageFor,
  ReturnResult,
  type VacancierApi,
} from './contract'
import { demoApi, isDemo } from './demo'
import type { z } from 'zod'

/**
 * Client de l'API vacancier.
 *
 * Cinq appels, pas un de plus. Le parcours entier tient dedans : je scanne, je
 * dis qui je suis, je choisis, un casier s'ouvre, je rends.
 *
 * Aucun jeton, aucun compte : c'est le couple (numéro de séjour, nom) qui fait
 * foi, et le camping l'a déjà vérifié au check-in. Le serveur répond par un
 * `stayId` opaque et de courte durée que les appels suivants réutilisent.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

async function call<T>(schema: z.ZodType<T>, path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      cache: 'no-store',
    })
  } catch {
    throw new ApiError(messageFor('network'), 'network')
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    const code = body.error ?? `http_${res.status}`
    throw new ApiError(messageFor(code), code)
  }

  const parsed = schema.safeParse(await res.json())
  if (!parsed.success) {
    throw new ApiError("Réponse inattendue du serveur. Prévenez l'accueil.", 'bad_response')
  }
  return parsed.data
}

const httpApi: VacancierApi = {
  getKiosk: (serial) => call(Kiosk, `/v1/kiosk/${encodeURIComponent(serial)}`),

  identify: (serial, stayRef, lastName) =>
    call(Identity, `/v1/kiosk/${encodeURIComponent(serial)}/identify`, {
      method: 'POST',
      body: JSON.stringify({ stayRef, lastName }),
    }),

  borrow: (serial, stayId, itemTypeId) =>
    call(Loan, `/v1/kiosk/${encodeURIComponent(serial)}/loans`, {
      method: 'POST',
      body: JSON.stringify({ stayId, itemTypeId }),
    }),

  getLoan: (loanId) => call(Loan, `/v1/kiosk/loans/${encodeURIComponent(loanId)}`),

  returnLoan: (loanId) =>
    call(ReturnResult, `/v1/kiosk/loans/${encodeURIComponent(loanId)}/return`, { method: 'POST' }),
}

/**
 * En mode démo, les mêmes signatures sont servies en mémoire — de quoi montrer
 * le parcours complet sur un téléphone, sur un stand, sans réseau ni backend.
 */
export const api: VacancierApi = isDemo ? demoApi : httpApi

export * from './contract'
