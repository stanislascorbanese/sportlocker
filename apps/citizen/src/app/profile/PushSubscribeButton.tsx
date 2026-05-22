'use client'

import { Bell, BellOff, BellRing } from 'lucide-react'
import { useEffect, useState } from 'react'

import { fetchReminderPreferences } from '../../lib/api'
import { cn } from '../../lib/cn'
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
 *   - **unsupported / insecure-context** : message grisé "non disponible"
 *   - **denied** : message rouge + lien vers les réglages browser
 *   - **default + pas de sub** : dropdown délai + bouton vert "Activer"
 *   - **granted + sub active** : badge vert + dropdown délai (modifiable) +
 *     bouton "Désactiver". Changer la valeur du dropdown re-POST la sub
 *     pour mettre à jour la préférence côté backend.
 *   - **pending** : spinner inline pendant subscribe/unsubscribe.
 *
 * Le délai du rappel est stocké côté `users.reminder_minutes_before` (donc
 * partagé entre devices du même user). UI propose 15/30/60/120 min, 15 min
 * en défaut (cf. PR 0011).
 */
const REMINDER_LABELS: Record<ReminderMinutesBefore, string> = {
  15: '15 minutes',
  30: '30 minutes',
  60: '1 heure',
  120: '2 heures',
}

/** Libellé court pour les pills (gain de place sur mobile). */
const REMINDER_LABELS_SHORT: Record<ReminderMinutesBefore, string> = {
  15: '15 min',
  30: '30 min',
  60: '1 h',
  120: '2 h',
}

export function PushSubscribeButton() {
  const [support, setSupport] = useState<PushSupportStatus>('unsupported')
  const [permission, setPermission] = useState<PushPermission>('unsupported')
  const [hasSubscription, setHasSubscription] = useState<boolean | null>(null)
  const [reminderMinutes, setReminderMinutes] = useState<ReminderMinutesBefore>(15)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Init : détecte le support + l'état de subscription + la préférence user.
  useEffect(() => {
    setSupport(detectPushSupport())
    setPermission(currentPermission())
    getCurrentSubscription()
      .then((sub) => setHasSubscription(sub !== null))
      .catch(() => setHasSubscription(false))
    // Charge la préf user pour pré-sélectionner le dropdown. Si l'API
    // tombe ou si user pas connecté, on garde 15 min par défaut.
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
        setSuccess(`Rappels activés. Tu recevras une notif ${REMINDER_LABELS[reminderMinutes]} avant chaque créneau réservé.`)
      } else {
        const map: Record<typeof res.reason, string> = {
          unsupported: 'Ton navigateur ne supporte pas les notifications push.',
          permission_denied: 'Tu as refusé les notifications. Réactive-les dans les réglages du navigateur.',
          vapid_missing: 'Les notifications ne sont pas encore configurées côté serveur. Réessaie plus tard.',
          subscribe_failed: 'Échec de l\'abonnement. Recharge la page et réessaie.',
          register_failed: 'L\'abonnement est créé côté navigateur mais le serveur n\'a pas pu l\'enregistrer. Réessaie.',
        }
        setError(map[res.reason] ?? 'Erreur inattendue.')
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
      setSuccess('Rappels désactivés.')
    } finally {
      setPending(false)
    }
  }

  /**
   * Changement du dropdown délai alors qu'une sub existe déjà : on re-POST
   * pour update la préférence côté backend (et lastUsedAt du token). Pas de
   * re-subscribe browser nécessaire — c'est la même PushSubscription.
   */
  async function onChangeReminder(value: ReminderMinutesBefore) {
    setReminderMinutes(value)
    if (!hasSubscription) return  // pré-selection avant activation, rien à push
    setError(null)
    setPending(true)
    try {
      const res = await subscribePush({ reminderMinutesBefore: value })
      if (res.ok) {
        setSuccess(`Préférence mise à jour : ${REMINDER_LABELS[value]} avant le créneau.`)
      } else {
        setError('Impossible de mettre à jour la préférence. Réessaie.')
      }
    } finally {
      setPending(false)
    }
  }

  if (support === 'insecure-context') {
    return (
      <Card>
        <Header icon={<BellOff className="h-4 w-4 text-white/40" />} title="Notifications indisponibles">
          Le navigateur exige une connexion HTTPS pour activer les notifications.
        </Header>
      </Card>
    )
  }
  if (support === 'unsupported') {
    return (
      <Card>
        <Header icon={<BellOff className="h-4 w-4 text-white/40" />} title="Notifications indisponibles">
          Ce navigateur ne supporte pas les notifications push. Essaie avec Chrome, Firefox ou Safari 16+.
        </Header>
      </Card>
    )
  }

  if (permission === 'denied') {
    return (
      <Card>
        <Header icon={<BellOff className="h-4 w-4 text-rose-300" />} title="Notifications bloquées">
          Tu as refusé les notifications pour SportLocker. Pour les réactiver, ouvre les réglages du
          site dans ton navigateur (icône de cadenas dans la barre d'adresse).
        </Header>
      </Card>
    )
  }

  if (hasSubscription === null) {
    return (
      <Card>
        <Header icon={<Bell className="h-4 w-4 text-white/40" />} title="Notifications">
          Chargement…
        </Header>
      </Card>
    )
  }

  return (
    <Card>
      <Header
        icon={
          hasSubscription
            ? <BellRing className="h-4 w-4 text-emerald-300" />
            : <Bell className="h-4 w-4 text-white/70" />
        }
        title={hasSubscription ? 'Rappels activés' : 'Activer les rappels'}
      >
        Reçois une notif avant chaque créneau réservé. Tu peux désactiver à tout moment.
      </Header>

      <div className="mt-4">
        <p className="text-[11px] uppercase tracking-wider text-white/50">
          Recevoir le rappel avant le créneau
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
                  'rounded-lg border px-2 py-2 text-sm font-medium tabular-nums transition',
                  isSelected
                    ? 'border-emerald-400 bg-emerald-500/15 text-emerald-100'
                    : 'border-white/10 bg-white/5 text-white/70 hover:border-white/30 hover:text-white',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
                aria-pressed={isSelected}
                aria-label={`${REMINDER_LABELS[m]} avant le créneau`}
              >
                {REMINDER_LABELS_SHORT[m]}
              </button>
            )
          })}
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-[11px] text-rose-200">
          {error}
        </p>
      )}
      {success && (
        <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-[11px] text-emerald-200">
          {success}
        </p>
      )}

      <button
        type="button"
        onClick={hasSubscription ? onDeactivate : onActivate}
        disabled={pending}
        className={cn(
          'mt-3 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition',
          hasSubscription
            ? 'border-white/15 bg-white/5 text-white/85 hover:border-white/30'
            : 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        {pending
          ? '…'
          : hasSubscription
            ? 'Désactiver les rappels'
            : 'Activer les rappels'}
      </button>
    </Card>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5">{children}</section>
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
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-white/60">{children}</p>
    </>
  )
}
