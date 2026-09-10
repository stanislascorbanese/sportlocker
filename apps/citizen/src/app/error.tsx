'use client'

import { TopBar } from '@/components/Chrome'
import { useLang } from '@/lib/i18n'

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  const { t } = useLang()

  return (
    <main className="screen">
      <TopBar />
      <div className="flex flex-1 flex-col justify-center gap-6 text-center">
        <h1 className="font-display text-display-md font-bold">{t.crash.title}</h1>
        <p className="text-ink-muted">{t.crash.hint}</p>
        <button type="button" onClick={reset} className="btn-primary">
          {t.crash.cta}
        </button>
      </div>
    </main>
  )
}
