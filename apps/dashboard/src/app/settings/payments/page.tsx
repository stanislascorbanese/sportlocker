import { CreditCard, AlertTriangle, CheckCircle2, Clock, XCircle, Info } from 'lucide-react'

import { fetchStripeConnectStatus, type StripeConnectStatus } from '../../../lib/api'
import { cn } from '../../../lib/cn'
import { StripeConnectActions } from './StripeConnectActions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Paiements · SportLocker ops' }

/**
 * Page /settings/payments — onboarding Stripe Connect du tenant.
 *
 * États gérés (le badge + le contenu de la card varient en fonction) :
 *   - server_not_configured : l'API n'a pas STRIPE_SECRET_KEY → on affiche
 *     un message clair "configurer côté serveur" sans casser la page.
 *   - not_started           : pas de Stripe account associé. CTA "Connecter".
 *   - pending_verification  : account créé mais Stripe pas encore validé
 *     (KYC en cours OU abandonnée). CTA "Continuer la vérification".
 *   - charges_only          : charges OK mais payouts pas encore (rare,
 *     Stripe pause parfois payouts pour AML). CTA "Continuer".
 *   - payouts_only          : inverse (rare aussi).
 *   - fully_verified        : les deux flags green. Plus de CTA, juste
 *     "Rafraîchir le statut" pour pull les derniers changements.
 *
 * Le scoping est implicite : l'admin scoped voit sa commune, le super_admin
 * voit... rien tant qu'on n'a pas de selector de commune. À ajouter dans
 * un follow-up si super_admin a besoin de toucher le Stripe d'un tenant
 * spécifique (rare en pratique — c'est le tenant qui onboarde son propre
 * Stripe). Pour l'instant super_admin verra le 400 "missing commune_id"
 * → on l'intercepte et on affiche un message dédié.
 */

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

const STATE_META: Record<
  DisplayState['kind'],
  { label: string; cls: string; icon: typeof CheckCircle2 }
> = {
  server_not_configured: {
    label: 'Non configuré côté serveur',
    cls: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/30',
    icon: AlertTriangle,
  },
  super_admin_no_commune: {
    label: 'Sélectionne une commune',
    cls: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/30',
    icon: Info,
  },
  not_started: {
    label: 'Non configuré',
    cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    icon: XCircle,
  },
  pending_verification: {
    label: 'Vérification en cours',
    cls: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
    icon: Clock,
  },
  charges_only: {
    label: 'Payouts bloqués',
    cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    icon: AlertTriangle,
  },
  payouts_only: {
    label: 'Paiements bloqués',
    cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    icon: AlertTriangle,
  },
  fully_verified: {
    label: 'Connecté',
    cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    icon: CheckCircle2,
  },
}

export default async function PaymentsPage() {
  let state: DisplayState
  try {
    const result = await fetchStripeConnectStatus()
    state = classify(result)
  } catch (err) {
    // L'API renvoie 400 super_admin_must_specify_commune_id pour les super
    // admins qui appellent sans communeId. On dégrade en UX au lieu de
    // crasher la page entière.
    const msg = (err as Error).message
    if (msg.includes('super_admin_must_specify_commune_id')) {
      state = { kind: 'super_admin_no_commune' }
    } else {
      throw err
    }
  }

  const meta = STATE_META[state.kind]
  const StateIcon = meta.icon
  const status = 'status' in state ? state.status : null

  return (
    <main className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="rounded-lg bg-brand-500/10 border border-brand-500/30 p-2.5">
          <CreditCard className="h-5 w-5 text-brand-400" aria-hidden />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-white/50">Paramètres</p>
          <h1 className="font-display text-2xl font-bold">Paiements & reversements</h1>
        </div>
      </header>

      {/* Status card principal */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wider',
                meta.cls,
              )}
            >
              <StateIcon className="h-3.5 w-3.5" aria-hidden />
              {meta.label}
            </span>
            {status?.accountId && (
              <span className="font-mono text-[11px] text-white/40">{status.accountId}</span>
            )}
          </div>
        </div>

        {/* Help text contextuel */}
        <StateHelp state={state} />

        {/* CTAs — affichés sauf cas server_not_configured / super_admin_no_commune */}
        {state.kind !== 'server_not_configured' && state.kind !== 'super_admin_no_commune' && (
          <StripeConnectActions
            connected={state.kind !== 'not_started'}
            fullyVerified={state.kind === 'fully_verified'}
          />
        )}

        {/* Flags détails — visible quand un account existe */}
        {status && (
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
            <FlagRow
              label="Paiements entrants"
              enabled={status.chargesEnabled}
              hint="Stripe a vérifié l'identité et autorise les paiements de tes citoyens."
            />
            <FlagRow
              label="Payouts vers ton RIB"
              enabled={status.payoutsEnabled}
              hint="Stripe peut envoyer les fonds vers ton compte bancaire (J+2)."
            />
            {status.onboardedAt && (
              <div className="col-span-2 text-[11px] text-white/40 pt-2">
                Première vérification complète :{' '}
                <span className="text-white/60">{fmtDate(status.onboardedAt)}</span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Comment ça marche — pédagogique */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
        <h2 className="font-display text-lg font-semibold">Comment fonctionne le reversement ?</h2>
        <ol className="space-y-3 text-sm text-white/70 leading-relaxed">
          <li className="flex gap-3">
            <span className="font-mono text-brand-400 shrink-0">01.</span>
            <span>
              Tu connectes ton compte Stripe Express via le bouton ci-dessus — Stripe te guide
              pour ton KYC entreprise + RIB. ~10 min pour un dossier complet.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono text-brand-400 shrink-0">02.</span>
            <span>
              Chaque réservation citoyenne sur tes distributeurs déclenche un paiement Stripe.
              <span className="text-white"> Tu reçois 75 %</span>, SportLocker prend 25 % de
              commission marketplace.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono text-brand-400 shrink-0">03.</span>
            <span>
              Reversement automatique <span className="text-white">en J+2</span> sur ton RIB via
              Stripe Express. Suivi temps réel des transferts dans ton dashboard.
            </span>
          </li>
        </ol>
      </section>
    </main>
  )
}

function StateHelp({ state }: { state: DisplayState }) {
  const cls = 'text-sm leading-relaxed text-white/70'
  switch (state.kind) {
    case 'server_not_configured':
      return (
        <p className={cls}>
          La clé <code className="font-mono text-[12px] text-white/90">STRIPE_SECRET_KEY</code>{' '}
          n&apos;est pas configurée côté serveur. Pose-la sur Railway → @sportlocker/api →
          Variables pour activer cette page. Sans elle, aucun reversement n&apos;est possible.
        </p>
      )
    case 'super_admin_no_commune':
      return (
        <p className={cls}>
          En tant que super-admin tu peux consulter le Stripe Connect d&apos;une commune en
          ajoutant <code className="font-mono">?communeId=…</code> à l&apos;URL. Cette UI
          dédiée arrive dans une prochaine itération — pour l&apos;instant utilise un compte
          admin scoped au tenant.
        </p>
      )
    case 'not_started':
      return (
        <p className={cls}>
          Aucun compte Stripe Connect associé à cette commune. Connecte ton compte pour
          commencer à encaisser les locations citoyennes et recevoir tes reversements
          automatiquement.
        </p>
      )
    case 'pending_verification':
      return (
        <p className={cls}>
          Ton compte est créé chez Stripe. Termine la vérification (KYC + RIB) pour activer
          les paiements et les payouts. La vérification prend généralement 24-48 h après
          soumission complète des pièces.
        </p>
      )
    case 'charges_only':
      return (
        <p className={cls}>
          Les paiements entrants sont actifs, mais Stripe a temporairement bloqué les payouts
          vers ton RIB (souvent une vérification AML supplémentaire). Continue la vérification
          ou contacte le support Stripe si ça dure.
        </p>
      )
    case 'payouts_only':
      return (
        <p className={cls}>
          Tes payouts sont actifs mais les paiements entrants sont bloqués. C&apos;est rare —
          contacte le support Stripe pour comprendre.
        </p>
      )
    case 'fully_verified':
      return (
        <p className={cls}>
          Ton compte est pleinement vérifié. Les paiements citoyens sur tes distributeurs sont
          encaissés, tu reçois 75 % en J+2 sur ton RIB. Tu peux rafraîchir le statut à tout
          moment pour synchroniser avec Stripe.
        </p>
      )
  }
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
          <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />
        ) : (
          <Clock className="h-4 w-4 text-amber-400" aria-hidden />
        )}
        <span
          className={cn('text-sm font-medium', enabled ? 'text-white' : 'text-white/75')}
        >
          {label}
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-white/45">{hint}</p>
    </div>
  )
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
