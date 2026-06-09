import Link from 'next/link'

import { getLang } from '../../../../lib/lang-server'
import { commonStrings } from '../../../../lib/i18n/common'
import { itemsStrings } from '../../../../lib/i18n/items'
import { makeMetadata } from '../../../../lib/i18n/metadata'
import { ItemTypeForm } from '../../ItemTypeForm'

export const generateMetadata = makeMetadata((lang) => itemsStrings(lang).metaTitleNewType)

export default async function NewItemTypePage() {
  const lang = await getLang()
  const t = itemsStrings(lang)
  const c = commonStrings(lang)
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-3xl">{t.btnNewType.replace('+ ', '')}</h2>
          <p className="mt-1 text-sm text-white/55">{t.subtitleNewType}</p>
        </div>
        <Link href="/items?tab=types" className="text-sm text-white/60 transition hover:text-white">
          ← {c.back}
        </Link>
      </header>

      <div className="rounded-xl border border-white/10 bg-navy-800 p-6">
        <ItemTypeForm mode="create" lang={lang} />
      </div>
    </div>
  )
}
