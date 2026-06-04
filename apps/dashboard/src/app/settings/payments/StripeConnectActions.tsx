'use client'

import { ArrowRight, RefreshCw } from 'lucide-react'
import { useTransition } from 'react'

import { Button } from '../../../components/ui/Button'
import type { Lang } from '../../../lib/lang'
import { paymentsStrings } from '../../../lib/i18n/payments'
import { refreshStatusAction, startOnboardingAction } from './_actions'

export function StripeConnectActions({
  connected,
  fullyVerified,
  lang,
}: {
  connected: boolean
  fullyVerified: boolean
  lang: Lang
}) {
  const t = paymentsStrings(lang)
  const [isPendingOnboard, startOnboardTransition] = useTransition()
  const [isPendingRefresh, startRefreshTransition] = useTransition()

  function onOnboard() {
    startOnboardTransition(() => {
      startOnboardingAction()
    })
  }

  function onRefresh() {
    startRefreshTransition(() => {
      refreshStatusAction()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {!fullyVerified && (
        <Button
          variant="primary"
          onClick={onOnboard}
          loading={isPendingOnboard}
          icon={!isPendingOnboard ? undefined : undefined}
        >
          {isPendingOnboard
            ? t.btnRedirecting
            : connected
              ? t.btnContinueVerification
              : t.btnConnectAccount}
          {!isPendingOnboard && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </Button>
      )}
      {connected && (
        <Button
          variant="secondary"
          onClick={onRefresh}
          loading={isPendingRefresh}
          icon={!isPendingRefresh ? <RefreshCw className="h-4 w-4" aria-hidden="true" /> : undefined}
        >
          {isPendingRefresh ? t.btnRefreshing : t.btnRefreshStatus}
        </Button>
      )}
    </div>
  )
}
