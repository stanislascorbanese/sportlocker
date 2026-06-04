import { Receipt } from 'lucide-react'

import { Badge, type BadgeTone } from '../../../components/ui/Badge'
import { Card } from '../../../components/ui/Card'
import { fetchAdminPayments, type AdminPayment, type PaymentStatus } from '../../../lib/api'

/**
 * Carte « Transactions » de la page /settings/payments.
 *
 * Liste les paiements de location (transactions citoyennes) du tenant — scope
 * multi-tenant côté API (admin = sa commune, super_admin = tout). Affiche les
 * 50 dernières, tri DESC createdAt. En mode `simulate` (dev), les paiements
 * confirmés via le bouton « Payer (mode test) » apparaissent ici en `succeeded`.
 *
 * Server component : fetch côté serveur, dégradation propre si l'API renvoie
 * une erreur (ex: route pas encore déployée) — on n'écroule pas la page.
 */
const STATUS_META: Record<PaymentStatus, { label: string; tone: BadgeTone }> = {
  succeeded: { label: 'Payé', tone: 'success' },
  pending: { label: 'En attente', tone: 'info' },
  failed: { label: 'Échoué', tone: 'danger' },
  cancelled: { label: 'Annulé', tone: 'neutral' },
  refunded: { label: 'Remboursé', tone: 'warning' },
}

export async function TransactionsCard() {
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
          Transactions
        </h2>
        {items.length > 0 && (
          <span className="text-meta text-gray-500 dark:text-white/40">
            {items.length} dernière{items.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {fetchError ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200/80">
          <p className="font-medium">Impossible de charger les transactions</p>
          <p className="mt-1 font-mono text-meta text-amber-700 dark:text-amber-300/70">{fetchError}</p>
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-600 dark:border-white/10 dark:bg-navy-700/40 dark:text-white/55">
          Aucune transaction pour le moment. Les paiements de location apparaîtront ici dès la
          première réservation réglée.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border bg-white dark:border-white/10 dark:bg-navy-800">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-gray-50 text-left text-eyebrow text-gray-600 dark:bg-navy-700/50 dark:text-white/55">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Citoyen</th>
                <th className="px-4 py-3 font-medium">Matériel · Distributeur</th>
                <th className="px-4 py-3 font-medium text-right">Montant</th>
                <th className="px-4 py-3 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-white/5">
              {items.map((p) => {
                const meta = STATUS_META[p.status]
                return (
                  <tr key={p.id} className="text-navy-900 dark:text-white/85">
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-white/55">
                      {fmtDate(p.createdAt)}
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
                      {fmtAmount(p.amountCents, p.currency)}
                      {p.provider === 'simulate' && (
                        <span className="ml-1 text-meta font-normal text-gray-400 dark:text-white/35">
                          (test)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={meta.tone} size="sm">
                        {meta.label}
                      </Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function fmtAmount(cents: number, currency: string): string {
  return (cents / 100).toLocaleString('fr-FR', {
    style: 'currency',
    currency: currency || 'EUR',
  })
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
