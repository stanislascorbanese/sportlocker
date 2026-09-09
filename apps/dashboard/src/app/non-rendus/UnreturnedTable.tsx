import type { Reservation } from '../../lib/api'
import { Badge, Card } from '../../components/ui'
import type { Lang } from '../../lib/lang'
import { unreturnedStrings } from '../../lib/i18n/unreturned'

/**
 * Une ligne par article dehors. En tableau sur grand écran, en cartes sur
 * téléphone — l'accueil consulte souvent depuis son mobile en faisant le tour
 * des emplacements.
 */
export function UnreturnedTable({ rows, lang }: { rows: Reservation[]; lang: Lang }) {
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
                    {guestName(row)}
                  </p>
                  <p className="truncate text-sm text-gray-600 dark:text-white/55">
                    {row.item.typeName}
                  </p>
                </div>
                <StatusBadge row={row} lang={lang} />
              </div>
              <p className="text-meta text-gray-500 dark:text-white/45">
                {t.kiosk} {row.distributor.serialNumber} · {t.since} {elapsed(row.openedAt, t)}
              </p>
            </Card>
          </li>
        ))}
      </ul>

      {/* Tableau — tablette et bureau */}
      <Card variant="elevated" padding="none" className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-meta uppercase tracking-wide text-gray-500 dark:border-white/10 dark:text-white/45">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">{t.guest}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t.item}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t.kiosk}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t.since}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t.lateBy}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-white/10">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3 font-medium text-navy-900 dark:text-white">
                  {guestName(row)}
                </td>
                <td className="px-4 py-3 text-gray-700 dark:text-white/70">{row.item.typeName}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-white/55">
                  {row.distributor.serialNumber}
                </td>
                <td className="px-4 py-3 tabular-nums text-gray-600 dark:text-white/55">
                  {elapsed(row.openedAt, t)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge row={row} lang={lang} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function StatusBadge({ row, lang }: { row: Reservation; lang: Lang }) {
  const t = unreturnedStrings(lang)
  const late = row.status === 'overdue'
  return (
    <Badge tone={late ? 'danger' : 'warning'}>{late ? t.overdueBadge : t.longOutBadge}</Badge>
  )
}

/** Le nom affiché au check-in prime ; l'e-mail n'est qu'un dernier recours. */
function guestName(row: Reservation): string {
  return row.user.displayName?.trim() || row.user.email
}

/** Durée écoulée en « 3 h » ou « 2 j », sans fausse précision à la minute. */
function elapsed(iso: string | null, t: ReturnType<typeof unreturnedStrings>): string {
  if (!iso) return '—'
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (hours < 24) return `${Math.max(0, hours)} ${t.hours}`
  return `${Math.floor(hours / 24)} ${t.days}`
}
