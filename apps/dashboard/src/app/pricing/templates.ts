/**
 * Templates tarifaires pré-configurés (cf. docs/CDC.md §4.3, "Templates par
 * défaut"). Le tenant pick un template au setup, puis customise au besoin.
 *
 * Le matching template ↔ item_type se fait par `categoryHint` (substring
 * insensible à la casse sur `item_types.category` ou `name`). Si aucun
 * item_type ne matche, le template applique simplement zéro règle (le
 * tenant peut ajouter manuellement plus tard).
 */

import type { SlotDurationMinutes } from '../../lib/api'

export type PricingTemplate = {
  id: 'communal-leger' | 'saisonnier-plage' | 'hotel-premium'
  label: string
  description: string
  /**
   * Pour chaque ligne, la grille des prix (cents) par durée. Les durées
   * absentes (ex. 90 désactivée pour "saisonnier plage") signifient "ne
   * pas créer cette règle" → le slot n'est pas proposé.
   */
  rows: Array<{
    categoryHint: string  // substring case-insensitive (matché contre name + category + slug)
    label: string         // libellé affiché à l'admin pendant la preview
    prices: Partial<Record<SlotDurationMinutes, number>>
  }>
}

export const PRICING_TEMPLATES: PricingTemplate[] = [
  {
    id: 'communal-leger',
    label: 'Communal léger',
    description: 'Mairies équipement grand public : ballons, raquettes de ping-pong, frisbees.',
    rows: [
      { categoryHint: 'ballon',   label: 'Ballons',           prices: { 30: 50,  60: 100, 90: 150, 120: 200 } },
      { categoryHint: 'raquette', label: 'Raquettes (loisir)', prices: { 30: 50,  60: 100, 90: 150, 120: 200 } },
      { categoryHint: 'frisbee',  label: 'Frisbees / disques', prices: { 30: 50,  60: 100, 90: 150, 120: 200 } },
    ],
  },
  {
    id: 'saisonnier-plage',
    label: 'Saisonnier camping / plage',
    description: 'Ballons (beach-volley), raquettes plage, beach-tennis, snorkel, frisbees. Slot 1h30 désactivé.',
    rows: [
      { categoryHint: 'ballon',   label: 'Ballons (beach-volley, foot plage)', prices: { 30: 100, 60: 200, 120: 500 } },
      { categoryHint: 'plage',    label: 'Équipement plage', prices: { 30: 100, 60: 200, 120: 500 } },
      { categoryHint: 'raquette', label: 'Raquettes plage',  prices: { 30: 100, 60: 200, 120: 500 } },
      { categoryHint: 'snorkel',  label: 'Snorkel / masque', prices: { 30: 100, 60: 200, 120: 500 } },
      { categoryHint: 'frisbee',  label: 'Frisbees',         prices: { 30: 100, 60: 200, 120: 500 } },
    ],
  },
  {
    id: 'hotel-premium',
    label: 'Hôtel premium',
    description: 'Raquettes tennis pro (Wilson), ballons, équipement pool, accessoires fitness haut de gamme.',
    rows: [
      { categoryHint: 'tennis',  label: 'Raquettes tennis pro', prices: { 30: 200, 60: 400, 90: 550, 120: 700 } },
      { categoryHint: 'ballon',  label: 'Ballons (piscine, multi-usage)', prices: { 30: 200, 60: 400, 90: 550, 120: 700 } },
      { categoryHint: 'pool',    label: 'Équipement piscine',   prices: { 30: 200, 60: 400, 90: 550, 120: 700 } },
      { categoryHint: 'fitness', label: 'Accessoires fitness',  prices: { 30: 200, 60: 400, 90: 550, 120: 700 } },
    ],
  },
]
