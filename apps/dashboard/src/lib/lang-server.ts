import { cookies } from 'next/headers'

import { DEFAULT_LANG, LANG_COOKIE, isLang, type Lang } from './lang'

/**
 * Lit la préférence de langue depuis le cookie côté serveur. À n'utiliser
 * que dans des Server Components / Server Actions — sinon ça pollue le
 * bundle client et next/headers n'y est pas disponible.
 */
export async function getLang(): Promise<Lang> {
  const jar = await cookies()
  const raw = jar.get(LANG_COOKIE)?.value
  return isLang(raw) ? raw : DEFAULT_LANG
}
