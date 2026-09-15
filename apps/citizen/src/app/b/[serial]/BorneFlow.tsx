'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, RotateCcw } from 'lucide-react'
import { Note, Spinner, StockPill, TopBar } from '@/components/Chrome'
import { ItemGlyph } from '@/components/ItemGlyph'
import { LockerReveal } from '@/components/LockerReveal'
import { api } from '@/lib/api'
import { type AvailableItem, type Kiosk, type Loan } from '@/lib/contract'
import { useLang } from '@/lib/i18n'
import { getStay, saveLoanId, saveStay } from '@/lib/session'
import { cn } from '@/lib/cn'

/**
 * Le parcours entier, en une page et quatre étapes.
 *
 * Un seul écran à la fois, une seule action possible sur chacun : le vacancier
 * est debout devant une borne, souvent avec un enfant qui tire sur son bras.
 * Tout ce qui ressemble à un menu, un onglet ou un réglage a été écarté.
 *
 * Les erreurs sont gardées sous forme de code, pas de phrase : le vacancier
 * peut changer de langue au milieu du parcours, et un message figé au moment du
 * throw resterait dans la langue précédente.
 */

type Step = 'loading' | 'identify' | 'choose' | 'opening' | 'opened' | 'blocked' | 'dead'

export function BorneFlow({ serial }: { serial: string }) {
  const { t, itemLabel, errorText } = useLang()

  const [step, setStep] = useState<Step>('loading')
  const [kiosk, setKiosk] = useState<Kiosk | null>(null)
  const [stayId, setStayId] = useState<string | null>(null)
  const [guestName, setGuestName] = useState('')
  const [loan, setLoan] = useState<Loan | null>(null)
  const [failure, setFailure] = useState<unknown>(null)

  const [stayRef, setStayRef] = useState('')
  const [lastName, setLastName] = useState('')
  const [busy, setBusy] = useState(false)

  const error = failure === null ? '' : errorText(failure)

  /* Relit l'état de la borne sans recharger la page. Sert à l'écran « la borne
   * est vide » : du matériel rentre au fil de la journée, et quelqu'un qui
   * attend devant préfère appuyer sur un bouton que deviner le geste de
   * rafraîchissement de son navigateur. */
  const [relisant, setRelisant] = useState(false)
  async function reload() {
    setRelisant(true)
    try {
      setKiosk(await api.getKiosk(serial))
    } catch (err) {
      setFailure(err)
    } finally {
      setRelisant(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    api
      .getKiosk(serial)
      .then((data) => {
        if (cancelled) return
        setKiosk(data)
        // On repropose ce qu'il a saisi la dernière fois sur cette même borne :
        // sur un lieu de séjour, on revient chercher un ballon plusieurs fois par semaine.
        const remembered = getStay()
        if (remembered?.serial === serial) {
          setStayRef(remembered.stayRef)
          setLastName(remembered.lastName)
        }
        setStep('identify')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setFailure(err)
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
      setFailure(null)
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
        setFailure(err)
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
      setFailure(null)
      try {
        const created = await api.borrow(serial, stayId, item.itemTypeId)
        setLoan(created)
        saveLoanId(created.id)
        setStep('opened')
      } catch (err) {
        setFailure(err)
        setStep('choose')
      }
    },
    [serial, stayId],
  )

  /* Le total en rayon, affiché sous le titre du choix : il dit d'un coup d'œil
   * si la borne vaut le déplacement, avant qu'on ait lu la moindre tuile. */
  const inStock = useMemo(
    () => (kiosk ? kiosk.items.reduce((sum, item) => sum + item.available, 0) : 0),
    [kiosk],
  )

  if (step === 'loading') {
    return (
      <main className="screen">
        <TopBar />
        <Spinner label={t.kiosk.connecting} />
      </main>
    )
  }

  if (step === 'dead') {
    return (
      <main className="screen">
        <TopBar />
        <div className="flex flex-1 flex-col justify-center gap-6">
          <h1 className="font-display text-display-md font-bold">{t.kiosk.deadTitle}</h1>
          <Note tone="error">{error || t.kiosk.deadFallback}</Note>
          <button type="button" onClick={() => location.reload()} className="btn-secondary">
            <RotateCcw size={18} aria-hidden /> {t.kiosk.retry}
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
              {t.identify.title}
            </h1>
            <p className="mt-3 text-ink-muted">{t.identify.hint}</p>
          </div>

          <form onSubmit={identify} className="flex flex-col gap-5">
            <div>
              <label htmlFor="stayRef" className="label">
                {t.identify.stayRefLabel}
              </label>
              <input
                id="stayRef"
                value={stayRef}
                onChange={(event) => setStayRef(event.target.value)}
                className="field"
                inputMode="text"
                autoComplete="off"
                aria-describedby="stayRefHelp"
                placeholder="214"
                enterKeyHint="next"
                required
              />
              <p id="stayRefHelp" className="mt-1.5 text-meta text-ink-muted">
                {t.identify.stayRefHelp}
              </p>
            </div>

            <div>
              <label htmlFor="lastName" className="label">
                {t.identify.lastNameLabel}
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
              {busy ? t.identify.submitBusy : t.identify.submit}
              {busy ? null : <ArrowRight size={20} aria-hidden />}
            </button>

            <p className="text-center text-meta text-ink-muted">{t.identify.privacy}</p>
          </form>
        </div>
      ) : null}

      {step === 'choose' && kiosk ? (
        <div className="flex flex-1 flex-col gap-6">
          {/* « Qu'est-ce qui vous ferait plaisir ? » au-dessus d'une borne vide ne
            * veut rien dire, et la pastille de stock répéterait le message de
            * l'écran juste en dessous. Un écran dédié se suffit à lui-même. */}
          {inStock > 0 ? (
            <div>
              <h1 className="font-display text-display-md font-bold leading-tight">
                {t.choose.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                {guestName ? (
                  <p className="text-ink-muted">{t.choose.greeting(guestName)}</p>
                ) : null}
                <StockPill count={inStock} label={t.choose.stock(inStock)} />
              </div>
            </div>
          ) : null}

          {error ? <Note tone="error">{error}</Note> : null}

          {/*
            * Une borne vide n'est pas une grille d'articles indisponibles.
            *
            * Afficher neuf tuiles grises donne l'impression d'une application en
            * panne : le vacancier voit du contenu éteint et ne sait pas si c'est
            * lui, son téléphone ou la borne. Un écran qui dit la vérité en une
            * phrase, et qui dit quoi faire ensuite, vaut mieux que neuf cartes
            * mortes.
            *
            * Le bouton relit la borne sans recharger la page : du matériel rentre
            * au fil de la journée, et quelqu'un qui attend devant préfère un
            * bouton à un geste de rafraîchissement.
            */}
          {inStock === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
              <ItemGlyph kind="autre" className="h-16 w-16 text-ink-muted opacity-50" />
              <div className="space-y-2">
                <h2 className="font-display text-display-sm font-bold">{t.choose.emptyTitle}</h2>
                <p className="max-w-sm text-ink-muted">{t.choose.emptyHint}</p>
              </div>
              <button
                type="button"
                className="btn-secondary"
                disabled={relisant}
                onClick={() => void reload()}
              >
                {t.choose.emptyAgain}
              </button>
            </div>
          ) : (
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
                    <span className="text-[0.9375rem] font-bold leading-snug">
                      {itemLabel(item.kind, item.label)}
                    </span>
                    <StockPill
                      count={item.available}
                      label={out ? t.choose.soldOut : t.choose.available(item.available)}
                    />
                  </button>
                </li>
              )
            })}
          </ul>
          )}

          {inStock > 0 ? (
            <p className="mt-auto pt-4 text-center text-meta text-ink-muted">{t.choose.footer}</p>
          ) : null}
        </div>
      ) : null}

      {step === 'opening' ? (
        <div className="flex flex-1 flex-col justify-center">
          <Spinner label={t.kiosk.opening} />
        </div>
      ) : null}

      {step === 'opened' && loan ? (
        <div className="flex flex-1 flex-col justify-center gap-7">
          <LockerReveal
            lockerNumber={loan.lockerNumber}
            title={t.opened.title}
            itemLabel={itemLabel(loan.kind, loan.itemLabel)}
            kind={loan.kind}
          />
          <p className="text-center text-ink-muted">{t.opened.instruction}</p>
          <Link href="/emprunt" className="btn-secondary">
            {t.opened.seeLoan}
          </Link>
        </div>
      ) : null}

      {step === 'blocked' && loan ? (
        <div className="flex flex-1 flex-col justify-center gap-7">
          <div>
            <h1 className="font-display text-display-md font-bold leading-tight">
              {t.blocked.title} {itemLabel(loan.kind, loan.itemLabel)}
            </h1>
            <p className="mt-3 text-ink-muted">{t.blocked.hint}</p>
          </div>
          <Link href="/emprunt" className="btn-primary">
            {t.blocked.cta}
          </Link>
        </div>
      ) : null}
    </main>
  )
}
