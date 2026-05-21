import {
  ApiError,
  SLOT_DURATIONS,
  fetchAdminItemTypes,
  fetchCommunes,
  fetchPricingRules,
  type Commune,
  type ItemTypeAdmin,
  type PricingRule,
  type SlotDurationMinutes,
} from '../../lib/api'
import { getSessionUser } from '../../lib/session-server'
import { RefreshButton } from '../../components/RefreshButton'
import { ApplyTemplate } from './ApplyTemplate'
import { CommuneSelector } from './CommuneSelector'
import { PriceCell } from './PriceCell'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Tarification · SportLocker ops' }

function fmtMinutes(min: SlotDurationMinutes): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const r = min % 60
  return r === 0 ? `${h} h` : `${h} h ${r}`
}

/**
 * Matrice tarifaire éditable : lignes = item_types, colonnes = durées
 * (30/60/90/120 min). Une cellule vide = pas de règle = ce slot n'est pas
 * proposé pour ce sport.
 *
 * Scoping :
 *   - admin scopé : la commune est implicite (session.communeId), l'API
 *     l'impose côté backend. La page n'affiche pas de sélecteur.
 *   - super_admin : doit choisir explicitement la commune (l'API renvoie
 *     422 `commune_id_required` sinon). On affiche un dropdown des
 *     communes du parc, communeId reportée dans `?communeId=...` pour
 *     que l'URL soit partageable.
 */
export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ communeId?: string }>
}) {
  const sp = await searchParams
  const user = await getSessionUser()

  // Pré-charge les communes uniquement pour super_admin (l'admin scopé n'a
  // pas besoin du dropdown).
  let communes: Commune[] = []
  if (user?.role === 'super_admin') {
    try {
      communes = await fetchCommunes()
    } catch {
      // Non-bloquant : si fetchCommunes plante, on continue avec un sélecteur
      // vide et un message d'erreur global.
    }
  }

  // Résolution de la commune cible :
  //   - super_admin : ?communeId=, sinon la première commune disponible
  //   - admin scopé : session.communeId, l'API ignore le param query
  let effectiveCommuneId: string | null = null
  if (user?.role === 'super_admin') {
    effectiveCommuneId = sp.communeId ?? communes[0]?.id ?? null
  } else {
    effectiveCommuneId = user?.communeId ?? null
  }

  // Fetches indépendants (allSettled) : si pricing-rules plante (commune_id
  // manquant côté super_admin), on garde quand même la liste d'item_types
  // pour pouvoir choisir / configurer.
  const [itemTypesRes, rulesRes] = await Promise.allSettled([
    fetchAdminItemTypes(),
    effectiveCommuneId
      ? fetchPricingRules(user?.role === 'super_admin' ? effectiveCommuneId : undefined)
      : Promise.resolve([] as PricingRule[]),
  ])

  const itemTypes: ItemTypeAdmin[] =
    itemTypesRes.status === 'fulfilled' ? itemTypesRes.value : []
  const rules: PricingRule[] =
    rulesRes.status === 'fulfilled' ? rulesRes.value : []

  const fetchError =
    itemTypesRes.status === 'rejected'
      ? extractErrorMessage(itemTypesRes.reason)
      : rulesRes.status === 'rejected'
        ? extractErrorMessage(rulesRes.reason)
        : null

  // Lookup O(1) : `${itemTypeId}:${duration}` → règle (id + prix)
  const rulesByKey = new Map<string, PricingRule>()
  for (const r of rules) rulesByKey.set(`${r.itemTypeId}:${r.durationMinutes}`, r)

  const totalCells = itemTypes.length * SLOT_DURATIONS.length
  const filledCells = rules.length

  // Le scope qu'on passe aux composants client (PriceCell, ApplyTemplate)
  // pour que les server actions transmettent le bon communeId à l'API.
  // Pour admin scopé, on laisse vide : l'API utilisera la session.
  const overrideCommuneId = user?.role === 'super_admin' ? effectiveCommuneId : null

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Tarification</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Prix d'affichage par sport et durée de créneau. Vide = ce créneau n'est pas proposé pour ce
            sport. Modèle MVP sans paiement : les montants sont informatifs côté citoyen.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span>
            <strong className="font-medium text-zinc-200 tabular-nums">{filledCells}</strong> / {totalCells} créneaux
            tarifés
          </span>
          <RefreshButton />
        </div>
      </header>

      {user?.role === 'super_admin' && (
        <CommuneSelector
          communes={communes}
          currentCommuneId={effectiveCommuneId}
        />
      )}

      {fetchError && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          API : {fetchError}
        </div>
      )}

      {effectiveCommuneId === null && user?.role === 'super_admin' ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-8 text-center text-sm text-zinc-500">
          Aucune commune dans le parc. Créez d'abord une commune dans{' '}
          <a className="underline hover:text-zinc-300" href="/communes">/communes</a>.
        </div>
      ) : (
        <>
          <ApplyTemplate communeId={overrideCommuneId} />

          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40">
            <div className="border-b border-zinc-800 px-4 py-3">
              <h2 className="text-sm font-medium text-zinc-100">Matrice des prix</h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Tab/Enter pour valider une cellule, Escape pour annuler. Vider une cellule supprime la règle.
              </p>
            </div>
            {itemTypes.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-zinc-500">
                Aucun item_type configuré. Créez d'abord des articles dans{' '}
                <a className="underline hover:text-zinc-300" href="/items?tab=types">/items</a> pour
                pouvoir leur attribuer un prix.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wide text-zinc-500">
                    <tr className="border-b border-zinc-800">
                      <th className="px-4 py-2 text-left font-normal">Sport / item_type</th>
                      <th className="px-3 py-2 text-left font-normal">Catégorie</th>
                      {SLOT_DURATIONS.map((d) => (
                        <th key={d} className="px-3 py-2 text-right font-normal tabular-nums">
                          {fmtMinutes(d)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {itemTypes.map((it) => (
                      <tr key={it.id} className="border-b border-zinc-800/60 last:border-b-0">
                        <td className="px-4 py-2 text-zinc-100">{it.name}</td>
                        <td className="px-3 py-2 text-xs text-zinc-500">{it.category}</td>
                        {SLOT_DURATIONS.map((d) => {
                          const rule = rulesByKey.get(`${it.id}:${d}`) ?? null
                          return (
                            <td key={d} className="px-3 py-2 text-right">
                              <div className="inline-flex justify-end">
                                <PriceCell
                                  itemTypeId={it.id}
                                  durationMinutes={d}
                                  initialPriceCents={rule?.priceCents ?? null}
                                  ruleId={rule?.id ?? null}
                                  communeId={overrideCommuneId}
                                />
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function extractErrorMessage(reason: unknown): string {
  if (reason instanceof ApiError) return reason.detail
  if (reason instanceof Error) return reason.message
  return 'API unreachable'
}
