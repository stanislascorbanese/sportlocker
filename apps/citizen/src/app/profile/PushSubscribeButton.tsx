'use client'

import { Bell, BellOff, BellRing } from 'lucide-react'
import { useEffect, useState } from 'react'

import { cn } from '../../lib/cn'
import {
  currentPermission,
  detectPushSupport,
  getCurrentSubscription,
  subscribePush,
  unsubscribePush,
  type PushPermission,
  type PushSupportStatus,
} from '../../lib/push'

/**
 * Bouton "Activer les notifications" pour /profile citoyen.
 *
 * États visuels :
 *   - **unsupported / insecure-context** : message grisé "non disponible"
 *   - **denied** : message rouge + lien vers les réglages browser
 *   - **default + pas de sub** : bouton vert "Activer les rappels"
 *   - **granted + sub active** : badge vert "Activées" + bouton "Désactiver"
 *   - **pending** : spinner inline pendant subscribe/unsubscribe
 *
 * UX importante : le bouton est désactivé tant que la permission n'est pas
 * tranchée (eviter le double-prompt sur Safari qui n'oublie pas). Sur
 * succès on affiche un petit toast inline "C'est activé". Sur échec
 * (`vapid_missing` ex.) on affiche une erreur cohérente.
 */
export function PushSubscribeButton() {
  const [support, setSupport] = useState<PushSupportStatus>('unsupported')
  const [permission, setPermission] = useState<PushPermission>('unsupported')
  const [hasSubscription, setHasSubscription] = useState<boolean | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Init : détecte le support + l'état de subscription actuel.
  useEffect(() => {
    setSupport(detectPushSupport())
    setPermission(currentPermission())
    getCurrentSubscription()
      .then((sub) => setHasSubscription(sub !== null))
      .catch(() => setHasSubscription(false))
  }, [])

  async function onActivate() {
    setError(null)
    setSuccess(null)
    setPending(true)
    try {
      const res = await subscribePush()
      if (res.ok) {
        setHasSubscription(true)
        setPermission('granted')
        setSuccess('Rappels activés. Tu recevras une notif 1h avant chaque créneau réservé.')
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

  // État chargement initial (avant que useEffect ait résolu).
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
        Reçois une notif <strong>1 heure avant</strong> chaque créneau réservé. Tu peux désactiver à
        tout moment.
      </Header>

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
