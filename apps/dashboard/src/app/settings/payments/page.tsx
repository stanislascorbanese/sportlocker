import { CreditCard, AlertTriangle, CheckCircle2, Clock, XCircle, Info } from 'lucide-react'

import { Badge, type BadgeTone } from '../../../components/ui/Badge'
import { Card } from '../../../components/ui/Card'
import { PageHeader } from '../../../components/ui/PageHeader'
import { fetchStripeConnectStatus, type StripeConnectStatus } from '../../../lib/api'
import { cn } from '../../../lib/cn'
import { getLang } from '../../../lib/lang-server'
import type { Lang } from '../../../lib/lang'
import { dateLocale } from '../../../lib/i18n/common'
import { paymentsStrings } from '../../../lib/i18n/payments'
import { StripeConnectActions } from './StripeConnectActions'
import { TransactionsCard } from './TransactionsCard'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Paiements · SportLocker ops' }

type DisplayState =
  | { kind: 'server_not_configured' }
  | { kind: 'super_admin_no_commune' }
  | { kind: 'not_started' }
  | { kind: 'pending_verification'; status: StripeConnectStatus }
  | { kind: 'charges_only'; status: StripeConnectStatus }
  | { kind: 'payouts_only'; status: StripeConnectStatus }
  | { kind: 'fully_verified'; status: StripeConnectStatus }

function classify(
  result: StripeConnectStatus | { notConfigured: true },
): DisplayState {
  if ('notConfigured' in result) return { kind: 'server_not_configured' }
  if (!result.connected) return { kind: 'not_started' }
  if (result.chargesEnabled && result.payoutsEnabled) {
    return { kind: 'fully_verified', status: result }
  }
  if (result.chargesEnabled) return { kind: 'charges_only', status: result }
  if (result.payoutsEnabled) return { kind: 'payouts_only', status: result }
  return { kind: 'pending_verification', status: result }
}

const STATE_TONE: Record<DisplayState['kind'], BadgeTone> = {
  server_not_configured: 'neutral',
  super_admin_no_commune: 'neutral',
  not_started: 'warning',
  pending_verification: 'info',
  charges_only: 'warning',
  payouts_only: 'warning',
  fully_verified: 'success',
}

const STATE_ICON: Record<DisplayState['kind'], typeof CheckCircle2> = {
  server_not_configured: AlertTriangle,
  super_admin_no_commune: Info,
  not_started: XCircle,
  pending_verification: Clock,
  charges_only: AlertTriangle,
  payouts_only: AlertTriangle,
  fully_verified: CheckCircle2,
}

export default async function PaymentsPage() {
  const lang = await getLang()
  const t = paymentsStrings(lang)

  let state: DisplayState
  try {
    const result = await fetchStripeConnectStatus()
    state = classify(result)
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('super_admin_must_specify_commune_id')) {
      state = { kind: 'super_admin_no_commune' }
    } else {
      throw err
    }
  }

  const StateIcon = STATE_ICON[state.kind]
  const tone = STATE_TONE[state.kind]
  const status = 'status' in state ? state.status : null

  const stateLabel: Record<DisplayState['kind'], string> = {
    server_not_configured: t.badgeServerNotConfigured,
    super_admin_no_commune: t.badgeSuperAdminNoCommune,
    not_started:           t.badgeNotStarted,
    pending_verification:  t.badgePendingVerification,
    charges_only:          t.badgeChargesOnly,
    payouts_only:          t.badgePayoutsOnly,
    fully_verified:        t.badgeFullyVerified,
  }

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.pageTitle}
        icon={<CreditCard className="h-5 w-5" aria-hidden="true" />}
      />

      <TransactionsCard lang={lang} />

      <Card variant="elevated" padding="lg" className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge
            tone={tone}
            size="sm"
            icon={<StateIcon className="h-3.5 w-3.5" aria-hidden="true" />}
          >
            {stateLabel[state.kind]}
          </Badge>
          {status?.accountId && (
            <span className="font-mono text-meta text-gray-400 dark:text-white/40">
              {status.accountId}
            </span>
          )}
        </div>

        <StateHelp state={state} lang={lang} />

        {state.kind !== 'server_not_configured' && state.kind !== 'super_admin_no_commune' && (
          <StripeConnectActions
            connected={state.kind !== 'not_started'}
            fullyVerified={state.kind === 'fully_verified'}
            lang={lang}
          />
        )}

        {status && (
          <div className="grid grid-cols-1 gap-3 border-t pt-2 sm:grid-cols-2 border-gray-200 dark:border-white/5">
            <FlagRow
              label={t.flagCharges}
              enabled={status.chargesEnabled}
              hint={t.flagChargesHint}
            />
            <FlagRow
              label={t.flagPayouts}
              enabled={status.payoutsEnabled}
              hint={t.flagPayoutsHint}
            />
            {status.onboardedAt && (
              <div className="pt-2 text-meta text-gray-500 dark:text-white/40 sm:col-span-2">
                {t.firstVerificationLabel}{' '}
                <span className="text-navy-900 dark:text-white/60">
                  {fmtDate(lang, status.onboardedAt)}
                </span>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card variant="elevated" padding="lg" className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-navy-900 dark:text-white">
          {t.howItWorks}
        </h2>
        <ol className="space-y-3 text-sm leading-relaxed text-gray-700 dark:text-white/70">
          <Step n="01">{t.step1}</Step>
          <Step n="02">
            {t.step2_a}{' '}
            <strong className="font-semibold text-navy-900 dark:text-white">{t.step2_b}</strong>
            {t.step2_c}
          </Step>
          <Step n="03">
            {t.step3_a}
            <strong className="font-semibold text-navy-900 dark:text-white">{t.step3_b}</strong>
            {t.step3_c}
          </Step>
        </ol>
      </Card>
    </main>
  )
}

function Step({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 font-mono text-brand-400">{n}.</span>
      <span>{children}</span>
    </li>
  )
}

function StateHelp({ state, lang }: { state: DisplayState; lang: Lang }) {
  const t = paymentsStrings(lang)
  const cls = 'text-sm leading-relaxed text-gray-700 dark:text-white/70'
  const help: Record<DisplayState['kind'], string> = {
    server_not_configured: t.helpServerNotConfigured,
    super_admin_no_commune: t.helpSuperAdminNoCommune,
    not_started:           t.helpNotStarted,
    pending_verification:  t.helpPendingVerification,
    charges_only:          t.helpChargesOnly,
    payouts_only:          t.helpPayoutsOnly,
    fully_verified:        t.helpFullyVerified,
  }
  return <p className={cls}>{help[state.kind]}</p>
}

function FlagRow({
  label,
  enabled,
  hint,
}: {
  label: string
  enabled: boolean
  hint: string
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        {enabled ? (
          <CheckCircle2
            className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          />
        ) : (
          <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        )}
        <span
          className={cn(
            'text-sm font-medium',
            enabled
              ? 'text-navy-900 dark:text-white'
              : 'text-gray-700 dark:text-white/75',
          )}
        >
          {label}
        </span>
      </div>
      <p className="text-meta leading-relaxed text-gray-500 dark:text-white/45">{hint}</p>
    </div>
  )
}

function fmtDate(lang: Lang, iso: string): string {
  return new Date(iso).toLocaleDateString(dateLocale(lang), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
