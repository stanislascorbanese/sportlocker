import type { Lang } from '../lang'

/**
 * Dictionnaire de la page « Aujourd'hui » — l'écran d'ouverture du dashboard.
 *
 * C'est la première chose que voit le gérant du camping en arrivant le matin.
 * Elle ne pose qu'une question : est-ce qu'il y a quelque chose à faire ?
 * Quand la réponse est non, la page doit le dire en une ligne et s'arrêter là.
 *
 * D'où deux règles de rédaction : les états sont écrits en toutes lettres et
 * jamais portés par la seule couleur, et rien n'est formulé en vocabulaire
 * système (« réservation active » devient « emprunt en cours »).
 */

type Key =
  | 'title' | 'eyebrow'
  | 'todoTitle'
  | 'nothingTitle' | 'nothingHint'
  | 'refillLabel' | 'refillOne' | 'refillMany' | 'refillCta'
  | 'unreturnedLabel' | 'unreturnedOne' | 'unreturnedMany' | 'unreturnedCta'
  | 'offlineLabel' | 'offlineOne' | 'offlineMany' | 'offlineCta'
  | 'kiosksTitle' | 'kiosksEmpty' | 'kiosksEmptyHint'
  | 'stocked' | 'lastSeen' | 'neverSeen'
  | 'statusOnline' | 'statusOffline' | 'statusMaintenance' | 'statusRemoved'
  | 'weekTitle' | 'weekHint' | 'loansToday' | 'loansOut' | 'loansWeek'
  | 'apiDown'

const STRINGS: Record<Lang, Record<Key, string>> = {
  fr: {
    title:            "Aujourd'hui",
    eyebrow:          'En arrivant le matin',

    todoTitle:        'À faire',
    nothingTitle:     'Rien à faire ce matin',
    nothingHint:      'Les bornes répondent, les casiers sont garnis, rien ne traîne dehors.',

    refillLabel:      'Casiers à regarnir',
    refillOne:        'Un casier est vide.',
    refillMany:       'casiers sont vides.',
    refillCta:        'Voir lesquels',

    unreturnedLabel:  'Pas rentré',
    unreturnedOne:    'Un article est encore dehors.',
    unreturnedMany:   'articles sont encore dehors.',
    unreturnedCta:    'Voir qui les a',

    offlineLabel:     'Borne injoignable',
    offlineOne:       'Une borne ne répond plus.',
    offlineMany:      'bornes ne répondent plus.',
    offlineCta:       'Voir les bornes',

    kiosksTitle:      'Vos bornes',
    kiosksEmpty:      'Aucune borne installée',
    kiosksEmptyHint:  'Vos bornes apparaîtront ici dès la mise en service.',

    stocked:          'casiers garnis',
    lastSeen:         'Vue',
    neverSeen:        'Jamais connectée',

    statusOnline:     'En ligne',
    statusOffline:    'Ne répond plus',
    statusMaintenance:'En maintenance',
    statusRemoved:    'Déposée',

    weekTitle:        'Cette semaine',
    weekHint:         'Emprunts des sept derniers jours',
    loansToday:       "Emprunts aujourd'hui",
    loansOut:         'Emprunts en cours',
    loansWeek:        'Emprunts sur 7 jours',

    apiDown:          'Les chiffres ci-dessous datent de la dernière connexion.',
  },
  en: {
    title:            'Today',
    eyebrow:          'When you open up',

    todoTitle:        'To do',
    nothingTitle:     'Nothing to do this morning',
    nothingHint:      'The kiosks are online, the lockers are stocked, nothing is still out.',

    refillLabel:      'Lockers to refill',
    refillOne:        'One locker is empty.',
    refillMany:       'lockers are empty.',
    refillCta:        'See which ones',

    unreturnedLabel:  'Not returned',
    unreturnedOne:    'One item is still out.',
    unreturnedMany:   'items are still out.',
    unreturnedCta:    'See who has them',

    offlineLabel:     'Kiosk unreachable',
    offlineOne:       'One kiosk is offline.',
    offlineMany:      'kiosks are offline.',
    offlineCta:       'See the kiosks',

    kiosksTitle:      'Your kiosks',
    kiosksEmpty:      'No kiosk installed',
    kiosksEmptyHint:  'Your kiosks will show up here once they go live.',

    stocked:          'lockers stocked',
    lastSeen:         'Seen',
    neverSeen:        'Never connected',

    statusOnline:     'Online',
    statusOffline:    'Offline',
    statusMaintenance:'Under maintenance',
    statusRemoved:    'Removed',

    weekTitle:        'This week',
    weekHint:         'Loans over the last seven days',
    loansToday:       'Loans today',
    loansOut:         'Loans out now',
    loansWeek:        'Loans over 7 days',

    apiDown:          'The figures below date from the last connection.',
  },
}

export const todayStrings = (lang: Lang) => STRINGS[lang]
