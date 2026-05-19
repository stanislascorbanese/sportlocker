/**
 * Préférence de langue de l'utilisateur — stockée dans un cookie pour que
 * `<html lang>` soit calculable côté serveur (pas de flash de langue).
 *
 * Aujourd'hui seul le composant carte est traduit ; le reste du dashboard
 * reste en français. La structure est en place pour étendre la traduction
 * page par page.
 */

import { cookies } from 'next/headers'

export const LANG_COOKIE = 'sportlocker-lang'

export const SUPPORTED_LANGS = ['fr', 'en'] as const
export type Lang = (typeof SUPPORTED_LANGS)[number]

export const DEFAULT_LANG: Lang = 'fr'

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (SUPPORTED_LANGS as readonly string[]).includes(v)
}

/** Lit la préférence de langue depuis le cookie httpOnly: false. */
export async function getLang(): Promise<Lang> {
  const jar = await cookies()
  const raw = jar.get(LANG_COOKIE)?.value
  return isLang(raw) ? raw : DEFAULT_LANG
}

export const LANG_LABELS: Record<Lang, { native: string; flag: string }> = {
  fr: { native: 'Français', flag: '🇫🇷' },
  en: { native: 'English',  flag: '🇬🇧' },
}
