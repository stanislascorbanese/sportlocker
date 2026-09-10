'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

/**
 * Dernier filet.
 *
 * `error.tsx` rattrape les erreurs d'une route ; celui-ci rattrape celles qui
 * cassent la mise en page elle-même, y compris pendant le rendu React. Il
 * remplace tout le document, d'où les balises `html` et `body` — et donc une
 * page volontairement dépouillée, sans dépendre d'aucun style qui pourrait
 * justement être la cause du problème.
 *
 * Le message parle à un vacancier, pas à un développeur : la borne est
 * physiquement devant lui, et l'accueil est la vraie porte de sortie.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: '2rem',
          background: '#F6F8F7',
          color: '#0F1A16',
          font: '17px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: '22rem' }}>
          <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.75rem' }}>L’application a planté</h1>
          <p style={{ margin: '0 0 1.75rem', color: '#5B6B64' }}>
            Rechargez la page. Si le casier ne s’ouvre toujours pas, passez à
            l’accueil&nbsp;: ils peuvent l’ouvrir pour vous.
          </p>
          <a
            href="/"
            style={{
              display: 'inline-block',
              minHeight: '3.5rem',
              lineHeight: '3.5rem',
              padding: '0 2rem',
              borderRadius: '1rem',
              background: '#157A5B',
              color: '#fff',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Recharger
          </a>
        </div>
      </body>
    </html>
  )
}
