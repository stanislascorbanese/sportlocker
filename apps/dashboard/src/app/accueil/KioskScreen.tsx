'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AlertTriangle, LogOut, PackageOpen, RefreshCw } from 'lucide-react'

import { cn } from '../../lib/cn'
import type { Lang } from '../../lib/lang'
import { kioskStrings } from '../../lib/i18n/kiosk'

export interface RefillRow {
  key: string
  kioskName: string
  serial: string
  offline: boolean
  position: number
  expected: string | null
}

export interface UnreturnedRow {
  key: string
  guest: string
  item: string
  serial: string
  hours: number
  overdue: boolean
}

/** Toutes les cinq minutes : assez pour suivre la journée, assez peu pour ne
 *  pas épuiser un forfait de tablette laissée allumée deux mois. */
const REFRESH_MS = 5 * 60 * 1000

export function KioskScreen({
  lang,
  refill,
  unreturned,
  hadError,
  generatedAt,
}: {
  lang: Lang
  refill: RefillRow[]
  unreturned: UnreturnedRow[]
  hadError: boolean
  generatedAt: string
}) {
  const t = kioskStrings(lang)
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    const id = setInterval(() => router.refresh(), REFRESH_MS)
    return () => clearInterval(id)
  }, [router])

  const heure = new Date(generatedAt).toLocaleTimeString(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })

  // Un casier vide par borne, regroupé : le saisonnier fait le tour borne par
  // borne, pas casier par casier.
  const parBorne = refill.reduce<Record<string, RefillRow[]>>((acc, row) => {
    ;(acc[row.serial] ??= []).push(row)
    return acc
  }, {})

  return (
    <div className="min-h-screen px-5 py-6 sm:px-8 sm:py-8">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-navy-900 sm:text-4xl dark:text-white">
            {t.title}
          </h1>
          <p className="mt-1 text-gray-600 dark:text-white/55">{t.subtitle}</p>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden text-meta text-gray-500 sm:inline dark:text-white/40">
            {t.updatedAt} {heure}
          </span>
          <button
            type="button"
            onClick={() => {
              setRefreshing(true)
              router.refresh()
              setTimeout(() => setRefreshing(false), 800)
            }}
            className="inline-flex h-12 items-center gap-2 rounded-lg border border-gray-200 px-4 text-sm font-medium text-navy-900 transition-colors hover:bg-gray-100 dark:border-white/10 dark:text-white dark:hover:bg-white/5"
          >
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            {t.refresh}
          </button>
          <Link
            href="/"
            className="inline-flex h-12 items-center gap-2 rounded-lg px-4 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-navy-900 dark:text-white/45 dark:hover:bg-white/5 dark:hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            {t.exit}
          </Link>
        </div>
      </header>

      {hadError && (
        <p className="mb-6 rounded-card border border-rose-300 bg-rose-50 px-5 py-4 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">
          {t.offline}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── À REGARNIR ─────────────────────────────────────────────── */}
        <section>
          <h2 className="mb-4 flex items-center gap-2.5 text-xl font-bold text-navy-900 dark:text-white">
            <PackageOpen className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            {t.toRefill}
            {refill.length > 0 && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-base font-bold text-amber-800 dark:bg-amber-400/15 dark:text-amber-200">
                {refill.length}
              </span>
            )}
          </h2>

          {refill.length === 0 ? (
            <EmptyBlock title={t.nothingToRefill} hint={t.nothingToRefillHint} />
          ) : (
            <div className="space-y-5">
              {Object.entries(parBorne).map(([serial, rows]) => (
                <div key={serial}>
                  <p className="mb-2 text-sm font-semibold text-gray-600 dark:text-white/60">
                    {rows[0]?.kioskName}{' '}
                    <span className="font-normal text-gray-400 dark:text-white/35">{serial}</span>
                    {rows[0]?.offline && (
                      <span className="ml-2 text-amber-700 dark:text-amber-300">· hors ligne</span>
                    )}
                  </p>
                  <ul className="space-y-2">
                    {rows.map((row) => (
                      <li
                        key={row.key}
                        className="flex items-center gap-4 rounded-card border-2 border-amber-400 bg-amber-50 px-4 py-3.5 dark:border-amber-400/40 dark:bg-amber-400/10"
                      >
                        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-amber-200 font-display text-xl font-bold tabular-nums text-amber-900 dark:bg-amber-400/20 dark:text-amber-100">
                          {row.position}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-eyebrow uppercase tracking-wider text-amber-800/70 dark:text-amber-200/60">
                            {t.locker} {row.position}
                          </span>
                          <span className="block truncate text-[1.0625rem] font-semibold text-amber-900 dark:text-amber-50">
                            {row.expected ?? '—'}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── NON RENDUS ─────────────────────────────────────────────── */}
        <section>
          <h2 className="mb-4 flex items-center gap-2.5 text-xl font-bold text-navy-900 dark:text-white">
            <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            {t.unreturned}
            {unreturned.length > 0 && (
              <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-base font-bold text-rose-800 dark:bg-rose-500/15 dark:text-rose-200">
                {unreturned.length}
              </span>
            )}
          </h2>

          {unreturned.length === 0 ? (
            <EmptyBlock title={t.nothingUnreturned} hint={t.nothingUnreturnedHint} />
          ) : (
            <ul className="space-y-2">
              {unreturned.map((row) => (
                <li
                  key={row.key}
                  className={cn(
                    'rounded-card border-2 px-4 py-3.5',
                    row.overdue
                      ? 'border-rose-400 bg-rose-50 dark:border-rose-500/40 dark:bg-rose-500/10'
                      : 'border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/5',
                  )}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[1.0625rem] font-bold text-navy-900 dark:text-white">
                      {row.guest}
                    </span>
                    <span className="shrink-0 tabular-nums text-sm font-semibold text-gray-600 dark:text-white/60">
                      {t.outFor} {row.hours < 24 ? `${row.hours} ${t.hours}` : `${Math.floor(row.hours / 24)} ${t.days}`}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-gray-700 dark:text-white/70">{row.item}</p>
                  <p className="text-meta text-gray-500 dark:text-white/40">
                    {t.kiosk} {row.serial}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="mx-auto mt-10 max-w-2xl text-center text-meta leading-relaxed text-gray-500 dark:text-white/35">
        {t.operatorTip}
      </p>
    </div>
  )
}

function EmptyBlock({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-card border border-emerald-300 bg-emerald-50 px-5 py-8 text-center dark:border-emerald-500/30 dark:bg-emerald-500/10">
      <p className="text-lg font-bold text-emerald-900 dark:text-emerald-100">{title}</p>
      <p className="mt-1 text-sm text-emerald-800/70 dark:text-emerald-200/60">{hint}</p>
    </div>
  )
}
