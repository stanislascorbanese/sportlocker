'use client'

import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { TopBar, Note } from '@/components/Chrome'
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
            Quel est le code
            <br />
            de la borne&nbsp;?
          </h1>
          <p className="mt-3 text-ink-muted">
            Il est imprimé sous le QR code, en haut de la borne. Il ressemble à SL-001.
          </p>
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
              Code de la borne
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
            Continuer
          </button>
        </form>

        {loanId ? (
          <Note>
            Vous avez un article emprunté.{' '}
            <a href="/emprunt" className="font-bold text-brand underline">
              Le rendre
            </a>
          </Note>
        ) : null}
      </div>
    </main>
  )
}
