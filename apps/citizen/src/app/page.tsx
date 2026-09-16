'use client'

import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { TopBar, Note } from '@/components/Chrome'
import { useLang } from '@/lib/i18n'
import { getLoanId } from '@/lib/session'

/**
 * Écran de secours.
 *
 * Le chemin normal est le QR code de la borne, qui mène directement à
 * /b/<serial>. On n'arrive ici que si le QR est illisible ou décollé — d'où le
 * champ de saisie du code, imprimé en gros sous le QR sur chaque borne.
 */
export default function Home() {
  const router = useRouter()
  const { t } = useLang()
  const [code, setCode] = useState('')
  const [loanId, setLoanId] = useState<string | null>(null)

  useEffect(() => {
    setLoanId(getLoanId())
  }, [])

  return (
    <main className="screen">
      <TopBar />

      <div className="flex flex-1 flex-col justify-center gap-8">
        <div>
          <h1 className="font-display text-display-md font-bold leading-tight">
            {t.home.title}
            <br />
            {t.home.titleAccent}
          </h1>
          <p className="mt-3 text-ink-muted">{t.home.hint}</p>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            const clean = code.trim().toUpperCase()
            // `typedRoutes` ne sait pas typer une route construite à l'exécution :
            // le segment dynamique est validé côté serveur, pas ici.
            if (clean) router.push(`/b/${encodeURIComponent(clean)}` as Route)
          }}
          className="flex flex-col gap-4"
        >
          <div>
            <label htmlFor="serial" className="label">
              {t.home.fieldLabel}
            </label>
            <input
              id="serial"
              name="serial"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="field font-semibold uppercase tracking-widest"
              placeholder="SL-001"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
            />
          </div>
          <button type="submit" className="btn-primary" disabled={!code.trim()}>
            {t.home.submit}
          </button>
        </form>

        {/* Deuxième porte d'entrée : pour qui n'a ni QR ni code sous les yeux. */}
        <a href="/carte" className="text-center font-semibold text-brand underline">
          {t.carte.title}
        </a>

        {loanId ? (
          <Note>
            {t.home.hasLoan}{' '}
            <a href="/emprunt" className="font-bold text-brand underline">
              {t.home.hasLoanLink}
            </a>
          </Note>
        ) : null}
      </div>
    </main>
  )
}
