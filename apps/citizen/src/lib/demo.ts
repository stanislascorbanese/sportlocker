import { ApiError, type Identity, type Kiosk, type Loan, type ReturnResult, type VacancierApi } from './contract'

/**
 * Mode démo.
 *
 * Activé par `NEXT_PUBLIC_DEMO=1`. Rejoue le parcours entier en mémoire, avec
 * des latences crédibles, pour montrer l'app sans borne, sans API et sans
 * réseau — en rendez-vous chez un gérant ou sur un stand.
 *
 * Ce n'est pas un mock de test : c'est un outil commercial. Il doit donc
 * raconter une histoire vraisemblable (un vrai nom de camping, du matériel
 * qu'on trouve vraiment dans un casier) et jamais laisser croire qu'un
 * matériel est réservé alors qu'il ne l'est pas.
 */

export const isDemo = process.env.NEXT_PUBLIC_DEMO === '1'

const DEMO_STAY = { ref: '214', lastName: 'martin' }

const CATALOGUE = [
  { itemTypeId: 'foot', label: 'Ballon de football', kind: 'ballon' as const, available: 2 },
  { itemTypeId: 'basket', label: 'Ballon de basket', kind: 'basket' as const, available: 1 },
  { itemTypeId: 'volley', label: 'Ballon de volley', kind: 'volley' as const, available: 1 },
  { itemTypeId: 'pingpong', label: 'Raquettes de ping-pong', kind: 'raquette' as const, available: 2 },
  { itemTypeId: 'badminton', label: 'Set de badminton', kind: 'raquette' as const, available: 1 },
  { itemTypeId: 'beach', label: 'Raquettes de plage', kind: 'raquette' as const, available: 0 },
  { itemTypeId: 'frisbee', label: 'Frisbee', kind: 'disque' as const, available: 1 },
  { itemTypeId: 'petanque', label: 'Jeu de pétanque', kind: 'boule' as const, available: 1 },
]

interface DemoState {
  items: typeof CATALOGUE
  loan: Loan | null
}

const state: DemoState = {
  items: CATALOGUE.map((i) => ({ ...i })),
  loan: null,
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const SITE = 'Camping des Dunes'

export const demoApi: VacancierApi = {
  async getKiosk(serial: string): Promise<Kiosk> {
    await wait(320)
    return { serial, siteName: SITE, items: state.items.map((i) => ({ ...i })) }
  },

  async identify(serial: string, stayRef: string, lastName: string): Promise<Identity> {
    await wait(520)
    const refOk = stayRef.trim() === DEMO_STAY.ref
    const nameOk = lastName.trim().toLowerCase() === DEMO_STAY.lastName
    if (!refOk || !nameOk) {
      throw new ApiError(
        `Démo : utilisez l’emplacement ${DEMO_STAY.ref} au nom de Martin.`,
        'stay_not_found',
      )
    }
    return { stayId: 'demo-stay', guestName: 'Camille Martin', activeLoan: state.loan }
  },

  async borrow(serial: string, _stayId: string, itemTypeId: string): Promise<Loan> {
    await wait(700)
    const item = state.items.find((i) => i.itemTypeId === itemTypeId)
    if (!item || item.available <= 0) throw new ApiError('', 'item_unavailable')
    if (state.loan) throw new ApiError('', 'loan_already_active')

    item.available -= 1
    state.loan = {
      id: 'demo-loan',
      itemLabel: item.label,
      kind: item.kind,
      lockerNumber: 4,
      borrowedAt: new Date().toISOString(),
      serial,
      siteName: SITE,
    }
    return state.loan
  },

  async getLoan(_loanId: string): Promise<Loan> {
    await wait(200)
    if (!state.loan) throw new ApiError('Cet emprunt est déjà clôturé.', 'loan_not_found')
    return state.loan
  },

  async returnLoan(_loanId: string): Promise<ReturnResult> {
    await wait(700)
    if (!state.loan) throw new ApiError('Cet emprunt est déjà clôturé.', 'loan_not_found')
    const item = state.items.find((i) => i.label === state.loan?.itemLabel)
    if (item) item.available += 1
    state.loan = null
    return { lockerNumber: 7 }
  },
}
