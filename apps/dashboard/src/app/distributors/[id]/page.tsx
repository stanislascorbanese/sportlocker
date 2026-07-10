import Link from 'next/link'
import { notFound } from 'next/navigation'

import {
  ApiError, fetchAdminItemTypes, fetchDistributor,
  type DistributorDetail, type ItemTypeAdmin,
} from '../../../lib/api'
import { RefreshButton } from '../../../components/RefreshButton'
import { getLang } from '../../../lib/lang-server'
import { commonStrings } from '../../../lib/i18n/common'
import { distributorsStrings } from '../../../lib/i18n/distributors'
import { makeMetadata } from '../../../lib/i18n/metadata'
import { loadableLockers } from './_locker-grid'
import { LoadLockerDrawer } from './LoadLockerDrawer'
import { LiveLockerGrid } from './LiveLockerGrid'

export const dynamic = 'force-dynamic'
export const generateMetadata = makeMetadata((lang) => distributorsStrings(lang).detailMetaTitle)

function fmtCoord(coord: number | null): string {
  return coord == null ? '—' : coord.toFixed(4)
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

  // Lazy-load demo-data uniquement en fallback (code-splitting serveur) —
  // chargé uniquement si distributor introuvable OU catalogue item_types vide.
  const useDemo = distributor == null
  let data: DistributorDetail = distributor!  // narrow garanti par le if ci-dessous
  let types: ItemTypeAdmin[] = itemTypes
  if (useDemo || itemTypes.length === 0) {
    const demo = await import('../../../lib/demo-data')
    if (useDemo) data = demo.demoDistributorDetail(id)
    if (itemTypes.length === 0) types = demo.DEMO_ITEM_TYPES
  }
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

      <LiveLockerGrid
        distributorId={id}
        initialLockers={data.lockers}
        initialStatus={data.status}
        initialLastSeenAt={data.lastSeenAt}
        batteryPercent={data.batteryPercent}
        lang={lang}
        demo={useDemo}
      />

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

function InfoCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-navy-800 p-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">{label}</p>
      <div className="mt-2 text-sm text-white/80">{children}</div>
    </div>
  )
}
