import type { Lang } from '../lang'

type SuperAdminKey =
  | 'eyebrow' | 'pageTitle' | 'subtitle'
  | 'commune1' | 'communeMany' | 'admin1' | 'adminMany'
  | 'distributor1' | 'distributorMany'
  | 'noCommunes'
  // Invite form
  | 'inviteTitle' | 'inviteSubtitle'
  | 'fieldEmail' | 'fieldCommune' | 'selectPlaceholder'
  | 'btnGenerate' | 'btnSending'
  | 'successPrefix' | 'successInfix' | 'successSuffix'
  | 'btnCopy' | 'btnCopied'
  | 'bannedBadge'

const STRINGS: Record<Lang, Record<SuperAdminKey, string>> = {
  fr: {
    eyebrow:           'Super-admin',
    pageTitle:         'Tenants & admins',
    subtitle:          "Vue globale des communes et de leurs administrateurs. Inviter un nouvel admin envoie un lien d'activation à coller dans un mail.",
    commune1:          'commune',
    communeMany:       'communes',
    admin1:            'admin',
    adminMany:         'admins',
    distributor1:      'distributeur',
    distributorMany:   'distributeurs',
    noCommunes:        'Aucune commune enregistrée.',
    inviteTitle:       'Inviter un admin de commune',
    inviteSubtitle:    "L'admin recevra l'URL d'invitation à coller dans un mail. Le lien expire après 7 jours.",
    fieldEmail:        'Email',
    fieldCommune:      'Commune',
    selectPlaceholder: '— sélectionner —',
    btnGenerate:       "Générer l’invitation",
    btnSending:        'Envoi…',
    successPrefix:     'Invitation pour',
    successInfix:      'générée. Copiez l’URL ci-dessous et envoyez-la par mail à la mairie.',
    successSuffix:     '',
    btnCopy:           'Copier',
    btnCopied:         'Copié ✓',
    bannedBadge:       'banni',
  },
  en: {
    eyebrow:           'Super-admin',
    pageTitle:         'Tenants & admins',
    subtitle:          'Global view of communes and their admins. Inviting a new admin generates an activation link to send by email.',
    commune1:          'commune',
    communeMany:       'communes',
    admin1:            'admin',
    adminMany:         'admins',
    distributor1:      'distributor',
    distributorMany:   'distributors',
    noCommunes:        'No commune registered.',
    inviteTitle:       'Invite a commune admin',
    inviteSubtitle:    'The admin will receive an invitation URL to send by email. The link expires after 7 days.',
    fieldEmail:        'Email',
    fieldCommune:      'Commune',
    selectPlaceholder: '— select —',
    btnGenerate:       'Generate invitation',
    btnSending:        'Sending…',
    successPrefix:     'Invitation for',
    successInfix:      'generated. Copy the URL below and send it by email to the town hall.',
    successSuffix:     '',
    btnCopy:           'Copy',
    btnCopied:         'Copied ✓',
    bannedBadge:       'banned',
  },
}

export function superAdminStrings(lang: Lang): Record<SuperAdminKey, string> {
  return STRINGS[lang]
}
