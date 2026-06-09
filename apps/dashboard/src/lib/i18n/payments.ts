import type { Lang } from '../lang'
import type { PaymentStatus } from '../api'

type PaymentsKey =
  | 'eyebrow' | 'pageTitle'
  | 'metaTitle' | 'metaTitleRefresh' | 'metaTitleReturn'
  // States badges
  | 'badgeServerNotConfigured' | 'badgeSuperAdminNoCommune'
  | 'badgeNotStarted' | 'badgePendingVerification'
  | 'badgeChargesOnly' | 'badgePayoutsOnly' | 'badgeFullyVerified'
  // Help text
  | 'helpServerNotConfigured' | 'helpSuperAdminNoCommune'
  | 'helpNotStarted' | 'helpPendingVerification'
  | 'helpChargesOnly' | 'helpPayoutsOnly' | 'helpFullyVerified'
  // Flags
  | 'flagCharges' | 'flagChargesHint'
  | 'flagPayouts' | 'flagPayoutsHint'
  | 'firstVerificationLabel'
  // Section "Comment ça marche"
  | 'howItWorks'
  | 'step1' | 'step2_a' | 'step2_b' | 'step2_c' | 'step3_a' | 'step3_b' | 'step3_c'
  // Buttons
  | 'btnRedirecting' | 'btnContinueVerification' | 'btnConnectAccount'
  | 'btnRefreshing' | 'btnRefreshStatus'
  // TransactionsCard
  | 'transactionsTitle'
  | 'transactionsLast1' | 'transactionsLastMany'
  | 'transactionsLoadError' | 'transactionsEmpty'
  | 'colDate' | 'colCitizen' | 'colItem' | 'colAmount' | 'colStatus'
  | 'testFlag'

const STRINGS: Record<Lang, Record<PaymentsKey, string>> = {
  fr: {
    eyebrow:                      'Paramètres',
    pageTitle:                    'Paiements & reversements',
    metaTitle:                    'Paiements · SportLocker ops',
    metaTitleRefresh:             'Rafraîchir le lien Stripe · SportLocker ops',
    metaTitleReturn:              'Retour Stripe · SportLocker ops',

    badgeServerNotConfigured:     'Non configuré côté serveur',
    badgeSuperAdminNoCommune:     'Sélectionne une commune',
    badgeNotStarted:              'Non configuré',
    badgePendingVerification:     'Vérification en cours',
    badgeChargesOnly:             'Payouts bloqués',
    badgePayoutsOnly:             'Paiements bloqués',
    badgeFullyVerified:           'Connecté',

    helpServerNotConfigured:      "La clé STRIPE_SECRET_KEY n'est pas configurée côté serveur. Pose-la sur Railway → @sportlocker/api → Variables pour activer cette page. Sans elle, aucun reversement n'est possible.",
    helpSuperAdminNoCommune:      "En tant que super-admin tu peux consulter le Stripe Connect d'une commune en ajoutant ?communeId=… à l'URL. Cette UI dédiée arrive dans une prochaine itération — pour l'instant utilise un compte admin scoped au tenant.",
    helpNotStarted:               'Aucun compte Stripe Connect associé à cette commune. Connecte ton compte pour commencer à encaisser les locations citoyennes et recevoir tes reversements automatiquement.',
    helpPendingVerification:      'Ton compte est créé chez Stripe. Termine la vérification (KYC + RIB) pour activer les paiements et les payouts. La vérification prend généralement 24-48 h après soumission complète des pièces.',
    helpChargesOnly:              'Les paiements entrants sont actifs, mais Stripe a temporairement bloqué les payouts vers ton RIB (souvent une vérification AML supplémentaire). Continue la vérification ou contacte le support Stripe si ça dure.',
    helpPayoutsOnly:              "Tes payouts sont actifs mais les paiements entrants sont bloqués. C'est rare — contacte le support Stripe pour comprendre.",
    helpFullyVerified:            'Ton compte est pleinement vérifié. Les paiements citoyens sur tes distributeurs sont encaissés, tu reçois 75 % en J+2 sur ton RIB. Tu peux rafraîchir le statut à tout moment pour synchroniser avec Stripe.',

    flagCharges:                  'Paiements entrants',
    flagChargesHint:              "Stripe a vérifié l'identité et autorise les paiements de tes citoyens.",
    flagPayouts:                  'Payouts vers ton RIB',
    flagPayoutsHint:              'Stripe peut envoyer les fonds vers ton compte bancaire (J+2).',
    firstVerificationLabel:       'Première vérification complète :',

    howItWorks:                   'Comment fonctionne le reversement ?',
    step1:                        'Tu connectes ton compte Stripe Express via le bouton ci-dessus — Stripe te guide pour ton KYC entreprise + RIB. ~10 min pour un dossier complet.',
    step2_a:                      'Chaque réservation citoyenne sur tes distributeurs déclenche un paiement Stripe.',
    step2_b:                      'Tu reçois 75 %',
    step2_c:                      ', SportLocker prend 25 % de commission marketplace.',
    step3_a:                      'Reversement automatique ',
    step3_b:                      'en J+2',
    step3_c:                      ' sur ton RIB via Stripe Express. Suivi temps réel des transferts dans ton dashboard.',

    btnRedirecting:               'Redirection vers Stripe…',
    btnContinueVerification:      'Continuer la vérification',
    btnConnectAccount:            'Connecter mon compte Stripe',
    btnRefreshing:                'Rafraîchissement…',
    btnRefreshStatus:             'Rafraîchir le statut',

    transactionsTitle:            'Transactions',
    transactionsLast1:            'dernière',
    transactionsLastMany:         'dernières',
    transactionsLoadError:        'Impossible de charger les transactions',
    transactionsEmpty:            'Aucune transaction pour le moment. Les paiements de location apparaîtront ici dès la première réservation réglée.',
    colDate:                      'Date',
    colCitizen:                   'Citoyen',
    colItem:                      'Matériel · Distributeur',
    colAmount:                    'Montant',
    colStatus:                    'Statut',
    testFlag:                     '(test)',
  },
  en: {
    eyebrow:                      'Settings',
    pageTitle:                    'Payments & payouts',
    metaTitle:                    'Payments · SportLocker ops',
    metaTitleRefresh:             'Refresh Stripe link · SportLocker ops',
    metaTitleReturn:              'Stripe return · SportLocker ops',

    badgeServerNotConfigured:     'Not configured server-side',
    badgeSuperAdminNoCommune:     'Select a commune',
    badgeNotStarted:              'Not configured',
    badgePendingVerification:     'Verification in progress',
    badgeChargesOnly:             'Payouts blocked',
    badgePayoutsOnly:             'Charges blocked',
    badgeFullyVerified:           'Connected',

    helpServerNotConfigured:      'The STRIPE_SECRET_KEY environment variable is not configured server-side. Add it on Railway → @sportlocker/api → Variables to enable this page. Without it, no payout is possible.',
    helpSuperAdminNoCommune:      'As a super-admin you can inspect a commune\'s Stripe Connect by appending ?communeId=… to the URL. A dedicated UI for this is coming — for now use an admin account scoped to the tenant.',
    helpNotStarted:               'No Stripe Connect account is linked to this commune yet. Connect your account to start collecting citizen rentals and receive payouts automatically.',
    helpPendingVerification:      'Your account is created on Stripe. Complete verification (KYC + bank account) to enable charges and payouts. Verification typically takes 24-48h after full document submission.',
    helpChargesOnly:              'Charges are active, but Stripe has temporarily blocked payouts to your bank (often an additional AML check). Continue verification or contact Stripe support if it persists.',
    helpPayoutsOnly:              'Your payouts are active but charges are blocked. This is rare — contact Stripe support to investigate.',
    helpFullyVerified:            'Your account is fully verified. Citizen rentals on your distributors are collected, you receive 75 % within 2 business days on your bank account. Refresh the status anytime to sync with Stripe.',

    flagCharges:                  'Incoming charges',
    flagChargesHint:              'Stripe has verified identity and allows citizen payments.',
    flagPayouts:                  'Payouts to your bank',
    flagPayoutsHint:              'Stripe can send funds to your bank account (T+2).',
    firstVerificationLabel:       'First full verification:',

    howItWorks:                   'How payouts work',
    step1:                        'You connect your Stripe Express account via the button above — Stripe guides you through company KYC + bank info. ~10 min for a complete file.',
    step2_a:                      'Every citizen reservation on your distributors triggers a Stripe payment.',
    step2_b:                      'You receive 75 %',
    step2_c:                      ', SportLocker takes a 25 % marketplace commission.',
    step3_a:                      'Automatic payout ',
    step3_b:                      'in T+2',
    step3_c:                      ' to your bank via Stripe Express. Real-time tracking of transfers in your dashboard.',

    btnRedirecting:               'Redirecting to Stripe…',
    btnContinueVerification:      'Continue verification',
    btnConnectAccount:            'Connect my Stripe account',
    btnRefreshing:                'Refreshing…',
    btnRefreshStatus:             'Refresh status',

    transactionsTitle:            'Transactions',
    transactionsLast1:            'most recent',
    transactionsLastMany:         'most recent',
    transactionsLoadError:        'Failed to load transactions',
    transactionsEmpty:            'No transactions yet. Rental payments will appear here as soon as the first reservation is paid.',
    colDate:                      'Date',
    colCitizen:                   'Citizen',
    colItem:                      'Item · Distributor',
    colAmount:                    'Amount',
    colStatus:                    'Status',
    testFlag:                     '(test)',
  },
}

export function paymentsStrings(lang: Lang): Record<PaymentsKey, string> {
  return STRINGS[lang]
}

const PAYMENT_STATUS_LABEL: Record<Lang, Record<PaymentStatus, string>> = {
  fr: {
    succeeded: 'Payé',
    pending:   'En attente',
    failed:    'Échoué',
    cancelled: 'Annulé',
    refunded:  'Remboursé',
  },
  en: {
    succeeded: 'Paid',
    pending:   'Pending',
    failed:    'Failed',
    cancelled: 'Cancelled',
    refunded:  'Refunded',
  },
}

export function paymentStatusLabel(lang: Lang, status: PaymentStatus): string {
  return PAYMENT_STATUS_LABEL[lang][status]
}
