'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'

import { markLoanChargedAction } from './actions'
import type { LoanRow } from '../../lib/api'
import { Badge, Card } from '../../components/ui'
import { cn } from '../../lib/cn'
import type { Lang } from '../../lib/lang'
import { unreturnedStrings } from '../../lib/i18n/unreturned'

/**
 * Une ligne par article dehors. En tableau sur grand écran, en cartes sur
 * téléphone — l'accueil consulte souvent depuis son mobile en faisant le tour
 * des emplacements.
 *
 * Ce que le saisonnier cherche, c'est un emplacement et un nom : « la 214,
 * Martin ». L'écran mène donc avec ça, pas avec l'article ni avec la borne.
 *
 * La case « passé en compte » ne facture rien et n'envoie rien : SportLocker ne
 * connaît aucun tarif. Elle dit seulement que le camping s'en est occupé, pour
 * que la ligne cesse de remonter tous les matins.
 */
export function UnreturnedTable({ rows, lang }: { rows: LoanRow[]; lang: Lang }) {
  const t = unreturnedStrings(lang)

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-white/55">{t.billHint}</p>

      {/* Cartes — téléphone */}
      <ul className="space-y-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Card variant="elevated" padding="md" className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-navy-900 dark:text-white">
                    {t.spot} {row.stay.stayRef} · {guestName(row)}
                  </p>
                  <p className="truncate text-sm text-gray-600 dark:text-white/55">
                    {row.item.label}
                  </p>
                </div>
                <ElapsedBadge row={row} lang={lang} />
              </div>
              <p className="text-meta text-gray-500 dark:text-white/45">
                {t.kiosk} {row.distributor.name} · {t.locker} {row.lockerNumber} · {t.leaves}{' '}
                {formatDay(row.stay.departsOn, lang)}
              </p>
              <ChargeToggle row={row} lang={lang} />
            </Card>
          </li>
        ))}
      </ul>

      {/* Tableau — tablette et bureau */}
      <Card variant="elevated" padding="none" className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-meta uppercase tracking-wide text-gray-500 dark:border-white/10 dark:text-white/45">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">{t.spot}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t.guest}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t.item}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t.kiosk}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t.since}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t.leaves}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t.charged}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-white/10">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3 font-semibold tabular-nums text-navy-900 dark:text-white">
                  {row.stay.stayRef}
                </td>
                <td className="px-4 py-3 font-medium text-navy-900 dark:text-white">
                  {guestName(row)}
                </td>
                <td className="px-4 py-3 text-gray-700 dark:text-white/70">{row.item.label}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-white/55">
                  {row.distributor.name}
                  <span className="text-gray-400 dark:text-white/35">
                    {' '}· {t.locker} {row.lockerNumber}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <ElapsedBadge row={row} lang={lang} />
                </td>
                <td className="px-4 py-3 tabular-nums text-gray-600 dark:text-white/55">
                  {formatDay(row.stay.departsOn, lang)}
                </td>
                <td className="px-4 py-3">
                  <ChargeToggle row={row} lang={lang} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function guestName(row: LoanRow): string {
  return [row.stay.firstName, row.stay.lastName].filter(Boolean).join(' ')
}

/**
 * Durée en clair. Au-delà de 24 h on passe en jours : « 31 h » demande un
 * calcul mental, « 1 j 7 h » se lit.
 */
function elapsed(hoursOut: number, t: ReturnType<typeof unreturnedStrings>): string {
  if (hoursOut < 1) return `< 1 ${t.hours}`
  if (hoursOut < 24) return `${Math.floor(hoursOut)} ${t.hours}`
  const days = Math.floor(hoursOut / 24)
  const hours = Math.floor(hoursOut % 24)
  return hours === 0 ? `${days} ${t.days}` : `${days} ${t.days} ${hours} ${t.hours}`
}

/**
 * Trois paliers, écrits en toutes lettres à côté de la couleur : un article
 * sorti depuis deux heures est normal, depuis un jour il faut aller voir, et
 * si le client part demain c'est maintenant ou jamais.
 */
function ElapsedBadge({ row, lang }: { row: LoanRow; lang: Lang }) {
  const t = unreturnedStrings(lang)
  const label = elapsed(row.hoursOut, t)
  if (row.hoursOut >= 24) return <Badge tone="danger">{label}</Badge>
  if (row.hoursOut >= 8) return <Badge tone="warning">{label}</Badge>
  return <Badge tone="neutral">{label}</Badge>
}

function formatDay(iso: string, lang: Lang): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'short',
  })
}

/**
 * Case à cocher optimiste : le camping clique en marchant, souvent sur un
 * réseau de camping capricieux. On bascule l'affichage tout de suite et on
 * revient en arrière si le serveur refuse.
 */
function ChargeToggle({ row, lang }: { row: LoanRow; lang: Lang }) {
  const t = unreturnedStrings(lang)
  const [charged, setCharged] = useState(row.chargedAt !== null)
  const [failed, setFailed] = useState(false)
  const [pending, startTransition] = useTransition()

  function toggle() {
    const next = !charged
    setCharged(next)
    setFailed(false)
    startTransition(async () => {
      const ok = await markLoanChargedAction(row.id, next)
      if (!ok) {
        setCharged(!next)
        setFailed(true)
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={charged}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-meta font-medium transition-colors',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
          charged
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300'
            : 'border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-white/15 dark:text-white/60 dark:hover:bg-white/5',
          pending && 'opacity-60',
        )}
      >
        <Check size={14} aria-hidden className={charged ? '' : 'opacity-30'} />
        {charged ? t.chargedYes : t.chargedNo}
      </button>
      {failed && (
        <span className="text-meta text-rose-700 dark:text-rose-300">{t.chargeFailed}</span>
      )}
    </div>
  )
}
