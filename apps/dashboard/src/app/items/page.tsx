import Link from 'next/link'

import {
  fetchAdminItemTypes, fetchItems, type Item, type ItemCondition, type ItemTypeAdmin,
} from '../../lib/api'
import { DEMO_ITEMS, DEMO_ITEM_TYPES } from '../../lib/demo-data'
import { getSessionUser } from '../../lib/session-server'
import { RefreshButton } from '../../components/RefreshButton'
import { cn } from '../../lib/cn'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Articles · SportLocker ops' }

type Tab = 'types' | 'instances'

function fmtEuros(cents: number): string {
  if (cents === 0) return '—'
  return `${(cents / 100).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`
}

function fmtMinutes(min: number): string {
  if (min < 60) return `${min} min`
  const hours = Math.floor(min / 60)
  const rest = min % 60
  if (rest === 0) return `${hours}h`
  return `${hours}h${String(rest).padStart(2, '0')}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return 'jamais'
  return new Date(iso).toLocaleDateString('fr-FR')
}

const CONDITION_STYLE: Record<ItemCondition, { label: string; cls: string }> = {
  new:     { label: 'neuf',       cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
  good:    { label: 'bon',        cls: 'bg-sky-500/10 text-sky-300 border-sky-500/30' },
  worn:    { label: 'usé',        cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
  damaged: { label: 'endommagé',  cls: 'bg-orange-500/10 text-orange-300 border-orange-500/30' },
  lost:    { label: 'perdu',      cls: 'bg-rose-500/10 text-rose-300 border-rose-500/30' },
}

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; condition?: string; itemTypeId?: string }>
}) {
  const sp = await searchParams
  const tab: Tab = sp.tab === 'instances' ? 'instances' : 'types'
  const condFilter = (sp.condition && (CONDITION_STYLE as Record<string, unknown>)[sp.condition])
    ? (sp.condition as ItemCondition)
    : undefined
  const typeFilter = sp.itemTypeId

  const user = await getSessionUser()
  const isSuperAdmin = user?.role === 'super_admin'

  let realTypes: ItemTypeAdmin[] = []
  let realItems: Item[] = []
  let fetchError: string | null = null

  try {
    const [t, i] = await Promise.all([
      fetchAdminItemTypes(),
      fetchItems({
        ...(condFilter ? { condition: condFilter } : {}),
        ...(typeFilter ? { itemTypeId: typeFilter } : {}),
      }),
    ])
    realTypes = t
    realItems = i
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'API unreachable'
  }

  const useDemo = fetchError !== null || (realTypes.length === 0 && realItems.length === 0)
  const itemTypes: ItemTypeAdmin[] = useDemo ? DEMO_ITEM_TYPES : realTypes
  let physicalItems: Item[] = useDemo ? DEMO_ITEMS : realItems
  if (useDemo) {
    if (condFilter) physicalItems = physicalItems.filter((i: Item) => i.condition === condFilter)
    if (typeFilter) physicalItems = physicalItems.filter((i: Item) => i.itemType.id === typeFilter)
  }

  // Tableau de bord rapide en header
  const totalActiveItems = physicalItems.length
  const lostCount = physicalItems.filter((i) => i.condition === 'lost').length
  const damagedCount = physicalItems.filter((i) => i.condition === 'damaged').length

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-2xl sm:text-3xl">Articles</h2>
            {useDemo && (
              <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                Démo
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-white/55">
            {itemTypes.length} type{itemTypes.length > 1 ? 's' : ''} dans le catalogue ·{' '}
            {totalActiveItems} article{totalActiveItems > 1 ? 's' : ''} physique{totalActiveItems > 1 ? 's' : ''}
            {damagedCount > 0 && <> · <span className="text-orange-300">{damagedCount} endommagé{damagedCount > 1 ? 's' : ''}</span></>}
            {lostCount > 0 && <> · <span className="text-rose-300">{lostCount} perdu{lostCount > 1 ? 's' : ''}</span></>}
            {useDemo && ' · données fictives'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <RefreshButton />
          {tab === 'types' ? (
            isSuperAdmin ? (
              <Link
                href="/items/types/new"
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-navy-900 transition hover:bg-emerald-400"
              >
                + Nouveau type
              </Link>
            ) : (
              <span className="text-xs text-white/40">Création réservée aux super-admins</span>
            )
          ) : (
            <Link
              href="/items/instances/new"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-navy-900 transition hover:bg-emerald-400"
            >
              + Nouvel article
            </Link>
          )}
        </div>
      </header>

      {fetchError && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200/80">
          <p className="font-medium">API admin indisponible — affichage en mode démo</p>
          <p className="mt-1 font-mono text-[11px] text-amber-300/70">{fetchError}</p>
        </div>
      )}

      <nav className="-mx-4 flex items-center gap-1 overflow-x-auto border-b border-white/10 px-4 text-sm sm:mx-0 sm:px-0">
        <TabLink href="/items?tab=types" active={tab === 'types'}>
          Types d'articles
          <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] tabular-nums text-white/60">
            {itemTypes.length}
          </span>
        </TabLink>
        <TabLink href="/items?tab=instances" active={tab === 'instances'}>
          Articles physiques
          <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] tabular-nums text-white/60">
            {totalActiveItems}
          </span>
        </TabLink>
      </nav>

      {tab === 'types' ? (
        <TypesTable types={itemTypes} useDemo={useDemo} isSuperAdmin={isSuperAdmin} />
      ) : (
        <InstancesTable
          items={physicalItems}
          allItemTypes={itemTypes}
          useDemo={useDemo}
          condFilter={condFilter}
          typeFilter={typeFilter}
        />
      )}
    </div>
  )
}

function TabLink({
  href, active, children,
}: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center border-b-2 px-4 py-2.5 transition',
        active
          ? 'border-emerald-400 text-white'
          : 'border-transparent text-white/55 hover:text-white',
      )}
    >
      {children}
    </Link>
  )
}

function TypesTable({
  types, useDemo, isSuperAdmin,
}: {
  types: ItemTypeAdmin[]
  useDemo: boolean
  isSuperAdmin: boolean
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-navy-800">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="bg-navy-700/50 text-left text-xs uppercase tracking-wide text-white/55">
          <tr>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Catégorie</th>
            <th className="px-4 py-3 font-medium text-right">Caution</th>
            <th className="px-4 py-3 font-medium text-right">Durée max</th>
            <th className="px-4 py-3 font-medium text-right">Articles</th>
            <th className="px-4 py-3 font-medium text-right">Emprunts</th>
            <th className="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {types.length === 0 && (
            <tr><td colSpan={7} className="px-4 py-10 text-center text-white/40">Aucun type au catalogue.</td></tr>
          )}
          {types.map((t) => (
            <tr key={t.id} className="transition hover:bg-white/[0.02]">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  {t.imageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={t.imageUrl}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-md border border-white/10 bg-navy-900 object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-navy-900 text-[10px] uppercase text-white/30">
                      —
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate font-medium text-white">{t.name}</div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-white/40">{t.slug}</div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-white/70">
                <span className="inline-flex rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] uppercase tracking-wide text-white/70">
                  {t.category}
                </span>
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-white/80">{fmtEuros(t.cautionCents)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-white/80">{fmtMinutes(t.maxDurationMinutes)}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                <span className={cn(t.activeItemCount === 0 ? 'text-white/30' : 'text-white')}>{t.activeItemCount}</span>
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-white/70">{t.totalReservations}</td>
              <td className="px-4 py-3 text-right">
                {useDemo ? (
                  <span className="text-xs text-white/30">démo</span>
                ) : isSuperAdmin ? (
                  <Link
                    href={`/items/types/${t.id}/edit`}
                    className="text-xs text-emerald-300 transition hover:text-emerald-200"
                  >
                    Modifier
                  </Link>
                ) : (
                  <span className="text-xs text-white/30">lecture seule</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function InstancesTable({
  items, allItemTypes, useDemo, condFilter, typeFilter,
}: {
  items: Item[]
  allItemTypes: ItemTypeAdmin[]
  useDemo: boolean
  condFilter: ItemCondition | undefined
  typeFilter: string | undefined
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-xs uppercase tracking-wide text-white/40">Filtres</span>

        <FilterSelect
          name="condition"
          value={condFilter ?? ''}
          baseHref={{ tab: 'instances', ...(typeFilter ? { itemTypeId: typeFilter } : {}) }}
          options={[
            { value: '', label: 'Toutes conditions' },
            ...Object.entries(CONDITION_STYLE).map(([k, v]) => ({ value: k, label: v.label })),
          ]}
        />

        <FilterSelect
          name="itemTypeId"
          value={typeFilter ?? ''}
          baseHref={{ tab: 'instances', ...(condFilter ? { condition: condFilter } : {}) }}
          options={[
            { value: '', label: 'Tous types' },
            ...allItemTypes.map((t) => ({ value: t.id, label: t.name })),
          ]}
        />

        {(condFilter || typeFilter) && (
          <Link href="/items?tab=instances" className="text-xs text-white/60 underline-offset-2 hover:text-white hover:underline">
            Réinitialiser
          </Link>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10 bg-navy-800">
        <table className="w-full text-sm">
          <thead className="bg-navy-700/50 text-left text-xs uppercase tracking-wide text-white/55">
            <tr>
              <th className="px-4 py-3 font-medium">RFID</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">État</th>
              <th className="px-4 py-3 font-medium">Localisation</th>
              <th className="px-4 py-3 font-medium">Inspection</th>
              <th className="px-4 py-3 font-medium text-right">Emprunts</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {items.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-white/40">
                Aucun article ne correspond à ces filtres.
              </td></tr>
            )}
            {items.map((it) => {
              const cond = CONDITION_STYLE[it.condition] ?? CONDITION_STYLE.new
              return (
                <tr key={it.id} className="transition hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-mono text-[12px] tabular-nums text-white/80">{it.rfidTag}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{it.itemType.name}</div>
                    <div className="mt-0.5 text-[11px] text-white/40">{it.itemType.category}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                      cond.cls,
                    )}>
                      {cond.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white/80">
                    {it.currentLocker ? (
                      <>
                        <div className="truncate">{it.currentLocker.distributor.name}</div>
                        <div className="mt-0.5 text-[11px] text-white/40">
                          Casier #{it.currentLocker.position + 1} ·{' '}
                          <span className="font-mono">{it.currentLocker.distributor.serialNumber}</span>
                        </div>
                      </>
                    ) : (
                      <span className="text-white/30">— orphelin</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-white/60">{fmtDate(it.lastInspectedAt)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-white/70">{it.totalLoans}</td>
                  <td className="px-4 py-3 text-right">
                    {useDemo ? (
                      <span className="text-xs text-white/30">démo</span>
                    ) : (
                      <Link
                        href={`/items/instances/${it.id}/edit`}
                        className="text-xs text-emerald-300 transition hover:text-emerald-200"
                      >
                        Modifier
                      </Link>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FilterSelect({
  name, value, baseHref, options,
}: {
  name: string
  value: string
  baseHref: Record<string, string>
  options: Array<{ value: string; label: string }>
}) {
  // Pur GET sans JS client — un form method=get vers /items et un bouton OK.
  // L'utilisateur change la valeur du select puis clique OK.
  return (
    <form method="get" action="/items" className="flex items-center gap-2">
      {Object.entries(baseHref).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <select
        name={name}
        defaultValue={value}
        className="rounded-lg border border-white/15 bg-navy-800 px-3 py-1.5 text-xs text-white outline-none focus:border-emerald-400/60"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded-lg border border-white/10 px-2 py-1.5 text-[11px] text-white/60 transition hover:border-white/30 hover:text-white"
      >
        OK
      </button>
    </form>
  )
}
