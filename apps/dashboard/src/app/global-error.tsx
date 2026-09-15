'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

/**
 * Dernier filet : les erreurs qui cassent la mise en page elle-même, y compris
 * pendant le rendu React. Il remplace tout le document, d'où les balises `html`
 * et `body`, et n'utilise aucune classe utilitaire — le style pourrait
 * précisément être la cause du problème.
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
          background: '#0D1B2A',
          color: '#fff',
          font: '16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: '24rem' }}>
          <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.75rem' }}>Le tableau de bord a planté</h1>
          <p style={{ margin: '0 0 1.75rem', color: 'rgba(255,255,255,.6)' }}>
            L’incident nous a été remonté. Rechargez la page — vos bornes, elles, continuent de
            fonctionner : elles n’ont pas besoin de cet écran pour ouvrir un casier.
          </p>
          <a
            href="/"
            style={{
              display: 'inline-block',
              padding: '0.9rem 2rem',
              borderRadius: '0.6rem',
              background: '#1D9E75',
              color: '#fff',
              fontWeight: 600,
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
