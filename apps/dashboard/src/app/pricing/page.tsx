import {
  ApiError,
  SLOT_DURATIONS,
  fetchAdminItemTypes,
  fetchCommunes,
  fetchPricingRules,
  formatDurationLabel,
  isDayPassDuration,
  type Commune,
  type ItemTypeAdmin,
  type PricingRule,
} from '../../lib/api'
import { getSessionUser } from '../../lib/session-server'
import { RefreshButton } from '../../components/RefreshButton'
import { getLang } from '../../lib/lang-server'
import { pricingStrings } from '../../lib/i18n/pricing'
import { ApplyTemplate } from './ApplyTemplate'
import { CommuneSelector } from './CommuneSelector'
import { PriceCell } from './PriceCell'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Tarification · SportLocker ops' }

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
  const lang = await getLang()
  const t = pricingStrings(lang)

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
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">{t.pageTitle}</h1>
          <p className="mt-1 text-sm text-zinc-400">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span>
            <strong className="font-medium text-zinc-200 tabular-nums">{filledCells}</strong> {t.slotsTariffedTotal} {totalCells} {t.slotsTariffedSuffix}
          </span>
          <RefreshButton />
        </div>
      </header>

      {user?.role === 'super_admin' && (
        <CommuneSelector
          communes={communes}
          currentCommuneId={effectiveCommuneId}
          lang={lang}
        />
      )}

      {fetchError && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {t.apiPrefix} {fetchError}
        </div>
      )}

      {effectiveCommuneId === null && user?.role === 'super_admin' ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-8 text-center text-sm text-zinc-500">
          {t.noCommunesInFleet}{' '}
          <a className="underline hover:text-zinc-300" href="/communes">{t.goCommunes}</a>.
        </div>
      ) : (
        <>
          <ApplyTemplate communeId={overrideCommuneId} lang={lang} />

          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40">
            <div className="border-b border-zinc-800 px-4 py-3">
              <h2 className="text-sm font-medium text-zinc-100">{t.matrixTitle}</h2>
              <p className="mt-0.5 text-xs text-zinc-500">{t.matrixHint}</p>
            </div>
            {itemTypes.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-zinc-500">
                {t.noItemTypesCreate}{' '}
                <a className="underline hover:text-zinc-300" href="/items?tab=types">{t.goItems}</a>.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wide text-zinc-500">
                    <tr className="border-b border-zinc-800">
                      <th className="px-4 py-2 text-left font-normal">{t.colSport}</th>
                      <th className="px-3 py-2 text-left font-normal">{t.colCategory}</th>
                      {SLOT_DURATIONS.map((d) => (
                        <th
                          key={d}
                          className={
                            'px-3 py-2 text-right font-normal tabular-nums '
                            + (isDayPassDuration(d) ? 'text-amber-300/80' : '')
                          }
                          title={isDayPassDuration(d) ? t.tooltipDayPass : undefined}
                        >
                          {formatDurationLabel(d)}
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
                                  lang={lang}
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
