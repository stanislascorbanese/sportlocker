import type { Copy } from './types'

/**
 * L'anglais, qui sert aussi de repli à toutes les langues non servies.
 *
 * Écrit pour être lu par des non-anglophones autant que par des Britanniques :
 * pas d'idiome, pas de contraction ambiguë, un mot par idée. « Station » plutôt
 * que « kiosk » ou « unit », parce que c'est le mot que les gens emploient
 * spontanément devant l'objet.
 */
export const en: Copy = {
  langPicker: 'Choose your language',
  themeToLight: 'Switch to light theme',
  themeToDark: 'Switch to dark theme',

  home: {
    title: 'What is the code',
    titleAccent: 'on the station?',
    hint: 'It is printed under the QR code, at the top of the station. It looks like SL-001.',
    fieldLabel: 'Station code',
    submit: 'Continue',
    hasLoan: 'You have an item on loan.',
    hasLoanLink: 'Return it',
  },

  kiosk: {
    connecting: 'Connecting to the station…',
    deadTitle: 'Station not responding',
    deadFallback: 'This station did not answer.',
    retry: 'Try again',
    opening: 'Opening the locker…',
  },

  identify: {
    title: 'Hello! Are you staying here?',
    hint: 'Your booking number and your surname are enough. No account, no bank card.',
    stayRefLabel: 'Booking number',
    stayRefHelp: 'Pitch, room or reservation number — it is on your booking confirmation.',
    lastNameLabel: 'Surname',
    submit: 'Continue',
    submitBusy: 'Checking…',
    privacy:
      'This is only used to know who borrowed what. It stays with the place you are staying at.',
  },

  choose: {
    title: 'What would you like?',
    greeting: (name) => `Hello ${name}.`,
    stock: (available) =>
      available > 0
        ? `${available} item${available > 1 ? 's' : ''} available in this station`
        : 'Everything is out at the moment',
    available: (n) => `${n} available`,
    soldOut: 'All out',
    emptyTitle: 'The station is empty',
    emptyHint: 'Everything is out right now. Gear comes back through the day — try again a little later, or ask at reception.',
    emptyAgain: 'Check again',
    footer: 'One item at a time. Bring it back when you are done — someone else may be waiting.',
  },

  opened: {
    title: 'It is open',
    instruction: 'Take the equipment and close the door. Have fun!',
    seeLoan: 'Got it, see my loan',
  },

  blocked: {
    title: 'You already have:',
    hint: 'One item at a time. Return this one to take another.',
    cta: 'Return the item',
  },

  loan: {
    loading: 'Loading…',
    noneTitle: 'Nothing on loan',
    noneHint: 'Scan the QR code on the station to borrow equipment.',
    noneCta: 'Enter the station code',
    borrowedEyebrow: 'On loan',
    where: (serial, locker) => `Station ${serial} · locker ${locker}`,
    giveBack: 'Return the item',
    giveBackBusy: 'Opening a locker…',
    beforePress:
      'Stand in front of the station before you press: a locker will open for you to put the equipment back.',
    returnedTitle: 'Put it here',
    returnedHint: 'Place the equipment in the locker and close the door firmly. That is all, thank you!',
    done: 'Done',
  },

  carte: {
    title: 'Where are the stations?',
    hint: 'Tap a station to see what it holds.',
    chargement: 'Loading the map…',
    erreur: 'The map could not load. Use the code written on the station.',
    disponibles: 'available',
    vide: 'nothing available',
    bornesIndispo: 'The stations could not be shown. Try again in a moment.',
  },

  notFound: {
    title: 'Page not found',
    hint: 'Scan the QR code on the station again, or type its code.',
    cta: 'Enter the station code',
  },

  crash: {
    title: 'That did not work',
    hint: 'Try again. If the locker still will not open, ask at reception.',
    cta: 'Try again',
  },

  lockerWord: 'Locker',

  items: {
    ballon: 'Football',
    basket: 'Basketball',
    volley: 'Volleyball',
    raquette: 'Racket',
    pingpong: 'Table tennis bats',
    badminton: 'Badminton set',
    tennis: 'Tennis racket',
    disque: 'Frisbee',
    plot: 'Cones',
    corde: 'Skipping rope',
    boule: 'Pétanque balls',
    autre: 'Equipment',
  },

  errors: {
    stay_not_found:
      'We do not recognise this booking number. Check it on your confirmation, or ask at reception.',
    kiosk_not_found: 'We do not recognise this station. Check the code written on it.',
    item_unavailable: 'Someone else has just borrowed this item.',
    loan_already_active: 'You already have an item on loan. Return it to take another.',
    loan_not_found: 'This loan is already closed.',
    locker_stuck: 'The locker did not respond. Tell reception and we will sort it out.',
    no_free_locker: 'Every locker is full. Please tell reception.',
    network: 'No connection. Move closer to the station and try again.',
    bad_response: 'The station gave an unexpected answer. Please tell reception.',
  },
  errorFallback: 'Something went wrong. Please try again.',
}
