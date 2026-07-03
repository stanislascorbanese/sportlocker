import type { Lang } from '../lang'
import type { InviteStatus } from '../api'

type InvitesKey =
  | 'pageTitle' | 'metaTitle' | 'subtitle'
  | 'linkLabel' | 'backToUsers'
  // Formulaire
  | 'formTitle' | 'emailLabel' | 'emailPlaceholder'
  | 'communeLabel' | 'communePlaceholder' | 'communeHintAdmin'
  | 'roleLabel' | 'roleAdmin' | 'roleHint'
  | 'submit' | 'submitting'
  | 'createdTitle' | 'createdHint' | 'copyLink' | 'copied' | 'dismiss'
  // Tableau
  | 'listTitle' | 'colEmail' | 'colCommune' | 'colStatus' | 'colSent' | 'colExpires' | 'colActions'
  | 'emptyInvites'
  | 'statusPending' | 'statusAccepted' | 'statusExpired'
  | 'resend' | 'revoke' | 'resendConfirm' | 'revokeConfirm' | 'resentTitle'
  | 'demoBlocker' | 'actionError'

const STRINGS: Record<Lang, Record<InvitesKey, string>> = {
  fr: {
    pageTitle:        'Invitations',
    metaTitle:        'Invitations · SportLocker ops',
    subtitle:         'Invitez de nouveaux administrateurs et suivez le statut de leurs invitations.',
    linkLabel:        'Inviter un membre',
    backToUsers:      '← Utilisateurs',
    formTitle:        'Nouvelle invitation',
    emailLabel:       'Email du destinataire',
    emailPlaceholder: 'nom@commune.fr',
    communeLabel:     'Commune',
    communePlaceholder: 'Choisir une commune…',
    communeHintAdmin: 'L\'invité administrera votre commune.',
    roleLabel:        'Rôle',
    roleAdmin:        'Administrateur',
    roleHint:         'Les invitations créent des administrateurs de commune.',
    submit:           'Envoyer l\'invitation',
    submitting:       'Création…',
    createdTitle:     'Invitation créée',
    createdHint:      'Copiez ce lien et envoyez-le au destinataire — il n\'est plus affiché ensuite.',
    copyLink:         'Copier le lien',
    copied:           'Copié !',
    dismiss:          'Fermer',
    listTitle:        'Invitations envoyées',
    colEmail:         'Email',
    colCommune:       'Commune',
    colStatus:        'Statut',
    colSent:          'Envoyée le',
    colExpires:       'Expire le',
    colActions:       'Actions',
    emptyInvites:     'Aucune invitation pour le moment.',
    statusPending:    'En attente',
    statusAccepted:   'Acceptée',
    statusExpired:    'Expirée',
    resend:           'Renvoyer',
    revoke:           'Révoquer',
    resendConfirm:    'Régénérer un nouveau lien d\'invitation pour %s ? L\'ancien lien sera invalidé.',
    revokeConfirm:    'Révoquer l\'invitation de %s ? Le lien deviendra inutilisable.',
    resentTitle:      'Nouveau lien généré',
    demoBlocker:      'Mode démo — branchez un token admin valide pour gérer les invitations.',
    actionError:      'Action impossible.',
  },
  en: {
    pageTitle:        'Invitations',
    metaTitle:        'Invitations · SportLocker ops',
    subtitle:         'Invite new administrators and track the status of their invitations.',
    linkLabel:        'Invite a member',
    backToUsers:      '← Users',
    formTitle:        'New invitation',
    emailLabel:       'Recipient email',
    emailPlaceholder: 'name@town.gov',
    communeLabel:     'Commune',
    communePlaceholder: 'Choose a commune…',
    communeHintAdmin: 'The invitee will administer your commune.',
    roleLabel:        'Role',
    roleAdmin:        'Administrator',
    roleHint:         'Invitations create commune administrators.',
    submit:           'Send invitation',
    submitting:       'Creating…',
    createdTitle:     'Invitation created',
    createdHint:      'Copy this link and send it to the recipient — it won\'t be shown again.',
    copyLink:         'Copy link',
    copied:           'Copied!',
    dismiss:          'Dismiss',
    listTitle:        'Sent invitations',
    colEmail:         'Email',
    colCommune:       'Commune',
    colStatus:        'Status',
    colSent:          'Sent',
    colExpires:       'Expires',
    colActions:       'Actions',
    emptyInvites:     'No invitations yet.',
    statusPending:    'Pending',
    statusAccepted:   'Accepted',
    statusExpired:    'Expired',
    resend:           'Resend',
    revoke:           'Revoke',
    resendConfirm:    'Regenerate a new invitation link for %s? The old link will be invalidated.',
    revokeConfirm:    'Revoke the invitation for %s? The link will become unusable.',
    resentTitle:      'New link generated',
    demoBlocker:      'Demo mode — connect a valid admin token to manage invitations.',
    actionError:      'Action failed.',
  },
}

export function invitesStrings(lang: Lang): Record<InvitesKey, string> {
  return STRINGS[lang]
}

export function inviteStatusLabel(lang: Lang, status: InviteStatus): string {
  const t = STRINGS[lang]
  switch (status) {
    case 'pending':  return t.statusPending
    case 'accepted': return t.statusAccepted
    case 'expired':  return t.statusExpired
  }
}
