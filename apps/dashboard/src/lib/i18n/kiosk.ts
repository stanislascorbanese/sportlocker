import type { Lang } from '../lang'

/**
 * Dictionnaire du mode accueil.
 *
 * Public : un saisonnier de moins de trente ans, en poste pour une saison,
 * formé dix minutes, qui consulte souvent depuis son propre téléphone. Les
 * libellés sont des consignes de travail, pas des intitulés de menu.
 */

type Key =
  | 'title' | 'subtitle' | 'exit' | 'refresh' | 'updatedAt'
  | 'toRefill' | 'nothingToRefill' | 'nothingToRefillHint'
  | 'unreturned' | 'nothingUnreturned' | 'nothingUnreturnedHint'
  | 'locker' | 'kiosk' | 'outFor' | 'hours' | 'days'
  | 'operatorTip' | 'offline'

const STRINGS: Record<Lang, Record<Key, string>> = {
  fr: {
    title:                  'Accueil',
    subtitle:               'Ce qu’il y a à faire maintenant',
    exit:                   'Quitter',
    refresh:                'Actualiser',
    updatedAt:              'Mis à jour à',
    toRefill:               'À regarnir',
    nothingToRefill:        'Rien à regarnir',
    nothingToRefillHint:    'Toutes les bornes sont pleines.',
    unreturned:             'Pas encore rendu',
    nothingUnreturned:      'Tout est rentré',
    nothingUnreturnedHint:  'Aucun article n’est dehors depuis trop longtemps.',
    locker:                 'Casier',
    kiosk:                  'Borne',
    outFor:                 'depuis',
    hours:                  'h',
    days:                   'j',
    operatorTip:
      'Cet écran peut rester ouvert toute la saison. Pour que votre équipe n’ait pas votre mot de passe, créez-lui un compte « opérateur » depuis Réglages → Utilisateurs.',
    offline:                'Borne injoignable — les données datent de sa dernière connexion.',
  },
  en: {
    title:                  'Front desk',
    subtitle:               'What needs doing right now',
    exit:                   'Exit',
    refresh:                'Refresh',
    updatedAt:              'Updated at',
    toRefill:               'To refill',
    nothingToRefill:        'Nothing to refill',
    nothingToRefillHint:    'Every kiosk is full.',
    unreturned:             'Not returned yet',
    nothingUnreturned:      'Everything is back',
    nothingUnreturnedHint:  'No item has been out for too long.',
    locker:                 'Locker',
    kiosk:                  'Kiosk',
    outFor:                 'for',
    hours:                  'h',
    days:                   'd',
    operatorTip:
      'This screen can stay open all season. So your team never needs your password, create them an “operator” account under Settings → Users.',
    offline:                'Kiosk offline — data dates from its last connection.',
  },
}

export const kioskStrings = (lang: Lang) => STRINGS[lang]
