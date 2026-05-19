/**
 * Préférence de langue de l'utilisateur — types & constantes partagés
 * entre Server et Client Components.
 *
 * La lecture côté serveur (cookies) est dans `lang-server.ts` pour éviter
 * que next/headers ne pollue le bundle client.
 */

export const LANG_COOKIE = 'sportlocker-lang'

export const SUPPORTED_LANGS = ['fr', 'en'] as const
export type Lang = (typeof SUPPORTED_LANGS)[number]

export const DEFAULT_LANG: Lang = 'fr'

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (SUPPORTED_LANGS as readonly string[]).includes(v)
}

export const LANG_LABELS: Record<Lang, { native: string; flag: string }> = {
  fr: { native: 'Français', flag: '🇫🇷' },
  en: { native: 'English',  flag: '🇬🇧' },
}
