import { Receipt } from 'lucide-react'

import { Badge, type BadgeTone } from '../../../components/ui/Badge'
import { Card } from '../../../components/ui/Card'
import { fetchAdminPayments, type AdminPayment, type PaymentStatus } from '../../../lib/api'
import type { Lang } from '../../../lib/lang'
import { dateLocale } from '../../../lib/i18n/common'
import { paymentsStrings, paymentStatusLabel } from '../../../lib/i18n/payments'

const STATUS_TONE: Record<PaymentStatus, BadgeTone> = {
  succeeded: 'success',
  pending:   'info',
  failed:    'danger',
  cancelled: 'neutral',
  refunded:  'warning',
}

export async function TransactionsCard({ lang }: { lang: Lang }) {
  const t = paymentsStrings(lang)
  let items: AdminPayment[] = []
  let fetchError: string | null = null
  try {
    const page = await fetchAdminPayments({ limit: 50 })
    items = page.items
  } catch (err) {
    fetchError = (err as Error).message
  }

  return (
    <Card variant="elevated" padding="lg" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-navy-900 dark:text-white">
          <Receipt className="h-5 w-5 text-brand-400" aria-hidden="true" />
          {t.transactionsTitle}
        </h2>
        {items.length > 0 && (
          <span className="text-meta text-gray-500 dark:text-white/40">
            {items.length} {items.length > 1 ? t.transactionsLastMany : t.transactionsLast1}
          </span>
        )}
      </div>

      {fetchError ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200/80">
          <p className="font-medium">{t.transactionsLoadError}</p>
          <p className="mt-1 font-mono text-meta text-amber-700 dark:text-amber-300/70">{fetchError}</p>
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-600 dark:border-white/10 dark:bg-navy-700/40 dark:text-white/55">
          {t.transactionsEmpty}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border bg-white dark:border-white/10 dark:bg-navy-800">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-gray-50 text-left text-eyebrow text-gray-600 dark:bg-navy-700/50 dark:text-white/55">
              <tr>
                <th className="px-4 py-3 font-medium">{t.colDate}</th>
                <th className="px-4 py-3 font-medium">{t.colCitizen}</th>
                <th className="px-4 py-3 font-medium">{t.colItem}</th>
                <th className="px-4 py-3 font-medium text-right">{t.colAmount}</th>
                <th className="px-4 py-3 font-medium">{t.colStatus}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-white/5">
              {items.map((p) => (
                <tr key={p.id} className="text-navy-900 dark:text-white/85">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-white/55">
                    {fmtDate(lang, p.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="block truncate font-medium">
                      {p.user.displayName ?? p.user.email}
                    </span>
                    {p.user.displayName && (
                      <span className="block truncate text-meta text-gray-500 dark:text-white/40">
                        {p.user.email}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="block truncate">{p.item.typeName}</span>
                    <span className="block truncate text-meta text-gray-500 dark:text-white/40">
                      {p.distributor.name}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">
                    {fmtAmount(lang, p.amountCents, p.currency)}
                    {p.provider === 'simulate' && (
                      <span className="ml-1 text-meta font-normal text-gray-400 dark:text-white/35">
                        {t.testFlag}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[p.status]} size="sm">
                      {paymentStatusLabel(lang, p.status)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function fmtAmount(lang: Lang, cents: number, currency: string): string {
  return (cents / 100).toLocaleString(dateLocale(lang), {
    style: 'currency',
    currency: currency || 'EUR',
  })
}

function fmtDate(lang: Lang, iso: string): string {
  return new Date(iso).toLocaleString(dateLocale(lang), {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
