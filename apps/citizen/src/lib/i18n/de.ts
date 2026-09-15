import type { Copy } from './types'

/**
 * L'allemand.
 *
 * Vouvoiement (« Sie ») partout, pour la même raison qu'en néerlandais.
 * « Station » plutôt que « Automat » : un Automat, en allemand, rend quelque
 * chose contre de l'argent — le mot ferait croire à un service payant, ce que
 * le prêt n'est pas.
 *
 * À faire relire par un germanophone avant la saison.
 */
export const de: Copy = {
  langPicker: 'Sprache wählen',
  themeToLight: 'Zum hellen Design wechseln',
  themeToDark: 'Zum dunklen Design wechseln',

  home: {
    title: 'Wie lautet der Code',
    titleAccent: 'der Station?',
    hint: 'Er steht unter dem QR-Code, oben an der Station. Zum Beispiel SL-001.',
    fieldLabel: 'Code der Station',
    submit: 'Weiter',
    hasLoan: 'Sie haben etwas ausgeliehen.',
    hasLoanLink: 'Zurückgeben',
  },

  kiosk: {
    connecting: 'Verbindung zur Station…',
    deadTitle: 'Station antwortet nicht',
    deadFallback: 'Diese Station hat nicht geantwortet.',
    retry: 'Erneut versuchen',
    opening: 'Das Fach wird geöffnet…',
  },

  identify: {
    title: 'Hallo! Übernachten Sie hier?',
    hint: 'Ihre Buchungsnummer und Ihr Nachname genügen. Kein Konto, keine Bankkarte.',
    stayRefLabel: 'Buchungsnummer',
    stayRefHelp: 'Stellplatz-, Zimmer- oder Reservierungsnummer — sie steht auf Ihrer Bestätigung.',
    lastNameLabel: 'Nachname',
    submit: 'Weiter',
    submitBusy: 'Wird geprüft…',
    privacy:
      'Wir verwenden das nur, um zu wissen, wer was ausgeliehen hat. Es bleibt bei Ihrer Unterkunft.',
  },

  choose: {
    title: 'Was möchten Sie ausleihen?',
    greeting: (name) => `Hallo ${name}.`,
    stock: (available) =>
      available > 0
        ? `${available} Artikel in dieser Station verfügbar`
        : 'Im Moment ist alles ausgeliehen',
    available: (n) => `${n} verfügbar`,
    soldOut: 'Alles ausgeliehen',
    emptyTitle: 'Die Station ist leer',
    emptyHint: 'Momentan ist alles ausgeliehen. Im Laufe des Tages kommt das Material zurück — schauen Sie später noch einmal vorbei oder fragen Sie an der Rezeption.',
    emptyAgain: 'Erneut prüfen',
    footer:
      'Ein Artikel nach dem anderen. Bringen Sie ihn zurück, wenn Sie fertig sind — jemand wartet vielleicht darauf.',
  },

  opened: {
    title: 'Es ist offen',
    instruction: 'Nehmen Sie das Material heraus und schließen Sie die Tür. Viel Spaß!',
    seeLoan: 'Habe ich, Ausleihe ansehen',
  },

  blocked: {
    title: 'Sie haben bereits:',
    hint: 'Ein Artikel nach dem anderen. Geben Sie diesen zurück, um einen anderen zu nehmen.',
    cta: 'Artikel zurückgeben',
  },

  loan: {
    loading: 'Wird geladen…',
    noneTitle: 'Nichts ausgeliehen',
    noneHint: 'Scannen Sie den QR-Code an der Station, um Material auszuleihen.',
    noneCta: 'Code eingeben',
    borrowedEyebrow: 'Ausgeliehen',
    where: (serial, locker) => `Station ${serial} · Fach ${locker}`,
    giveBack: 'Artikel zurückgeben',
    giveBackBusy: 'Ein Fach wird geöffnet…',
    beforePress:
      'Stellen Sie sich vor die Station, bevor Sie drücken: ein Fach öffnet sich, damit Sie das Material hineinlegen können.',
    returnedTitle: 'Hier hineinlegen',
    returnedHint: 'Legen Sie das Material in das Fach und schließen Sie die Tür gut. Das war es, danke!',
    done: 'Fertig',
  },

  notFound: {
    title: 'Seite nicht gefunden',
    hint: 'Scannen Sie den QR-Code an der Station erneut, oder geben Sie den Code ein.',
    cta: 'Code eingeben',
  },

  crash: {
    title: 'Das hat nicht geklappt',
    hint: 'Versuchen Sie es erneut. Öffnet sich das Fach weiterhin nicht, wenden Sie sich an die Rezeption.',
    cta: 'Erneut versuchen',
  },

  lockerWord: 'Fach',

  items: {
    ballon: 'Fußball',
    basket: 'Basketball',
    volley: 'Volleyball',
    raquette: 'Schläger',
    pingpong: 'Tischtennisschläger',
    badminton: 'Badminton-Set',
    tennis: 'Tennisschläger',
    disque: 'Frisbee',
    plot: 'Hütchen',
    corde: 'Springseil',
    boule: 'Boulekugeln',
    autre: 'Material',
  },

  errors: {
    stay_not_found:
      'Diese Buchungsnummer kennen wir nicht. Prüfen Sie sie auf Ihrer Bestätigung, oder fragen Sie an der Rezeption.',
    kiosk_not_found: 'Diese Station kennen wir nicht. Prüfen Sie den Code, der darauf steht.',
    item_unavailable: 'Jemand anderes hat das gerade ausgeliehen.',
    loan_already_active:
      'Sie haben bereits einen Artikel ausgeliehen. Geben Sie ihn zurück, um einen anderen zu nehmen.',
    loan_not_found: 'Diese Ausleihe ist bereits abgeschlossen.',
    locker_stuck: 'Das Fach hat nicht reagiert. Sagen Sie der Rezeption Bescheid, wir kümmern uns darum.',
    no_free_locker: 'Alle Fächer sind belegt. Bitte wenden Sie sich an die Rezeption.',
    network: 'Keine Verbindung. Gehen Sie näher an die Station und versuchen Sie es erneut.',
    bad_response: 'Die Station hat unerwartet geantwortet. Bitte wenden Sie sich an die Rezeption.',
  },
  errorFallback: 'Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.',
}
