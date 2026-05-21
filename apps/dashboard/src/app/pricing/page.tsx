import {
  ApiError,
  SLOT_DURATIONS,
  fetchAdminItemTypes,
  fetchPricingRules,
  type ItemTypeAdmin,
  type PricingRule,
  type SlotDurationMinutes,
} from '../../lib/api'
import { getSessionUser } from '../../lib/session-server'
import { RefreshButton } from '../../components/RefreshButton'
import { ApplyTemplate } from './ApplyTemplate'
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
 * Édition inline via `<PriceCell>` (client component) : POST en onBlur sur
 * la server action `upsertPricingRuleAction` qui revalidate le tag
 * `pricing-rules`. Pas de bouton "save" global — chaque cellule est
 * autonome, le réseau ne se met à jour que sur changement effectif.
 */
export default async function PricingPage() {
  const user = await getSessionUser()

  let itemTypes: ItemTypeAdmin[] = []
  let rules: PricingRule[] = []
  let fetchError: string | null = null

  try {
    ;[itemTypes, rules] = await Promise.all([
      fetchAdminItemTypes(),
      fetchPricingRules(),
    ])
  } catch (err) {
    fetchError = err instanceof ApiError ? err.detail : (err instanceof Error ? err.message : 'API unreachable')
  }

  // Lookup O(1) : `${itemTypeId}:${duration}` → règle (id + prix)
  const rulesByKey = new Map<string, PricingRule>()
  for (const r of rules) rulesByKey.set(`${r.itemTypeId}:${r.durationMinutes}`, r)

  const totalCells = itemTypes.length * SLOT_DURATIONS.length
  const filledCells = rules.length

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

      {fetchError && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          API injoignable ({fetchError}). Reconnectez-vous ou réessayez plus tard.
        </div>
      )}

      <ApplyTemplate />

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

      {user?.role === 'super_admin' && (
        <p className="text-xs text-zinc-600">
          super_admin : cette vue ne filtre PAS par commune (vous voyez votre propre scope par défaut).
          Pour éditer la tarif d'une autre commune, utilisez la console super-admin (à venir).
        </p>
      )}
    </div>
  )
}
