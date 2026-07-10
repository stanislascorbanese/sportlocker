import type { MessageKey } from './i18n/messages'

type Locale = 'fr' | 'en'
type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string

/** Formate un montant en centimes vers une chaîne EUR localisée (ex. « 3,00 € »). */
export function fmtEuro(cents: number, locale: Locale): string {
  return (cents / 100).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    style: 'currency',
    currency: 'EUR',
  })
}

/**
 * Durée lisible : « 1 j », « 1 h 30 min », « 45 min ». Les minutes sont masquées
 * dès qu'on affiche des jours (concision). `reservation.returned.unit_days` est
 * une clé compacte plurielle-safe (« {count} j » / « {count} d »).
 */
export function formatDuration(minutes: number, t: Translate): string {
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  const parts: string[] = []
  if (days > 0) parts.push(t('reservation.returned.unit_days', { count: days }))
  if (hours > 0) parts.push(`${hours} h`)
  if (mins > 0 && days === 0) parts.push(`${mins} min`)
  return parts.join(' ') || `${minutes} min`
}
