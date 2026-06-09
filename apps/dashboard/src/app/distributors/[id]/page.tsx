import Link from 'next/link'
import { notFound } from 'next/navigation'

import {
  ApiError, fetchAdminItemTypes, fetchDistributor,
  type DistributorDetail, type DistributorLocker, type ItemTypeAdmin,
} from '../../../lib/api'
import { demoDistributorDetail, DEMO_ITEM_TYPES } from '../../../lib/demo-data'
import { StatusPill } from '../../../components/StatusPill'
import { BatteryGauge } from '../../../components/BatteryGauge'
import { RefreshButton } from '../../../components/RefreshButton'
import { cn } from '../../../lib/cn'
import { getLang } from '../../../lib/lang-server'
import type { Lang } from '../../../lib/lang'
import { commonStrings, distributorStatusLabel, fmtRelative } from '../../../lib/i18n/common'
import { distributorsStrings } from '../../../lib/i18n/distributors'
import { makeMetadata } from '../../../lib/i18n/metadata'
import {
  classifyLocker, loadableLockers, summarizeLockerGrid,
  type LockerCellTone,
} from './_locker-grid'
import { LoadLockerDrawer } from './LoadLockerDrawer'

export const dynamic = 'force-dynamic'
export const generateMetadata = makeMetadata((lang) => distributorsStrings(lang).detailMetaTitle)

function fmtCoord(coord: number | null): string {
  return coord == null ? '—' : coord.toFixed(4)
}

const TONE_CLS: Record<LockerCellTone, { cls: string; dot: string }> = {
  'idle-empty':  { cls: 'border-dashed border-white/15 bg-navy-900',         dot: 'bg-white/30' },
  'idle-loaded': { cls: 'border-emerald-500/30 bg-emerald-500/[0.06]',       dot: 'bg-emerald-400' },
  'reserved':    { cls: 'border-sky-500/30 bg-sky-500/[0.06]',               dot: 'bg-sky-400' },
  'active':      { cls: 'border-amber-500/30 bg-amber-500/[0.06]',           dot: 'bg-amber-400' },
  'returning':   { cls: 'border-purple-500/30 bg-purple-500/[0.06]',         dot: 'bg-purple-400' },
  'fault':       { cls: 'border-rose-500/30 bg-rose-500/[0.06]',             dot: 'bg-rose-400' },
}

function toneLabel(lang: Lang, tone: LockerCellTone): string {
  const t = distributorsStrings(lang)
  switch (tone) {
    case 'idle-empty':  return t.tonneIdleEmpty
    case 'idle-loaded': return t.toneIdleLoaded
    case 'reserved':    return t.toneReserved
    case 'active':      return t.toneActive
    case 'returning':   return t.toneReturning
    case 'fault':       return t.toneFault
  }
}

export default async function DistributorDetailPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const lang = await getLang()
  const t = distributorsStrings(lang)
  const c = commonStrings(lang)

  let distributor: DistributorDetail | null = null
  let itemTypes: ItemTypeAdmin[] = []
  let fetchError: string | null = null

  try {
    distributor = await fetchDistributor(id)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound()
    fetchError = err instanceof Error ? err.message : 'API unreachable'
  }

  try {
    itemTypes = await fetchAdminItemTypes()
  } catch {
    // Si le catalogue n'est pas dispo, le drawer reste utilisable en démo.
  }

  const useDemo = distributor == null
  const data: DistributorDetail = distributor ?? demoDistributorDetail(id)
  const types: ItemTypeAdmin[] = itemTypes.length > 0 ? itemTypes : DEMO_ITEM_TYPES
  const summary = summarizeLockerGrid(data.lockers)
  const loadable = loadableLockers(data.lockers).map((l) => ({ id: l.id, position: l.position }))

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/distributors" className="text-sm text-white/55 transition hover:text-white">
              {t.backToList}
            </Link>
            {useDemo && (
              <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                {c.demo}
              </span>
            )}
          </div>
          <h2 className="mt-1 font-display text-2xl sm:text-3xl">{data.name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-white/55">
            <span className="font-mono text-xs">{data.serialNumber}</span>
            <StatusPill status={data.status} label={distributorStatusLabel(lang, data.status)} />
            <span>
              <span className={cn(
                summary.idleEmpty === 0 ? 'text-white/40' : 'text-emerald-300 font-semibold',
              )}>{summary.idleEmpty}</span>
              {' '}
              <span className="text-white/40">/ {summary.total} {t.emptyCount}</span>
            </span>
            <span className="text-white/40">·</span>
            <span>{summary.idleLoaded} {t.loadedSuffix} · {summary.active + summary.reserved} {t.inCirculation}</span>
            {summary.fault > 0 && (
              <>
                <span className="text-white/40">·</span>
                <span className="text-rose-300">{summary.fault} {t.faultSuffix}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <RefreshButton />
          <Link
            href={`/distributors/${id}/edit`}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70 transition hover:border-white/30 hover:text-white"
          >
            {t.btnEdit}
          </Link>
          <LoadLockerDrawer
            distributorId={id}
            distributorName={data.name}
            itemTypes={types.map((tp) => ({ id: tp.id, name: tp.name, category: tp.category }))}
            lockers={loadable}
            demo={useDemo}
            lang={lang}
          />
        </div>
      </header>

      {fetchError && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200/80">
          <p className="font-medium">{c.apiErrorTitle}</p>
          <p className="mt-1 font-mono text-[11px] text-amber-300/70">{fetchError}</p>
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label={t.kpiFreeForLoad} value={`${summary.loadable}`} accent="emerald" />
        <Card label={t.kpiLoadedIdle}  value={`${summary.idleLoaded}`} />
        <Card label={t.kpiActiveReservations} value={`${summary.reserved + summary.active}`} />
        <Card label={t.kpiBatteryLastSeen}>
          <div className="flex items-center gap-3">
            <BatteryGauge percent={data.batteryPercent} />
            <span className="text-xs text-white/60">{fmtRelative(lang, data.lastSeenAt)}</span>
          </div>
        </Card>
      </section>

      <section className="rounded-xl border border-white/10 bg-navy-800 p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="font-display text-lg">{t.sectionGrid}</h3>
          <Legend lang={lang} />
        </div>
        <LockerGrid lockers={data.lockers} lang={lang} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <InfoCard label={t.infoAddress}>
          {data.addressLine ?? <span className="text-white/40">—</span>}
        </InfoCard>
        <InfoCard label={t.infoCoords}>
          <span className="font-mono text-[12px] tabular-nums">
            {fmtCoord(data.latitude)}, {fmtCoord(data.longitude)}
          </span>
        </InfoCard>
        <InfoCard label={t.infoCommune}>
          <span className="font-mono text-[11px] tabular-nums text-white/60">{data.communeId}</span>
        </InfoCard>
      </section>
    </div>
  )
}

function Card({
  label, value, accent, children,
}: { label: string; value?: string; accent?: 'emerald'; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-navy-800 p-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">{label}</p>
      {value !== undefined ? (
        <p className={cn(
          'mt-2 font-display text-2xl tabular-nums',
          accent === 'emerald' ? 'text-emerald-300' : 'text-white',
        )}>
          {value}
        </p>
      ) : (
        <div className="mt-2">{children}</div>
      )}
    </div>
  )
}

function InfoCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-navy-800 p-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">{label}</p>
      <div className="mt-2 text-sm text-white/80">{children}</div>
    </div>
  )
}

function Legend({ lang }: { lang: Lang }) {
  const tones: LockerCellTone[] = ['idle-empty', 'idle-loaded', 'reserved', 'active', 'returning', 'fault']
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/55">
      {tones.map((tone) => (
        <li key={tone} className="inline-flex items-center gap-1.5">
          <span className={cn('h-1.5 w-1.5 rounded-full', TONE_CLS[tone].dot)} />
          {toneLabel(lang, tone)}
        </li>
      ))}
    </ul>
  )
}

function LockerGrid({ lockers, lang }: { lockers: DistributorLocker[]; lang: Lang }) {
  const t = distributorsStrings(lang)
  if (lockers.length === 0) {
    return <p className="text-sm text-white/40">{t.gridEmpty}</p>
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {lockers.map((l) => {
        const cell = classifyLocker(l)
        const tcls = TONE_CLS[cell.tone]
        const label = toneLabel(lang, cell.tone)
        return (
          <li
            key={l.id}
            className={cn(
              'group relative flex flex-col gap-2 rounded-lg border p-3 transition',
              tcls.cls,
              cell.loadable && 'hover:border-emerald-400/60 hover:bg-emerald-500/10',
            )}
            aria-label={`${t.gridCellLockerAria} ${l.position + 1} — ${label}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wider text-white/55">
                #{l.position + 1}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/55">
                <span className={cn('h-1.5 w-1.5 rounded-full', tcls.dot)} />
                {label}
              </span>
            </div>
            {l.itemType ? (
              <div className="min-h-[2.5rem]">
                <p className="truncate text-sm font-medium text-white" title={l.itemType.name}>
                  {l.itemType.name}
                </p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-white/40">
                  {l.itemType.category}
                </p>
              </div>
            ) : (
              <p className="min-h-[2.5rem] text-sm text-white/30">
                {cell.tone === 'fault' ? t.cellFaultPlaceholder : t.cellEmptyPlaceholder}
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
