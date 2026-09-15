'use client'

import Link from 'next/link'
import { TopBar } from '@/components/Chrome'
import { useLang } from '@/lib/i18n'

/* Composant client, contrairement à l'usage : la page 404 doit parler la langue
 * du vacancier comme les autres, et le dictionnaire vit dans un contexte React. */
export default function NotFound() {
  const { t } = useLang()

  return (
    <main className="screen">
      <TopBar />
      <div className="flex flex-1 flex-col justify-center gap-6 text-center">
        <h1 className="font-display text-display-md font-bold">{t.notFound.title}</h1>
        <p className="text-ink-muted">{t.notFound.hint}</p>
        <Link href="/" className="btn-primary">
          {t.notFound.cta}
        </Link>
      </div>
    </main>
  )
}
