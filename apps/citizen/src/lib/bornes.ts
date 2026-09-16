import { z } from 'zod'
import { isDemo } from './demo'

/**
 * Liste des bornes pour la carte publique.
 *
 * Volontairement HORS de `VacancierApi` : ce contrat decrit le parcours
 * d'emprunt (scanner, s'identifier, choisir, ouvrir, rendre) et se tient a
 * cinq appels. La carte est un ecran de decouverte — une deuxieme porte
 * d'entree quand le QR n'est pas sous la main — pas une etape de l'emprunt.
 *
 * On ne lit que les champs dont la carte a besoin : `GET /v1/distributors`
 * en renvoie une dizaine d'autres (batterie, dernier heartbeat, commune…)
 * qui ne regardent pas un vacancier.
 */

export const Borne = z.object({
  serialNumber: z.string(),
  name: z.string(),
  status: z.string(),
  idleLockers: z.number().int().min(0),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  addressLine: z.string().nullable(),
})
export type Borne = z.infer<typeof Borne>

/** Une borne n'est plaçable que si elle a ete geocodee. */
export type BornePlacee = Borne & { latitude: number; longitude: number }

export function estPlacee(b: Borne): b is BornePlacee {
  return b.latitude !== null && b.longitude !== null
}

const BORNES_DEMO: Borne[] = [
  { serialNumber: 'SL-001', name: 'Camping Les Places Dorées', status: 'online',
    idleLockers: 5, latitude: 46.7900, longitude: -1.9550,
    addressLine: 'Saint-Jean-de-Monts' },
  { serialNumber: 'SL-002', name: 'Plage des Demoiselles', status: 'online',
    idleLockers: 0, latitude: 46.7350, longitude: -1.9880,
    addressLine: "Saint-Jean-de-Monts" },
  { serialNumber: 'SL-003', name: 'Front de mer', status: 'online',
    idleLockers: 2, latitude: 46.7830, longitude: -2.0100,
    addressLine: 'Saint-Jean-de-Monts' },
]

const BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

export async function listerBornes(): Promise<Borne[]> {
  if (isDemo) return BORNES_DEMO

  const res = await fetch(`${BASE}/v1/distributors`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`http_${res.status}`)

  const parsed = z.object({ items: z.array(Borne) }).safeParse(await res.json())
  if (!parsed.success) throw new Error('bad_response')

  // Une borne retiree du parc n'a rien a faire sur une carte publique.
  return parsed.data.items.filter((b) => b.status !== 'decommissioned')
}
