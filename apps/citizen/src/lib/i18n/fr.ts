import type { Copy } from './types'

/**
 * Le français, qui sert de référence aux trois autres.
 *
 * Registre : le vouvoiement, des phrases courtes, aucun terme métier. On ne dit
 * ni « borne » sans contexte, ni « emprunt » là où « article » suffit. Le
 * lecteur type est debout, dehors, pressé, et n'a jamais vu le produit.
 */
export const fr: Copy = {
  langPicker: 'Choisir la langue',
  themeToLight: 'Passer en thème clair',
  themeToDark: 'Passer en thème sombre',

  home: {
    title: 'Quel est le code',
    titleAccent: 'de la borne ?',
    hint: 'Il est imprimé sous le QR code, en haut de la borne. Il ressemble à SL-001.',
    fieldLabel: 'Code de la borne',
    submit: 'Continuer',
    hasLoan: 'Vous avez un article emprunté.',
    hasLoanLink: 'Le rendre',
  },

  kiosk: {
    connecting: 'Connexion à la borne…',
    deadTitle: 'Borne injoignable',
    deadFallback: "Cette borne n'a pas répondu.",
    retry: 'Réessayer',
    opening: 'Ouverture du casier…',
  },

  identify: {
    title: 'Bonjour ! Vous séjournez ici ?',
    hint: 'Votre numéro de séjour et votre nom suffisent. Aucun compte, aucune carte bancaire.',
    stayRefLabel: 'Numéro de séjour',
    stayRefHelp: 'Emplacement, chambre ou numéro de réservation — il figure sur votre contrat.',
    lastNameLabel: 'Nom de famille',
    submit: 'Continuer',
    submitBusy: 'Vérification…',
    privacy:
      'Ces informations servent uniquement à savoir à qui prêter le matériel. Elles restent chez votre hébergeur.',
  },

  choose: {
    title: 'Qu’est-ce qui vous ferait plaisir ?',
    greeting: (name) => `Bonjour ${name}.`,
    stock: (available) =>
      available > 0
        ? `${available} article${available > 1 ? 's' : ''} disponible${available > 1 ? 's' : ''} dans cette borne`
        : 'Tout est sorti pour le moment',
    available: (n) => `${n} disponible${n > 1 ? 's' : ''}`,
    soldOut: 'Tout est sorti',
    footer:
      'Un article à la fois. Rapportez-le quand vous avez fini, un autre vacancier l’attend peut-être.',
  },

  opened: {
    title: 'C’est ouvert',
    instruction: 'Prenez le matériel et refermez la porte. Bon match !',
    seeLoan: 'J’ai pris, voir mon emprunt',
  },

  blocked: {
    title: 'Vous avez déjà :',
    hint: 'Un article à la fois. Rendez celui-ci pour en prendre un autre.',
    cta: 'Rendre l’article',
  },

  loan: {
    loading: 'Chargement…',
    noneTitle: 'Aucun emprunt en cours',
    noneHint: 'Scannez le QR code de la borne pour prendre du matériel.',
    noneCta: 'Saisir le code de la borne',
    borrowedEyebrow: 'Emprunté',
    where: (serial, locker) => `Borne ${serial} · casier ${locker}`,
    giveBack: 'Rendre l’article',
    giveBackBusy: 'Ouverture d’un casier…',
    beforePress:
      'Rendez-vous devant la borne avant d’appuyer : un casier va s’ouvrir pour que vous y déposiez le matériel.',
    returnedTitle: 'Déposez ici',
    returnedHint:
      'Rangez le matériel dans le casier et refermez bien la porte. C’est tout, merci !',
    done: 'Terminé',
  },

  notFound: {
    title: 'Page introuvable',
    hint: 'Scannez à nouveau le QR code collé sur la borne, ou saisissez son code.',
    cta: 'Saisir le code de la borne',
  },

  crash: {
    title: 'Ça n’a pas marché',
    hint: 'Réessayez. Si le casier ne s’ouvre toujours pas, passez à l’accueil.',
    cta: 'Réessayer',
  },

  lockerWord: 'Casier',

  items: {
    ballon: 'Ballon de foot',
    basket: 'Ballon de basket',
    volley: 'Ballon de volley',
    raquette: 'Raquette',
    disque: 'Frisbee',
    plot: 'Plots',
    corde: 'Corde à sauter',
    boule: 'Boules de pétanque',
    autre: 'Matériel',
  },

  errors: {
    stay_not_found:
      "Ce numéro de séjour n'est pas reconnu. Vérifiez-le sur votre contrat, ou passez à l'accueil.",
    kiosk_not_found: "Cette borne n'est pas reconnue. Vérifiez le code inscrit dessus.",
    item_unavailable: "Ce matériel vient d'être emprunté par quelqu'un d'autre.",
    loan_already_active: 'Vous avez déjà un article emprunté. Rendez-le pour en prendre un autre.',
    loan_not_found: 'Cet emprunt est déjà clôturé.',
    locker_stuck: "Le casier n'a pas répondu. Prévenez l'accueil, on s'en occupe.",
    no_free_locker: "Tous les casiers sont occupés. Prévenez l'accueil.",
    network: 'Pas de connexion. Approchez-vous de la borne et réessayez.',
    bad_response: "La borne a répondu quelque chose d'inattendu. Prévenez l'accueil.",
  },
  errorFallback: "Quelque chose n'a pas marché. Réessayez.",
}
