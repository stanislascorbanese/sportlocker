'use client'

import { TopBar } from '@/components/Chrome'
import { CarteBornes } from '@/components/CarteBornes'
import { useLang } from '@/lib/i18n'

/**
 * Deuxieme porte d'entree du parcours vacancier.
 *
 * La premiere reste le QR code de la borne, qui mene droit a /b/<serial>.
 * Celle-ci sert a qui n'a pas encore de borne sous les yeux : on montre ou
 * elles sont, combien d'articles y sont libres, et on ouvre la borne choisie.
 */
export default function PageCarte() {
  const { t } = useLang()

  return (
    <main className="screen">
      <TopBar />
      <div className="mb-4">
        <h1 className="font-display text-display-md font-bold leading-tight">{t.carte.title}</h1>
        <p className="mt-2 text-ink-muted">{t.carte.hint}</p>
      </div>
      <CarteBornes />
    </main>
  )
}
