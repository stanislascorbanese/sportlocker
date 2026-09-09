'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Note, Spinner, TopBar } from '@/components/Chrome'
import { ItemGlyph } from '@/components/ItemGlyph'
import { LockerReveal } from '@/components/LockerReveal'
import { api } from '@/lib/api'
import { ApiError, type Loan } from '@/lib/contract'
import { forgetLoan, getLoanId } from '@/lib/session'

/**
 * L'emprunt en cours, et le geste pour le rendre.
 *
 * Rendre demande d'ouvrir un casier — d'où le même écran « casier N » qu'à
 * l'emprunt. C'est la seule chose que le vacancier doit retenir : un numéro,
 * une porte.
 */

type Step = 'loading' | 'active' | 'returning' | 'returned' | 'none'

export function LoanView() {
  const [step, setStep] = useState<Step>('loading')
  const [loan, setLoan] = useState<Loan | null>(null)
  const [dropLocker, setDropLocker] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const id = getLoanId()
    if (!id) {
      setStep('none')
      return
    }
    let cancelled = false
    api
      .getLoan(id)
      .then((data) => {
        if (cancelled) return
        setLoan(data)
        setStep('active')
      })
      .catch(() => {
        if (cancelled) return
        // L'emprunt a été clôturé ailleurs (par l'accueil, ou sur un autre
        // téléphone). On oublie la trace locale plutôt que d'afficher une
        // erreur que le vacancier ne peut pas résoudre.
        forgetLoan()
        setStep('none')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const giveBack = useCallback(async () => {
    if (!loan) return
    setStep('returning')
    setError('')
    try {
      const result = await api.returnLoan(loan.id)
      setDropLocker(result.lockerNumber)
      forgetLoan()
      setStep('returned')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Réessayez.')
      setStep('active')
    }
  }, [loan])

  if (step === 'loading') {
    return (
      <main className="screen">
        <TopBar />
        <Spinner label="Chargement…" />
      </main>
    )
  }

  if (step === 'none') {
    return (
      <main className="screen">
        <TopBar />
        <div className="flex flex-1 flex-col justify-center gap-6 text-center">
          <h1 className="font-display text-display-md font-bold">Aucun emprunt en cours</h1>
          <p className="text-ink-muted">
            Scannez le QR code de la borne pour prendre du matériel.
          </p>
          <Link href="/" className="btn-secondary">
            Saisir le code de la borne
          </Link>
        </div>
      </main>
    )
  }

  if (step === 'returned' && dropLocker) {
    return (
      <main className="screen">
        <TopBar />
        <div className="flex flex-1 flex-col justify-center gap-7">
          <LockerReveal lockerNumber={dropLocker} title="Déposez ici" />
          <p className="text-center text-ink-muted">
            Rangez le matériel dans le casier et refermez bien la porte. C’est tout, merci&nbsp;!
          </p>
          <Link href="/" className="btn-secondary">
            Terminé
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="screen">
      <TopBar siteName={loan?.siteName} />

      <div className="flex flex-1 flex-col justify-center gap-7">
        {loan ? (
          <div className="card flex items-center gap-4">
            <ItemGlyph kind={loan.kind} className="h-14 w-14 shrink-0 text-brand" />
            <div className="min-w-0">
              <p className="text-eyebrow font-bold uppercase tracking-[0.12em] text-ink-muted">
                Emprunté
              </p>
              <p className="truncate text-[1.125rem] font-bold">{loan.itemLabel}</p>
              <p className="text-meta text-ink-muted">
                Borne {loan.serial} · casier {loan.lockerNumber}
              </p>
            </div>
          </div>
        ) : null}

        {error ? <Note tone="error">{error}</Note> : null}

        <button
          type="button"
          onClick={() => void giveBack()}
          className="btn-primary"
          disabled={step === 'returning'}
        >
          {step === 'returning' ? 'Ouverture d’un casier…' : 'Rendre l’article'}
        </button>

        <Note>
          Rendez-vous devant la borne avant d’appuyer : un casier va s’ouvrir pour que vous y
          déposiez le matériel.
        </Note>
      </div>
    </main>
  )
}
