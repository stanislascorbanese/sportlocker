'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, RotateCcw } from 'lucide-react'
import { Note, Spinner, TopBar } from '@/components/Chrome'
import { ItemGlyph } from '@/components/ItemGlyph'
import { LockerReveal } from '@/components/LockerReveal'
import { api } from '@/lib/api'
import { ApiError, type AvailableItem, type Kiosk, type Loan } from '@/lib/contract'
import { getStay, saveLoanId, saveStay } from '@/lib/session'
import { cn } from '@/lib/cn'

/**
 * Le parcours entier, en une page et quatre étapes.
 *
 * Un seul écran à la fois, une seule action possible sur chacun : le vacancier
 * est debout devant une borne, souvent avec un enfant qui tire sur son bras.
 * Tout ce qui ressemble à un menu, un onglet ou un réglage a été écarté.
 */

type Step = 'loading' | 'identify' | 'choose' | 'opening' | 'opened' | 'blocked' | 'dead'

export function BorneFlow({ serial }: { serial: string }) {
  const [step, setStep] = useState<Step>('loading')
  const [kiosk, setKiosk] = useState<Kiosk | null>(null)
  const [stayId, setStayId] = useState<string | null>(null)
  const [guestName, setGuestName] = useState('')
  const [loan, setLoan] = useState<Loan | null>(null)
  const [error, setError] = useState('')

  const [stayRef, setStayRef] = useState('')
  const [lastName, setLastName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .getKiosk(serial)
      .then((data) => {
        if (cancelled) return
        setKiosk(data)
        // On repropose ce qu'il a saisi la dernière fois sur cette même borne :
        // en camping, on revient chercher un ballon plusieurs fois par semaine.
        const remembered = getStay()
        if (remembered?.serial === serial) {
          setStayRef(remembered.stayRef)
          setLastName(remembered.lastName)
        }
        setStep('identify')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : "Cette borne n'a pas répondu.")
        setStep('dead')
      })
    return () => {
      cancelled = true
    }
  }, [serial])

  const identify = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      setBusy(true)
      setError('')
      try {
        const identity = await api.identify(serial, stayRef.trim(), lastName.trim())
        setStayId(identity.stayId)
        setGuestName(identity.guestName)
        saveStay({ stayRef: stayRef.trim(), lastName: lastName.trim(), serial })

        if (identity.activeLoan) {
          setLoan(identity.activeLoan)
          saveLoanId(identity.activeLoan.id)
          setStep('blocked')
        } else {
          setStep('choose')
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Réessayez.')
      } finally {
        setBusy(false)
      }
    },
    [serial, stayRef, lastName],
  )

  const borrow = useCallback(
    async (item: AvailableItem) => {
      if (!stayId) return
      setStep('opening')
      setError('')
      try {
        const created = await api.borrow(serial, stayId, item.itemTypeId)
        setLoan(created)
        saveLoanId(created.id)
        setStep('opened')
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Réessayez.')
        setStep('choose')
      }
    },
    [serial, stayId],
  )

  if (step === 'loading') {
    return (
      <main className="screen">
        <TopBar />
        <Spinner label="Connexion à la borne…" />
      </main>
    )
  }

  if (step === 'dead') {
    return (
      <main className="screen">
        <TopBar />
        <div className="flex flex-1 flex-col justify-center gap-6">
          <h1 className="font-display text-display-md font-bold">Borne injoignable</h1>
          <Note tone="error">{error}</Note>
          <button type="button" onClick={() => location.reload()} className="btn-secondary">
            <RotateCcw size={18} aria-hidden /> Réessayer
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="screen">
      <TopBar siteName={kiosk?.siteName} />

      {step === 'identify' ? (
        <div className="flex flex-1 flex-col justify-center gap-8">
          <div>
            <h1 className="font-display text-display-md font-bold leading-tight">
              Bonjour&nbsp;! Vous séjournez ici&nbsp;?
            </h1>
            <p className="mt-3 text-ink-muted">
              Votre numéro d’emplacement et votre nom suffisent. Aucun compte, aucune carte
              bancaire.
            </p>
          </div>

          <form onSubmit={identify} className="flex flex-col gap-5">
            <div>
              <label htmlFor="stayRef" className="label">
                Numéro d’emplacement
              </label>
              <input
                id="stayRef"
                value={stayRef}
                onChange={(event) => setStayRef(event.target.value)}
                className="field"
                inputMode="numeric"
                autoComplete="off"
                placeholder="214"
                enterKeyHint="next"
                required
              />
            </div>

            <div>
              <label htmlFor="lastName" className="label">
                Nom de famille
              </label>
              <input
                id="lastName"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                className="field"
                autoComplete="family-name"
                autoCapitalize="words"
                placeholder="Martin"
                enterKeyHint="go"
                required
              />
            </div>

            {error ? <Note tone="error">{error}</Note> : null}

            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Vérification…' : 'Continuer'}
              {busy ? null : <ArrowRight size={20} aria-hidden />}
            </button>

            <p className="text-center text-meta text-ink-muted">
              Ces informations servent uniquement à savoir à qui prêter le matériel. Elles
              restent chez le camping.
            </p>
          </form>
        </div>
      ) : null}

      {step === 'choose' && kiosk ? (
        <div className="flex flex-1 flex-col gap-6">
          <div>
            <h1 className="font-display text-display-md font-bold leading-tight">
              Qu’est-ce qui vous ferait plaisir&nbsp;?
            </h1>
            {guestName ? (
              <p className="mt-2 text-ink-muted">Bonjour {guestName}.</p>
            ) : null}
          </div>

          {error ? <Note tone="error">{error}</Note> : null}

          <ul className="grid grid-cols-2 gap-3">
            {kiosk.items.map((item) => {
              const out = item.available <= 0
              return (
                <li key={item.itemTypeId}>
                  <button
                    type="button"
                    disabled={out}
                    onClick={() => void borrow(item)}
                    className={cn(
                      'flex h-full w-full flex-col items-center gap-3 rounded-card border-2 p-4 text-center transition-colors duration-base',
                      out
                        ? 'cursor-not-allowed border-line bg-surface-2 text-ink-muted opacity-60'
                        : 'border-line bg-surface text-ink hover:border-brand hover:bg-brand-soft',
                    )}
                  >
                    <ItemGlyph kind={item.kind} className="h-12 w-12 text-brand" />
                    <span className="text-[0.9375rem] font-bold leading-snug">{item.label}</span>
                    <span className="text-meta text-ink-muted">
                      {out ? 'Tout est sorti' : `${item.available} disponible${item.available > 1 ? 's' : ''}`}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          <p className="mt-auto pt-4 text-center text-meta text-ink-muted">
            Un article à la fois. Rapportez-le quand vous avez fini, un autre vacancier
            l’attend peut-être.
          </p>
        </div>
      ) : null}

      {step === 'opening' ? (
        <div className="flex flex-1 flex-col justify-center">
          <Spinner label="Ouverture du casier…" />
        </div>
      ) : null}

      {step === 'opened' && loan ? (
        <div className="flex flex-1 flex-col justify-center gap-7">
          <LockerReveal
            lockerNumber={loan.lockerNumber}
            title="C’est ouvert"
            itemLabel={loan.itemLabel}
            kind={loan.kind}
          />
          <p className="text-center text-ink-muted">
            Prenez le matériel et refermez la porte. Bon match&nbsp;!
          </p>
          <Link href="/emprunt" className="btn-secondary">
            J’ai pris, voir mon emprunt
          </Link>
        </div>
      ) : null}

      {step === 'blocked' && loan ? (
        <div className="flex flex-1 flex-col justify-center gap-7">
          <div>
            <h1 className="font-display text-display-md font-bold leading-tight">
              Vous avez déjà&nbsp;: {loan.itemLabel}
            </h1>
            <p className="mt-3 text-ink-muted">
              Un article à la fois. Rendez celui-ci pour en prendre un autre.
            </p>
          </div>
          <Link href="/emprunt" className="btn-primary">
            Rendre l’article
          </Link>
        </div>
      ) : null}
    </main>
  )
}
