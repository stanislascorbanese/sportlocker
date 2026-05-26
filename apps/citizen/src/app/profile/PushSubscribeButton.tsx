'use client'

import { Bell, BellOff, BellRing } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Card } from '../../components/ui/Card'
import { fetchReminderPreferences } from '../../lib/api'
import { cn } from '../../lib/cn'
import { useT } from '../../lib/i18n/I18nProvider'
import type { MessageKey } from '../../lib/i18n/messages'
import {
  REMINDER_MINUTES_CHOICES,
  currentPermission,
  detectPushSupport,
  getCurrentSubscription,
  subscribePush,
  unsubscribePush,
  type PushPermission,
  type PushSupportStatus,
  type ReminderMinutesBefore,
} from '../../lib/push'

/**
 * Bouton "Activer les notifications" pour /profile citoyen.
 *
 * États visuels :
 *   - unsupported / insecure-context : message grisé
 *   - denied : message rouge
 *   - default + pas de sub : dropdown délai + bouton "Activer"
 *   - granted + sub active : badge actif + dropdown modifiable + "Désactiver"
 */
const REMINDER_LABEL_KEYS: Record<ReminderMinutesBefore, MessageKey> = {
  15: 'profile.push.minutes_15_full',
  30: 'profile.push.minutes_30_full',
  60: 'profile.push.minutes_60_full',
  120: 'profile.push.minutes_120_full',
}

const REMINDER_LABEL_SHORT_KEYS: Record<ReminderMinutesBefore, MessageKey> = {
  15: 'profile.push.minutes_15',
  30: 'profile.push.minutes_30',
  60: 'profile.push.minutes_60',
  120: 'profile.push.minutes_120',
}

export function PushSubscribeButton() {
  const t = useT()
  const [support, setSupport] = useState<PushSupportStatus>('unsupported')
  const [permission, setPermission] = useState<PushPermission>('unsupported')
  const [hasSubscription, setHasSubscription] = useState<boolean | null>(null)
  const [reminderMinutes, setReminderMinutes] = useState<ReminderMinutesBefore>(15)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    setSupport(detectPushSupport())
    setPermission(currentPermission())
    getCurrentSubscription()
      .then((sub) => setHasSubscription(sub !== null))
      .catch(() => setHasSubscription(false))
    fetchReminderPreferences()
      .then((p) => {
        if ((REMINDER_MINUTES_CHOICES as readonly number[]).includes(p.reminderMinutesBefore)) {
          setReminderMinutes(p.reminderMinutesBefore as ReminderMinutesBefore)
        }
      })
      .catch(() => undefined)
  }, [])

  async function onActivate() {
    setError(null)
    setSuccess(null)
    setPending(true)
    try {
      const res = await subscribePush({ reminderMinutesBefore: reminderMinutes })
      if (res.ok) {
        setHasSubscription(true)
        setPermission('granted')
        setSuccess(
          t('profile.push.activate_success', {
            label: t(REMINDER_LABEL_KEYS[reminderMinutes]),
          }),
        )
      } else {
        const reasonKey: Record<typeof res.reason, MessageKey> = {
          unsupported: 'profile.push.reason.unsupported',
          permission_denied: 'profile.push.reason.permission_denied',
          vapid_missing: 'profile.push.reason.vapid_missing',
          subscribe_failed: 'profile.push.reason.subscribe_failed',
          register_failed: 'profile.push.reason.register_failed',
        }
        setError(t(reasonKey[res.reason] ?? 'profile.push.reason.unknown'))
        setPermission(currentPermission())
      }
    } finally {
      setPending(false)
    }
  }

  async function onDeactivate() {
    setError(null)
    setSuccess(null)
    setPending(true)
    try {
      await unsubscribePush()
      setHasSubscription(false)
      setSuccess(t('profile.push.deactivate_success'))
    } finally {
      setPending(false)
    }
  }

  async function onChangeReminder(value: ReminderMinutesBefore) {
    setReminderMinutes(value)
    if (!hasSubscription) return // pré-selection avant activation
    setError(null)
    setPending(true)
    try {
      const res = await subscribePush({ reminderMinutesBefore: value })
      if (res.ok) {
        setSuccess(
          t('profile.push.update_success', {
            label: t(REMINDER_LABEL_KEYS[value]),
          }),
        )
      } else {
        setError(t('profile.push.reason.update_failed'))
      }
    } finally {
      setPending(false)
    }
  }

  if (support === 'insecure-context') {
    return (
      <Card padding="lg">
        <Header
          icon={<BellOff className="h-4 w-4 text-gray-400 dark:text-white/40" />}
          title={t('profile.push.unavailable_title')}
        >
          {t('profile.push.insecure_help')}
        </Header>
      </Card>
    )
  }
  if (support === 'unsupported') {
    return (
      <Card padding="lg">
        <Header
          icon={<BellOff className="h-4 w-4 text-gray-400 dark:text-white/40" />}
          title={t('profile.push.unavailable_title')}
        >
          {t('profile.push.unsupported_help')}
        </Header>
      </Card>
    )
  }

  if (permission === 'denied') {
    return (
      <Card padding="lg">
        <Header
          icon={<BellOff className="h-4 w-4 text-rose-600 dark:text-rose-300" />}
          title={t('profile.push.denied_title')}
        >
          {t('profile.push.denied_help')}
        </Header>
      </Card>
    )
  }

  if (hasSubscription === null) {
    return (
      <Card padding="lg">
        <Header
          icon={<Bell className="h-4 w-4 text-gray-400 dark:text-white/40" />}
          title={t('profile.push.loading_title')}
        >
          {t('ui.loading')}
        </Header>
      </Card>
    )
  }

  return (
    <Card padding="lg">
      <Header
        icon={
          hasSubscription ? (
            <BellRing className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
          ) : (
            <Bell className="h-4 w-4 text-gray-600 dark:text-white/70" />
          )
        }
        title={
          hasSubscription ? t('profile.push.subscribed_title') : t('profile.push.subscribe_title')
        }
      >
        {t('profile.push.subscribe_help')}
      </Header>

      <div className="mt-4">
        <p className="text-eyebrow uppercase text-gray-500 dark:text-white/50">
          {t('profile.push.reminder_label')}
        </p>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {REMINDER_MINUTES_CHOICES.map((m) => {
            const isSelected = reminderMinutes === m
            return (
              <button
                key={m}
                type="button"
                onClick={() => onChangeReminder(m)}
                disabled={pending}
                className={cn(
                  'rounded-lg border px-2 py-2 text-sm font-medium tabular-nums transition-colors duration-base',
                  isSelected
                    ? 'border-emerald-400 bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-100'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-navy-900 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:border-white/30 dark:hover:text-white',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
                aria-pressed={isSelected}
                aria-label={t('profile.push.reminder_aria', {
                  label: t(REMINDER_LABEL_KEYS[m]),
                })}
              >
                {t(REMINDER_LABEL_SHORT_KEYS[m])}
              </button>
            )
          })}
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border p-2 text-meta border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          {error}
        </p>
      )}
      {success && (
        <p className="mt-3 rounded-lg border p-2 text-meta border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          {success}
        </p>
      )}

      <button
        type="button"
        onClick={hasSubscription ? onDeactivate : onActivate}
        disabled={pending}
        className={cn(
          'mt-3 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors duration-base',
          hasSubscription
            ? 'border-gray-200 bg-white text-navy-900 hover:border-gray-300 dark:border-white/15 dark:bg-white/5 dark:text-white/85 dark:hover:border-white/30'
            : 'border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-100 dark:hover:bg-emerald-500/25',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        {pending
          ? '…'
          : hasSubscription
            ? t('profile.push.deactivate_btn')
            : t('profile.push.activate_btn')}
      </button>
    </Card>
  )
}

function Header({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold text-navy-900 dark:text-white">{title}</h2>
      </div>
      <p className="mt-1 text-meta leading-relaxed text-gray-600 dark:text-white/60">{children}</p>
    </>
  )
}
