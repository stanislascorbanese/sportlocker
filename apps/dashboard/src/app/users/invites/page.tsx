import Link from 'next/link'

import {
  fetchCommunes,
  fetchInvites,
  type Commune,
  type InviteSummary,
} from '../../../lib/api'
import { cn } from '../../../lib/cn'
import { isDemoFallbackEnabled } from '../../../lib/demo-fallback'
import { RefreshButton } from '../../../components/RefreshButton'
import { getLang } from '../../../lib/lang-server'
import { getSessionUser } from '../../../lib/session-server'
import { commonStrings, fmtDateTime } from '../../../lib/i18n/common'
import { invitesStrings, inviteStatusLabel } from '../../../lib/i18n/invites'
import { makeMetadata } from '../../../lib/i18n/metadata'
import { InviteForm, type CommuneOption } from './InviteForm'
import { InviteRowActions } from './InviteRowActions'

export const dynamic = 'force-dynamic'
export const generateMetadata = makeMetadata((lang) => invitesStrings(lang).metaTitle)

const STATUS_STYLE: Record<string, string> = {
  pending:  'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
  accepted: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
  expired:  'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-500/30 dark:bg-zinc-500/10 dark:text-zinc-300',
}

const DEMO_INVITES: InviteSummary[] = [
  {
    token: 'demo-token-pending-000000000000000000',
    email: 'nouveau@bordeaux.fr',
    communeId: '00000000-0000-0000-0000-000000000001',
    communeName: 'Bordeaux',
    status: 'pending',
    expiresAt: new Date(Date.now() + 60 * 3_600_000).toISOString(),
    acceptedAt: null,
    createdAt: new Date(Date.now() - 12 * 3_600_000).toISOString(),
  },
  {
    token: 'demo-token-accepted-00000000000000000',
    email: 'marie@bordeaux.fr',
    communeId: '00000000-0000-0000-0000-000000000001',
    communeName: 'Bordeaux',
    status: 'accepted',
    expiresAt: new Date(Date.now() - 24 * 3_600_000).toISOString(),
    acceptedAt: new Date(Date.now() - 30 * 3_600_000).toISOString(),
    createdAt: new Date(Date.now() - 72 * 3_600_000).toISOString(),
  },
]

export default async function InvitesPage() {
  const lang = await getLang()
  const t = invitesStrings(lang)
  const c = commonStrings(lang)
  const session = await getSessionUser()
  const isSuperAdmin = session?.role === 'super_admin'

  let invites: InviteSummary[] = []
  let fetchError: string | null = null
  try {
    invites = await fetchInvites()
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'API unreachable'
  }

  const useDemo = isDemoFallbackEnabled() && (fetchError !== null)
  if (useDemo) invites = DEMO_INVITES

  // Communes pour le sélecteur (super_admin uniquement).
  let communes: CommuneOption[] = []
  if (isSuperAdmin && !useDemo) {
    try {
      const list: Commune[] = await fetchCommunes()
      communes = list.map((cm) => ({ id: cm.id, name: cm.name }))
    } catch { /* ignore */ }
  }

  const pending = invites.filter((i) => i.status === 'pending').length

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/users" className="text-sm text-gray-500 transition hover:text-navy-900 dark:text-white/55 dark:hover:text-white">
              {t.backToUsers}
            </Link>
            {useDemo && (
              <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-eyebrow text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                {c.demo}
              </span>
            )}
          </div>
          <h2 className="mt-1 font-display text-2xl text-navy-900 sm:text-3xl dark:text-white">{t.pageTitle}</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-white/55">
            {t.subtitle}
            {pending > 0 && <span className="text-amber-700 dark:text-amber-300"> · {pending} {t.statusPending.toLowerCase()}</span>}
          </p>
        </div>
        <RefreshButton />
      </header>

      {fetchError && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200/80">
          <p className="font-medium">{c.apiErrorTitle}</p>
          <p className="mt-1 font-mono text-meta text-amber-700 dark:text-amber-300/70">{fetchError}</p>
        </div>
      )}

      <InviteForm isSuperAdmin={isSuperAdmin} communes={communes} demo={useDemo} lang={lang} />

      <section>
        <h3 className="mb-3 text-eyebrow uppercase text-gray-500 dark:text-white/40">{t.listTitle}</h3>
        {invites.length === 0 ? (
          <div className="rounded-card border bg-white p-8 text-center text-sm text-gray-600 shadow-card dark:border-white/10 dark:bg-navy-800 dark:text-white/55 dark:shadow-none">
            {t.emptyInvites}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-card border bg-white shadow-card dark:border-white/10 dark:bg-navy-800 dark:shadow-none">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-gray-50 text-left text-eyebrow text-gray-600 dark:bg-navy-700/50 dark:text-white/55">
                <tr>
                  <th className="px-4 py-3 font-medium">{t.colEmail}</th>
                  <th className="px-4 py-3 font-medium">{t.colCommune}</th>
                  <th className="px-4 py-3 font-medium">{t.colStatus}</th>
                  <th className="px-4 py-3 font-medium">{t.colSent}</th>
                  <th className="px-4 py-3 font-medium">{t.colExpires}</th>
                  <th className="px-4 py-3 font-medium text-right">{t.colActions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-white/5">
                {invites.map((inv) => (
                  <tr key={inv.token}>
                    <td className="px-4 py-3 text-navy-900 dark:text-white/85">{inv.email}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-white/60">{inv.communeName}</td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide', STATUS_STYLE[inv.status])}>
                        {inviteStatusLabel(lang, inv.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-white/45">{fmtDateTime(lang, inv.createdAt)}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-white/45">{fmtDateTime(lang, inv.expiresAt)}</td>
                    <td className="px-4 py-3">
                      <InviteRowActions token={inv.token} email={inv.email} status={inv.status} demo={useDemo} lang={lang} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
