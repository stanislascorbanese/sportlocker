import { Badge, Card, EmptyState } from '../../components/ui'
import type { StayRow } from '../../lib/api'
import type { Lang } from '../../lib/lang'
import { stayStrings } from '../../lib/i18n/stays'

/**
 * Les séjours en cours et à venir, dans l'ordre d'arrivée.
 *
 * Pas de recherche, pas de tri, pas de pagination : le camping a son PMS pour
 * ça. Cette liste sert à vérifier d'un coup d'œil que l'import a bien pris —
 * les bons emplacements, les bonnes dates — et à voir qui a du matériel dehors.
 */
export function StaysTable({ rows, lang }: { rows: StayRow[]; lang: Lang }) {
  const t = stayStrings(lang)

  if (rows.length === 0) {
    return <EmptyState title={t.listEmpty} description={t.listEmptyHint} />
  }

  return (
    <section className="space-y-3">
      <h2 className="text-eyebrow font-semibold uppercase text-gray-500 dark:text-white/40">
        {t.listTitle}
      </h2>

      {/* Cartes — téléphone */}
      <ul className="space-y-2 md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Card variant="elevated" padding="md" className="space-y-1">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 truncate font-semibold text-navy-900 dark:text-white">
                  {row.stayRef} · {guestName(row)}
                </p>
                {row.hasOpenLoan && <Badge tone="warning">{t.statusOut}</Badge>}
              </div>
              <p className="text-meta text-gray-500 dark:text-white/45">
                {fmtDay(row.arrivesOn, lang)} → {fmtDay(row.departsOn, lang)}
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
              <th scope="col" className="px-4 py-3 font-medium">{t.colRef}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t.colGuest}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t.colArrives}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t.colDeparts}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t.colStatus}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-white/10">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3 font-semibold tabular-nums text-navy-900 dark:text-white">
                  {row.stayRef}
                </td>
                <td className="px-4 py-3 font-medium text-navy-900 dark:text-white">
                  {guestName(row)}
                </td>
                <td className="px-4 py-3 tabular-nums text-gray-600 dark:text-white/55">
                  {fmtDay(row.arrivesOn, lang)}
                </td>
                <td className="px-4 py-3 tabular-nums text-gray-600 dark:text-white/55">
                  {fmtDay(row.departsOn, lang)}
                </td>
                <td className="px-4 py-3">
                  {row.hasOpenLoan ? (
                    <Badge tone="warning">{t.statusOut}</Badge>
                  ) : (
                    <span className="text-gray-400 dark:text-white/30">{t.statusHere}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  )
}

function guestName(row: StayRow): string {
  return [row.firstName, row.lastName].filter(Boolean).join(' ')
}

function fmtDay(iso: string, lang: Lang): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'short',
  })
}
