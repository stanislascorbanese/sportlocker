'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Note, Spinner, TopBar } from '@/components/Chrome'
import { ItemGlyph } from '@/components/ItemGlyph'
import { LockerReveal } from '@/components/LockerReveal'
import { api } from '@/lib/api'
import { type Loan } from '@/lib/contract'
import { useLang } from '@/lib/i18n'
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
  const { t, itemLabel, errorText } = useLang()

  const [step, setStep] = useState<Step>('loading')
  const [loan, setLoan] = useState<Loan | null>(null)
  const [dropLocker, setDropLocker] = useState<number | null>(null)
  const [failure, setFailure] = useState<unknown>(null)

  const error = failure === null ? '' : errorText(failure)

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
    setFailure(null)
    try {
      const result = await api.returnLoan(loan.id)
      setDropLocker(result.lockerNumber)
      forgetLoan()
      setStep('returned')
    } catch (err) {
      setFailure(err)
      setStep('active')
    }
  }, [loan])

  if (step === 'loading') {
    return (
      <main className="screen">
        <TopBar />
        <Spinner label={t.loan.loading} />
      </main>
    )
  }

  if (step === 'none') {
    return (
      <main className="screen">
        <TopBar />
        <div className="flex flex-1 flex-col justify-center gap-6 text-center">
          <h1 className="font-display text-display-md font-bold">{t.loan.noneTitle}</h1>
          <p className="text-ink-muted">{t.loan.noneHint}</p>
          <Link href="/" className="btn-secondary">
            {t.loan.noneCta}
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
          <LockerReveal lockerNumber={dropLocker} title={t.loan.returnedTitle} />
          <p className="text-center text-ink-muted">{t.loan.returnedHint}</p>
          <Link href="/" className="btn-secondary">
            {t.loan.done}
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
                {t.loan.borrowedEyebrow}
              </p>
              <p className="truncate text-[1.125rem] font-bold">
                {itemLabel(loan.kind, loan.itemLabel)}
              </p>
              <p className="text-meta text-ink-muted">
                {t.loan.where(loan.serial, loan.lockerNumber)}
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
          {step === 'returning' ? t.loan.giveBackBusy : t.loan.giveBack}
        </button>

        <Note>{t.loan.beforePress}</Note>
      </div>
    </main>
  )
}
