import Link from 'next/link'

import {
  fetchAdminItemTypes, fetchItems, type Item, type ItemCondition, type ItemTypeAdmin,
} from '../../lib/api'
import { getSessionUser } from '../../lib/session-server'
import { RefreshButton } from '../../components/RefreshButton'
import { cn } from '../../lib/cn'
import { getLang } from '../../lib/lang-server'
import type { Lang } from '../../lib/lang'
import { commonStrings, dateLocale } from '../../lib/i18n/common'
import { itemsStrings, conditionLabel } from '../../lib/i18n/items'
import { makeMetadata } from '../../lib/i18n/metadata'

export const dynamic = 'force-dynamic'
export const generateMetadata = makeMetadata((lang) => itemsStrings(lang).metaTitle)

type Tab = 'types' | 'instances'

function fmtEuros(lang: Lang, cents: number): string {
  if (cents === 0) return '—'
  return `${(cents / 100).toLocaleString(dateLocale(lang), { maximumFractionDigits: 0 })} €`
}

function fmtMinutes(min: number): string {
  if (min < 60) return `${min} min`
  const hours = Math.floor(min / 60)
  const rest = min % 60
  if (rest === 0) return `${hours}h`
  return `${hours}h${String(rest).padStart(2, '0')}`
}

function fmtDate(lang: Lang, iso: string | null, neverLabel: string): string {
  if (!iso) return neverLabel
  return new Date(iso).toLocaleDateString(dateLocale(lang))
}

const CONDITION_CLS: Record<ItemCondition, string> = {
  new:     'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  good:    'bg-sky-500/10 text-sky-300 border-sky-500/30',
  worn:    'bg-amber-500/10 text-amber-300 border-amber-500/30',
  damaged: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
  lost:    'bg-rose-500/10 text-rose-300 border-rose-500/30',
}

const ALL_CONDITIONS: ItemCondition[] = ['new', 'good', 'worn', 'damaged', 'lost']

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; condition?: string; itemTypeId?: string }>
}) {
  const sp = await searchParams
  const lang = await getLang()
  const t = itemsStrings(lang)
  const c = commonStrings(lang)

  const tab: Tab = sp.tab === 'instances' ? 'instances' : 'types'
  const condFilter = (sp.condition && ALL_CONDITIONS.includes(sp.condition as ItemCondition))
    ? (sp.condition as ItemCondition)
    : undefined
  const typeFilter = sp.itemTypeId

  const user = await getSessionUser()
  const isSuperAdmin = user?.role === 'super_admin'

  let realTypes: ItemTypeAdmin[] = []
  let realItems: Item[] = []
  let fetchError: string | null = null

  try {
    const [types, items] = await Promise.all([
      fetchAdminItemTypes(),
      fetchItems({
        ...(condFilter ? { condition: condFilter } : {}),
        ...(typeFilter ? { itemTypeId: typeFilter } : {}),
      }),
    ])
    realTypes = types
    realItems = items
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'API unreachable'
  }

  const useDemo = fetchError !== null || (realTypes.length === 0 && realItems.length === 0)
  // Lazy-load demo-data uniquement en fallback (code-splitting serveur).
  let itemTypes: ItemTypeAdmin[] = realTypes
  let physicalItems: Item[] = realItems
  if (useDemo) {
    const demo = await import('../../lib/demo-data')
    itemTypes = demo.DEMO_ITEM_TYPES
    physicalItems = demo.DEMO_ITEMS
    if (condFilter) physicalItems = physicalItems.filter((i: Item) => i.condition === condFilter)
    if (typeFilter) physicalItems = physicalItems.filter((i: Item) => i.itemType.id === typeFilter)
  }

  const totalActiveItems = physicalItems.length
  const lostCount = physicalItems.filter((i) => i.condition === 'lost').length
  const damagedCount = physicalItems.filter((i) => i.condition === 'damaged').length

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-2xl sm:text-3xl">{t.pageTitle}</h2>
            {useDemo && (
              <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                {c.demo}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-white/55">
            {itemTypes.length} {itemTypes.length > 1 ? t.typeMany : t.type1} {t.inCatalog} ·{' '}
            {totalActiveItems} {totalActiveItems > 1 ? t.physicalMany : t.physical1}
            {damagedCount > 0 && <> · <span className="text-orange-300">{damagedCount} {damagedCount > 1 ? t.damagedMany : t.damaged1}</span></>}
            {lostCount > 0 && <> · <span className="text-rose-300">{lostCount} {lostCount > 1 ? t.lostMany : t.lost1}</span></>}
            {useDemo && ` · ${c.demoFootnote}`}
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
                {t.btnNewType}
              </Link>
            ) : (
              <span className="text-xs text-white/40">{t.btnNewTypeSAOnly}</span>
            )
          ) : (
            <Link
              href="/items/instances/new"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-navy-900 transition hover:bg-emerald-400"
            >
              {t.btnNewInstance}
            </Link>
          )}
        </div>
      </header>

      {fetchError && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200/80">
          <p className="font-medium">{c.apiErrorTitle}</p>
          <p className="mt-1 font-mono text-[11px] text-amber-300/70">{fetchError}</p>
        </div>
      )}

      <nav className="-mx-4 flex items-center gap-1 overflow-x-auto border-b border-white/10 px-4 text-sm sm:mx-0 sm:px-0">
        <TabLink href="/items?tab=types" active={tab === 'types'}>
          {t.tabTypes}
          <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] tabular-nums text-white/60">
            {itemTypes.length}
          </span>
        </TabLink>
        <TabLink href="/items?tab=instances" active={tab === 'instances'}>
          {t.tabInstances}
          <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] tabular-nums text-white/60">
            {totalActiveItems}
          </span>
        </TabLink>
      </nav>

      {tab === 'types' ? (
        <TypesTable types={itemTypes} useDemo={useDemo} isSuperAdmin={isSuperAdmin} lang={lang} />
      ) : (
        <InstancesTable
          items={physicalItems}
          allItemTypes={itemTypes}
          useDemo={useDemo}
          condFilter={condFilter}
          typeFilter={typeFilter}
          lang={lang}
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
  types, useDemo, isSuperAdmin, lang,
}: {
  types: ItemTypeAdmin[]
  useDemo: boolean
  isSuperAdmin: boolean
  lang: Lang
}) {
  const t = itemsStrings(lang)
  const c = commonStrings(lang)

  if (types.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-navy-800 p-8 text-center text-white/40">
        {t.noTypes}
      </div>
    )
  }

  return (
    <>
    {/* Mobile : carte par type — image + meta + cautions/durée (table 820px min H scroll pénible) */}
    <div className="space-y-3 md:hidden">
      {types.map((tp) => {
        const card = (
          <>
            <div className="flex items-start gap-3">
              {tp.imageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={tp.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-md border border-white/10 bg-navy-900 object-cover" />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-white/10 bg-navy-900 text-[10px] uppercase text-white/30">—</div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-white">{tp.name}</div>
                <div className="mt-0.5 truncate font-mono text-[11px] text-white/40">{tp.slug}</div>
                <span className="mt-1.5 inline-flex rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/70">
                  {tp.category}
                </span>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-meta">
              <div className="rounded-lg bg-white/[0.03] px-2 py-1.5">
                <div className="text-[10px] uppercase tracking-wider text-white/40">{t.colCaution}</div>
                <div className="mt-0.5 font-display text-sm tabular-nums text-white/85">{fmtEuros(lang, tp.cautionCents)}</div>
              </div>
              <div className="rounded-lg bg-white/[0.03] px-2 py-1.5">
                <div className="text-[10px] uppercase tracking-wider text-white/40">{t.colMaxDuration}</div>
                <div className="mt-0.5 font-display text-sm tabular-nums text-white/85">{fmtMinutes(tp.maxDurationMinutes)}</div>
              </div>
              <div className="rounded-lg bg-white/[0.03] px-2 py-1.5">
                <div className="text-[10px] uppercase tracking-wider text-white/40">{t.colItems}</div>
                <div className={cn('mt-0.5 font-display text-sm tabular-nums', tp.activeItemCount === 0 ? 'text-white/30' : 'text-white')}>{tp.activeItemCount}</div>
              </div>
              <div className="rounded-lg bg-white/[0.03] px-2 py-1.5">
                <div className="text-[10px] uppercase tracking-wider text-white/40">{t.colLoans}</div>
                <div className="mt-0.5 font-display text-sm tabular-nums text-white/70">{tp.totalReservations}</div>
              </div>
            </div>
          </>
        )
        if (!useDemo && isSuperAdmin) {
          return (
            <Link
              key={tp.id}
              href={`/items/types/${tp.id}/edit`}
              className="block rounded-card border border-white/10 bg-navy-800 p-4 transition hover:border-white/20"
            >
              {card}
            </Link>
          )
        }
        return (
          <div key={tp.id} className="rounded-card border border-white/10 bg-navy-800 p-4">
            {card}
          </div>
        )
      })}
    </div>

    {/* Desktop : tableau dense */}
    <div className="hidden overflow-x-auto rounded-xl border border-white/10 bg-navy-800 md:block">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="bg-navy-700/50 text-left text-xs uppercase tracking-wide text-white/55">
          <tr>
            <th className="px-4 py-3 font-medium">{t.colType}</th>
            <th className="px-4 py-3 font-medium">{t.colCategory}</th>
            <th className="px-4 py-3 font-medium text-right">{t.colCaution}</th>
            <th className="px-4 py-3 font-medium text-right">{t.colMaxDuration}</th>
            <th className="px-4 py-3 font-medium text-right">{t.colItems}</th>
            <th className="px-4 py-3 font-medium text-right">{t.colLoans}</th>
            <th className="px-4 py-3 font-medium text-right">{t.colActions}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {types.length === 0 && (
            <tr><td colSpan={7} className="px-4 py-10 text-center text-white/40">{t.noTypes}</td></tr>
          )}
          {types.map((tp) => (
            <tr key={tp.id} className="transition hover:bg-white/[0.02]">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  {tp.imageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={tp.imageUrl}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-md border border-white/10 bg-navy-900 object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-navy-900 text-[10px] uppercase text-white/30">
                      —
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate font-medium text-white">{tp.name}</div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-white/40">{tp.slug}</div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-white/70">
                <span className="inline-flex rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] uppercase tracking-wide text-white/70">
                  {tp.category}
                </span>
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-white/80">{fmtEuros(lang, tp.cautionCents)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-white/80">{fmtMinutes(tp.maxDurationMinutes)}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                <span className={cn(tp.activeItemCount === 0 ? 'text-white/30' : 'text-white')}>{tp.activeItemCount}</span>
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-white/70">{tp.totalReservations}</td>
              <td className="px-4 py-3 text-right">
                {useDemo ? (
                  <span className="text-xs text-white/30">{c.demo}</span>
                ) : isSuperAdmin ? (
                  <Link
                    href={`/items/types/${tp.id}/edit`}
                    className="text-xs text-emerald-300 transition hover:text-emerald-200"
                  >
                    {c.modify}
                  </Link>
                ) : (
                  <span className="text-xs text-white/30">{t.readonly}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  )
}

function InstancesTable({
  items, allItemTypes, useDemo, condFilter, typeFilter, lang,
}: {
  items: Item[]
  allItemTypes: ItemTypeAdmin[]
  useDemo: boolean
  condFilter: ItemCondition | undefined
  typeFilter: string | undefined
  lang: Lang
}) {
  const t = itemsStrings(lang)
  const c = commonStrings(lang)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-xs uppercase tracking-wide text-white/40">{t.filtersLabel}</span>

        <FilterSelect
          name="condition"
          value={condFilter ?? ''}
          baseHref={{ tab: 'instances', ...(typeFilter ? { itemTypeId: typeFilter } : {}) }}
          okLabel={t.okButton}
          options={[
            { value: '', label: t.allConditions },
            ...ALL_CONDITIONS.map((cond) => ({ value: cond, label: conditionLabel(lang, cond) })),
          ]}
        />

        <FilterSelect
          name="itemTypeId"
          value={typeFilter ?? ''}
          baseHref={{ tab: 'instances', ...(condFilter ? { condition: condFilter } : {}) }}
          okLabel={t.okButton}
          options={[
            { value: '', label: t.allTypes },
            ...allItemTypes.map((tp) => ({ value: tp.id, label: tp.name })),
          ]}
        />

        {(condFilter || typeFilter) && (
          <Link href="/items?tab=instances" className="text-xs text-white/60 underline-offset-2 hover:text-white hover:underline">
            {c.reset}
          </Link>
        )}
      </div>

      {/* Mobile : carte par article. Empty state si filtre vide */}
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-navy-800 p-8 text-center text-sm text-white/40 md:hidden">
          {t.noItemsForFilters}
        </div>
      ) : (
        <div className="space-y-3 md:hidden">
          {items.map((it) => {
            const card = (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-white">{it.itemType.name}</div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-white/40">
                      {t.colRfid} {it.rfidTag} · {it.itemType.category}
                    </div>
                  </div>
                  <span className={cn(
                    'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                    CONDITION_CLS[it.condition],
                  )}>
                    {conditionLabel(lang, it.condition)}
                  </span>
                </div>
                <div className="mt-3 text-meta text-white/70">
                  {it.currentLocker ? (
                    <>
                      <div className="truncate text-white/85">{it.currentLocker.distributor.name}</div>
                      <div className="mt-0.5 text-[11px] text-white/40">
                        {t.lockerHash}{it.currentLocker.position + 1} ·{' '}
                        <span className="font-mono">{it.currentLocker.distributor.serialNumber}</span>
                      </div>
                    </>
                  ) : (
                    <span className="text-white/30">{t.orphan}</span>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2 text-[11px] text-white/40">
                  <span>{t.colInspection} · {fmtDate(lang, it.lastInspectedAt, t.never)}</span>
                  <span className="tabular-nums">{t.colLoans} · {it.totalLoans}</span>
                </div>
              </>
            )
            return useDemo ? (
              <div key={it.id} className="rounded-card border border-white/10 bg-navy-800 p-4">
                {card}
              </div>
            ) : (
              <Link
                key={it.id}
                href={`/items/instances/${it.id}/edit`}
                className="block rounded-card border border-white/10 bg-navy-800 p-4 transition hover:border-white/20"
              >
                {card}
              </Link>
            )
          })}
        </div>
      )}

      {/* Desktop : tableau dense classique */}
      <div className="hidden overflow-hidden rounded-xl border border-white/10 bg-navy-800 md:block">
        <table className="w-full text-sm">
          <thead className="bg-navy-700/50 text-left text-xs uppercase tracking-wide text-white/55">
            <tr>
              <th className="px-4 py-3 font-medium">{t.colRfid}</th>
              <th className="px-4 py-3 font-medium">{t.colType}</th>
              <th className="px-4 py-3 font-medium">{t.colCondition}</th>
              <th className="px-4 py-3 font-medium">{t.colLocation}</th>
              <th className="px-4 py-3 font-medium">{t.colInspection}</th>
              <th className="px-4 py-3 font-medium text-right">{t.colLoans}</th>
              <th className="px-4 py-3 font-medium text-right">{t.colActions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {items.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-white/40">
                {t.noItemsForFilters}
              </td></tr>
            )}
            {items.map((it) => (
              <tr key={it.id} className="transition hover:bg-white/[0.02]">
                <td className="px-4 py-3 font-mono text-[12px] tabular-nums text-white/80">{it.rfidTag}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-white">{it.itemType.name}</div>
                  <div className="mt-0.5 text-[11px] text-white/40">{it.itemType.category}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={cn(
                    'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                    CONDITION_CLS[it.condition],
                  )}>
                    {conditionLabel(lang, it.condition)}
                  </span>
                </td>
                <td className="px-4 py-3 text-white/80">
                  {it.currentLocker ? (
                    <>
                      <div className="truncate">{it.currentLocker.distributor.name}</div>
                      <div className="mt-0.5 text-[11px] text-white/40">
                        {t.lockerHash}{it.currentLocker.position + 1} ·{' '}
                        <span className="font-mono">{it.currentLocker.distributor.serialNumber}</span>
                      </div>
                    </>
                  ) : (
                    <span className="text-white/30">{t.orphan}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-white/60">{fmtDate(lang, it.lastInspectedAt, t.never)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-white/70">{it.totalLoans}</td>
                <td className="px-4 py-3 text-right">
                  {useDemo ? (
                    <span className="text-xs text-white/30">{c.demo}</span>
                  ) : (
                    <Link
                      href={`/items/instances/${it.id}/edit`}
                      className="text-xs text-emerald-300 transition hover:text-emerald-200"
                    >
                      {c.modify}
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FilterSelect({
  name, value, baseHref, options, okLabel,
}: {
  name: string
  value: string
  baseHref: Record<string, string>
  options: Array<{ value: string; label: string }>
  okLabel: string
}) {
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
        {okLabel}
      </button>
    </form>
  )
}
