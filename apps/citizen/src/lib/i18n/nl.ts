import type { Copy } from './types'

/**
 * Le néerlandais.
 *
 * Vouvoiement (« u ») partout : on s'adresse à un adulte inconnu, et le
 * tutoiement, courant aux Pays-Bas entre jeunes, passerait mal auprès d'une
 * clientèle familiale et plus âgée. « Uitleenpunt » — point de prêt — plutôt
 * qu'un mot inventé autour de « zuil » : c'est le terme qu'emploient les
 * bibliothèques et les clubs sportifs pour exactement cet objet.
 *
 * À faire relire par un néerlandophone avant la saison.
 */
export const nl: Copy = {
  langPicker: 'Kies uw taal',
  themeToLight: 'Naar licht thema',
  themeToDark: 'Naar donker thema',

  home: {
    title: 'Wat is de code',
    titleAccent: 'van het uitleenpunt?',
    hint: 'De code staat onder de QR-code, boven aan het uitleenpunt. Bijvoorbeeld SL-001.',
    fieldLabel: 'Code van het uitleenpunt',
    submit: 'Verder',
    hasLoan: 'U heeft iets geleend.',
    hasLoanLink: 'Terugbrengen',
  },

  kiosk: {
    connecting: 'Verbinding maken…',
    deadTitle: 'Uitleenpunt reageert niet',
    deadFallback: 'Dit uitleenpunt gaf geen antwoord.',
    retry: 'Opnieuw proberen',
    opening: 'Het kluisje gaat open…',
  },

  identify: {
    title: 'Hallo! Verblijft u hier?',
    hint: 'Uw boekingsnummer en uw achternaam zijn genoeg. Geen account, geen bankpas.',
    stayRefLabel: 'Boekingsnummer',
    stayRefHelp: 'Plaatsnummer, kamernummer of reserveringsnummer — het staat op uw bevestiging.',
    lastNameLabel: 'Achternaam',
    submit: 'Verder',
    submitBusy: 'Controleren…',
    privacy:
      'Dit gebruiken we alleen om te weten wie wat heeft geleend. Het blijft bij uw accommodatie.',
  },

  choose: {
    title: 'Wat wilt u lenen?',
    greeting: (name) => `Hallo ${name}.`,
    stock: (available) =>
      available > 0
        ? `${available} stuk${available > 1 ? 's' : ''} beschikbaar in dit uitleenpunt`
        : 'Op dit moment is alles uitgeleend',
    available: (n) => `${n} beschikbaar`,
    soldOut: 'Alles uitgeleend',
    footer:
      'Eén stuk tegelijk. Breng het terug als u klaar bent — iemand anders wacht er misschien op.',
  },

  opened: {
    title: 'Het staat open',
    instruction: 'Neem het materiaal en doe het deurtje dicht. Veel plezier!',
    seeLoan: 'Gepakt, mijn lening bekijken',
  },

  blocked: {
    title: 'U heeft al:',
    hint: 'Eén stuk tegelijk. Breng dit terug om iets anders te lenen.',
    cta: 'Terugbrengen',
  },

  loan: {
    loading: 'Laden…',
    noneTitle: 'Niets geleend',
    noneHint: 'Scan de QR-code op het uitleenpunt om materiaal te lenen.',
    noneCta: 'Code invoeren',
    borrowedEyebrow: 'Geleend',
    where: (serial, locker) => `Uitleenpunt ${serial} · kluisje ${locker}`,
    giveBack: 'Terugbrengen',
    giveBackBusy: 'Een kluisje gaat open…',
    beforePress:
      'Ga eerst naar het uitleenpunt en druk dan pas: er gaat een kluisje open om het materiaal in te leggen.',
    returnedTitle: 'Leg het hier',
    returnedHint: 'Leg het materiaal in het kluisje en doe het deurtje goed dicht. Dat was het, bedankt!',
    done: 'Klaar',
  },

  notFound: {
    title: 'Pagina niet gevonden',
    hint: 'Scan de QR-code op het uitleenpunt opnieuw, of voer de code in.',
    cta: 'Code invoeren',
  },

  crash: {
    title: 'Dat ging niet goed',
    hint: 'Probeer het opnieuw. Gaat het kluisje nog steeds niet open, meld het bij de receptie.',
    cta: 'Opnieuw proberen',
  },

  lockerWord: 'Kluisje',

  items: {
    ballon: 'Voetbal',
    basket: 'Basketbal',
    volley: 'Volleybal',
    raquette: 'Racket',
    disque: 'Frisbee',
    plot: 'Pionnen',
    corde: 'Springtouw',
    boule: 'Jeu de boules',
    autre: 'Materiaal',
  },

  errors: {
    stay_not_found:
      'Dit boekingsnummer kennen we niet. Kijk het na op uw bevestiging, of vraag het bij de receptie.',
    kiosk_not_found: 'Dit uitleenpunt kennen we niet. Kijk de code na die erop staat.',
    item_unavailable: 'Iemand anders heeft dit net geleend.',
    loan_already_active: 'U heeft al iets geleend. Breng het terug om iets anders te lenen.',
    loan_not_found: 'Deze lening is al afgesloten.',
    locker_stuck: 'Het kluisje reageerde niet. Meld het bij de receptie, wij lossen het op.',
    no_free_locker: 'Alle kluisjes zijn bezet. Meld het bij de receptie.',
    network: 'Geen verbinding. Ga dichter bij het uitleenpunt staan en probeer het opnieuw.',
    bad_response: 'Het uitleenpunt gaf een onverwacht antwoord. Meld het bij de receptie.',
  },
  errorFallback: 'Er ging iets mis. Probeer het opnieuw.',
}
