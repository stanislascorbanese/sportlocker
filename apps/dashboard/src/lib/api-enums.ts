/**
 * Constantes runtime partagées entre client et server components.
 *
 * `lib/api.ts` importe `next/headers` (cookies) qui est server-only.
 * Quand un client component fait `import { ITEM_CONDITIONS } from './api'`,
 * Next.js embarque tout le module côté client → build casse avec :
 *   "You're importing a component that needs next/headers. That only works
 *   in a Server Component which is not supported in the pages/ directory."
 *
 * Solution : isoler ici les enums/const réutilisés runtime côté client.
 * `lib/api.ts` ré-exporte ces valeurs pour compat (cf. ligne `export *`).
 *
 * NE PAS importer `next/headers` ni rien de server-only dans ce fichier.
 */

export const ITEM_CONDITIONS = ['new', 'good', 'worn', 'damaged', 'lost'] as const
export type ItemCondition = typeof ITEM_CONDITIONS[number]
