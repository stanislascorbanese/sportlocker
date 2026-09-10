'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect, useState } from 'react'

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
 *
 * Les traductions sont recopiées ici plutôt qu'importées de `@/lib/i18n`, et
 * c'est délibéré : cet écran doit s'afficher même quand c'est un module qui a
 * cassé. Un import de plus, c'est une raison de plus pour que le filet tombe en
 * même temps que ce qu'il rattrape. Quatre phrases dupliquées est un prix
 * acceptable pour ça.
 */

const COPY = {
  fr: {
    title: 'L’application a planté',
    hint: 'Rechargez la page. Si le casier ne s’ouvre toujours pas, passez à l’accueil : ils peuvent l’ouvrir pour vous.',
    cta: 'Recharger',
  },
  en: {
    title: 'The app crashed',
    hint: 'Reload the page. If the locker still will not open, ask at reception — they can open it for you.',
    cta: 'Reload',
  },
  nl: {
    title: 'De app is vastgelopen',
    hint: 'Herlaad de pagina. Gaat het kluisje nog steeds niet open, ga dan naar de receptie — zij kunnen het voor u openen.',
    cta: 'Herladen',
  },
  de: {
    title: 'Die App ist abgestürzt',
    hint: 'Laden Sie die Seite neu. Öffnet sich das Fach weiterhin nicht, wenden Sie sich an die Rezeption — sie kann es für Sie öffnen.',
    cta: 'Neu laden',
  },
} as const

type Lang = keyof typeof COPY

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  // `lang` a été posé sur <html> par le script d'amorçage, bien avant que quoi
  // que ce soit puisse planter. C'est la seule trace de la langue qui survive à
  // la disparition de l'arbre React.
  const [lang, setLang] = useState<Lang>('fr')

  useEffect(() => {
    const found = document.documentElement.lang
    if (found in COPY) setLang(found as Lang)
  }, [])

  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  const t = COPY[lang]

  return (
    <html lang={lang}>
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
          <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.75rem' }}>{t.title}</h1>
          <p style={{ margin: '0 0 1.75rem', color: '#5B6B64' }}>{t.hint}</p>
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
            {t.cta}
          </a>
        </div>
      </body>
    </html>
  )
}
