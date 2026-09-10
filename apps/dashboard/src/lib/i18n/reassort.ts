import type { Lang } from '../lang'

/**
 * Dictionnaire de l'écran de réassort.
 *
 * C'est l'écran le plus utilisé de tout le dashboard, et par la personne qui
 * connaît le moins le produit : un saisonnier formé dix minutes. Les libellés
 * sont donc écrits comme on parlerait à quelqu'un derrière un comptoir, sans
 * vocabulaire métier.
 */

type Key =
  | 'title' | 'eyebrow' | 'description'
  | 'nothingToDo' | 'nothingToDoHint'
  | 'toRefill' | 'faulty' | 'inUse' | 'ready'
  | 'locker' | 'empty' | 'outWithGuest' | 'outOfOrder'
  | 'refillCount' | 'allGood' | 'lastUpdate' | 'offlineWarning'

const STRINGS: Record<Lang, Record<Key, string>> = {
  fr: {
    title:          'Réassort',
    eyebrow:        'Tous les matins',
    description:    'Les casiers vides à regarnir, borne par borne.',
    nothingToDo:    'Rien à faire',
    nothingToDoHint:'Toutes les bornes sont garnies. Repassez ce soir.',
    toRefill:       'À regarnir',
    faulty:         'En panne',
    inUse:          'Chez un client',
    ready:          'Prêt',
    locker:         'Casier',
    empty:          'Vide',
    outWithGuest:   'Emprunté',
    outOfOrder:     'Hors service',
    refillCount:    'casier(s) à regarnir',
    allGood:        'Tout est en place',
    lastUpdate:     'Vu à',
    offlineWarning: 'Cette borne ne répond plus. Ce qui est affiché date de sa dernière connexion.',
  },
  en: {
    title:          'Restocking',
    eyebrow:        'Every morning',
    description:    'Empty lockers to refill, kiosk by kiosk.',
    nothingToDo:    'Nothing to do',
    nothingToDoHint:'Every kiosk is stocked. Check again tonight.',
    toRefill:       'To refill',
    faulty:         'Faulty',
    inUse:          'With a guest',
    ready:          'Ready',
    locker:         'Locker',
    empty:          'Empty',
    outWithGuest:   'Borrowed',
    outOfOrder:     'Out of order',
    refillCount:    'locker(s) to refill',
    allGood:        'Everything is in place',
    lastUpdate:     'Last seen',
    offlineWarning: 'This kiosk is offline. What you see dates from its last connection.',
  },
}

export const reassortStrings = (lang: Lang) => STRINGS[lang]
