import type { Lang } from '../lang'

type AuthKey =
  // Brand
  | 'brandSuffix' | 'operatorConsole'
  // Login form
  | 'fieldEmail' | 'fieldPassword'
  | 'btnLoggingIn' | 'btnLogin'
  | 'forgotPassword'
  | 'accessNote'
  // Login errors
  | 'errInvalidEmail' | 'errUserDisabled' | 'errBadCredentials'
  | 'errTooMany' | 'errGeneric' | 'errForbidden'
  // Reset page
  | 'backToLogin'
  | 'resetTitle1' | 'resetTitle2' | 'resetEyebrow'
  | 'resetIntro' | 'resetIfMatch1' | 'resetIfMatch2'
  | 'resetExpiresHint'
  | 'btnSending' | 'btnSendResetLink'
  | 'resetErrorInvalid' | 'resetErrorNetwork'
  | 'resetFooter'
  // Accept invite
  | 'inviteTitleAccept' | 'inviteSubtitle'
  | 'inviteFieldPassword' | 'inviteFieldPasswordConfirm'
  | 'inviteFieldPasswordHint'
  | 'inviteBtnSubmit' | 'inviteBtnSubmitting'
  | 'inviteErrMismatch' | 'inviteErrTooShort' | 'inviteErrGeneric'
  | 'inviteSuccessTitle' | 'inviteSuccessText'
  | 'inviteSuccessCta'
  // Accept-invite specifics
  | 'inviteEyebrow' | 'inviteFieldConfirmation'
  | 'inviteErrMismatch2' | 'inviteErrTooShort2'
  | 'inviteApiNotFound' | 'inviteApiEmailMismatch' | 'inviteApiGeneric'
  | 'inviteFbEmailInUse' | 'inviteFbInvalidEmail' | 'inviteFbWeakPwd' | 'inviteFbGeneric'
  | 'inviteLinkInvalid' | 'inviteSessionFailed' | 'inviteGenericFail'
  | 'inviteGoToLogin' | 'inviteAlreadyRegistered' | 'inviteSignInLink'

const STRINGS: Record<Lang, Record<AuthKey, string>> = {
  fr: {
    brandSuffix:           '· ops',
    operatorConsole:       'Console opérateur',
    fieldEmail:            'Email',
    fieldPassword:         'Mot de passe',
    btnLoggingIn:          'Connexion…',
    btnLogin:              'Se connecter',
    forgotPassword:        'Mot de passe oublié ?',
    accessNote:            'Accès réservé aux administrateurs SportLocker et aux référents communaux invités.',

    errInvalidEmail:       'Adresse email invalide.',
    errUserDisabled:       'Ce compte a été désactivé.',
    errBadCredentials:     'Email ou mot de passe incorrect.',
    errTooMany:            'Trop de tentatives. Réessayez dans quelques minutes.',
    errGeneric:            'Connexion impossible. Réessayez.',
    errForbidden:          "Votre compte n'a pas accès à ce dashboard.",

    backToLogin:           'Retour à la connexion',
    resetTitle1:           'Mot de passe',
    resetTitle2:           'oublié ?',
    resetEyebrow:          'Réinitialisation',
    resetIntro:            "Saisis l'email de ton compte ops. Tu recevras un lien pour choisir un nouveau mot de passe.",
    resetIfMatch1:         'Si',
    resetIfMatch2:         "correspond à un compte, un email avec un lien de réinitialisation vient d'être envoyé. Vérifie ta boîte mail (et tes spams).",
    resetExpiresHint:      "Le lien expire après 1 heure. Si tu ne reçois rien dans 5 min, vérifie que l'adresse saisie correspond bien à ton compte ops ou contacte l'équipe SportLocker.",
    btnSending:            'Envoi…',
    btnSendResetLink:      'Envoyer le lien de réinitialisation',
    resetErrorInvalid:     'Adresse email invalide.',
    resetErrorNetwork:     'Connexion réseau impossible. Vérifie ta connexion.',
    resetFooter:           'Ce lien sert uniquement à réinitialiser ton mot de passe. Aucun login automatique.',

    inviteTitleAccept:        'Accepte ton invitation',
    inviteSubtitle:           'Définis ton mot de passe pour activer ton compte ops.',
    inviteFieldPassword:      'Mot de passe',
    inviteFieldPasswordConfirm:'Confirme le mot de passe',
    inviteFieldPasswordHint:  'Minimum 8 caractères.',
    inviteBtnSubmit:          'Activer mon compte',
    inviteBtnSubmitting:      'Activation…',
    inviteErrMismatch:        'Les mots de passe ne correspondent pas.',
    inviteErrTooShort:        'Le mot de passe doit faire au moins 8 caractères.',
    inviteErrGeneric:         "Impossible d'activer le compte. Le lien est peut-être expiré.",
    inviteSuccessTitle:       'Compte activé !',
    inviteSuccessText:        'Tu peux maintenant te connecter avec ton email et ton mot de passe.',
    inviteSuccessCta:         'Aller à la connexion',
    inviteEyebrow:            'Activation du compte',
    inviteFieldConfirmation:  'Confirmation',
    inviteErrMismatch2:       'Les deux mots de passe ne correspondent pas.',
    inviteErrTooShort2:       'Mot de passe : 8 caractères minimum.',
    inviteApiNotFound:        "Ce lien d'invitation est expiré ou a déjà été utilisé.",
    inviteApiEmailMismatch:   "L'email de votre compte ne correspond pas à celui de l'invitation.",
    inviteApiGeneric:         "L'activation du compte a échoué. Réessayez.",
    inviteFbEmailInUse:       'Un compte Firebase existe déjà pour cet email. Connectez-vous via la page de connexion.',
    inviteFbInvalidEmail:     'Adresse email invalide.',
    inviteFbWeakPwd:          'Le mot de passe est trop faible (6 caractères minimum).',
    inviteFbGeneric:          'Création de compte impossible. Réessayez.',
    inviteLinkInvalid:        'Lien invalide : token manquant.',
    inviteSessionFailed:      'Activation OK mais session non créée. Connectez-vous depuis la page de connexion.',
    inviteGenericFail:        'Activation impossible. Réessayez.',
    inviteGoToLogin:          'Aller à la page de connexion',
    inviteAlreadyRegistered:  'Déjà inscrit ?',
    inviteSignInLink:         'Se connecter',
  },
  en: {
    brandSuffix:           '· ops',
    operatorConsole:       'Operator console',
    fieldEmail:            'Email',
    fieldPassword:         'Password',
    btnLoggingIn:          'Signing in…',
    btnLogin:              'Sign in',
    forgotPassword:        'Forgot password?',
    accessNote:            'Access restricted to SportLocker admins and invited commune contacts.',

    errInvalidEmail:       'Invalid email address.',
    errUserDisabled:       'This account has been disabled.',
    errBadCredentials:     'Incorrect email or password.',
    errTooMany:            'Too many attempts. Try again in a few minutes.',
    errGeneric:            'Sign-in failed. Please retry.',
    errForbidden:          "Your account doesn't have access to this dashboard.",

    backToLogin:           'Back to sign in',
    resetTitle1:           'Forgot',
    resetTitle2:           'password?',
    resetEyebrow:          'Reset',
    resetIntro:            'Enter your ops account email. You will receive a link to choose a new password.',
    resetIfMatch1:         'If',
    resetIfMatch2:         "matches an account, a reset link has been sent. Check your inbox (and spam).",
    resetExpiresHint:      "The link expires after 1 hour. If nothing arrives within 5 min, double-check the email or contact the SportLocker team.",
    btnSending:            'Sending…',
    btnSendResetLink:      'Send reset link',
    resetErrorInvalid:     'Invalid email address.',
    resetErrorNetwork:     'Network error. Check your connection.',
    resetFooter:           'This link only resets your password. No automatic sign-in.',

    inviteTitleAccept:        'Accept your invitation',
    inviteSubtitle:           'Set your password to activate your ops account.',
    inviteFieldPassword:      'Password',
    inviteFieldPasswordConfirm:'Confirm password',
    inviteFieldPasswordHint:  'Minimum 8 characters.',
    inviteBtnSubmit:          'Activate my account',
    inviteBtnSubmitting:      'Activating…',
    inviteErrMismatch:        'Passwords do not match.',
    inviteErrTooShort:        'Password must be at least 8 characters.',
    inviteErrGeneric:         'Failed to activate the account. The link may have expired.',
    inviteSuccessTitle:       'Account activated!',
    inviteSuccessText:        'You can now sign in with your email and password.',
    inviteSuccessCta:         'Go to sign in',
    inviteEyebrow:            'Account activation',
    inviteFieldConfirmation:  'Confirmation',
    inviteErrMismatch2:       'The two passwords do not match.',
    inviteErrTooShort2:       'Password: 8 characters minimum.',
    inviteApiNotFound:        'This invitation link has expired or has already been used.',
    inviteApiEmailMismatch:   "Your account email doesn't match the invitation email.",
    inviteApiGeneric:         'Account activation failed. Please retry.',
    inviteFbEmailInUse:       'A Firebase account already exists for this email. Sign in via the login page.',
    inviteFbInvalidEmail:     'Invalid email address.',
    inviteFbWeakPwd:          'Password is too weak (6 characters minimum).',
    inviteFbGeneric:          'Account creation failed. Please retry.',
    inviteLinkInvalid:        'Invalid link: missing token.',
    inviteSessionFailed:      'Activation OK but session not created. Sign in from the login page.',
    inviteGenericFail:        'Activation failed. Please retry.',
    inviteGoToLogin:          'Go to login page',
    inviteAlreadyRegistered:  'Already registered?',
    inviteSignInLink:         'Sign in',
  },
}

export function authStrings(lang: Lang): Record<AuthKey, string> {
  return STRINGS[lang]
}

export function mapFirebaseError(lang: Lang, code: string): string {
  const t = authStrings(lang)
  switch (code) {
    case 'auth/invalid-email':       return t.errInvalidEmail
    case 'auth/user-disabled':       return t.errUserDisabled
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
    case 'auth/wrong-password':      return t.errBadCredentials
    case 'auth/too-many-requests':   return t.errTooMany
    default:                         return t.errGeneric
  }
}
