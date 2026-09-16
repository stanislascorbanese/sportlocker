import type { ItemKind } from '@/lib/contract'

/**
 * Les langues servies par l'app vacancier.
 *
 * Le choix ne vient pas d'une ambition d'internationalisation : il vient de qui
 * dort dans un camping de la côte atlantique en juillet. Après les Français,
 * les deux nationalités les plus présentes sont les Néerlandais et les
 * Allemands, et ce sont précisément les deux qui lisent le moins bien le
 * français. L'anglais sert de repli pour tous les autres.
 *
 * Ajouter une langue ici casse la compilation tant que son dictionnaire n'est
 * pas écrit — c'est voulu : une langue à moitié traduite est pire qu'absente,
 * parce qu'elle mélange deux langues sur le même écran.
 */
export const LANGS = ['fr', 'en', 'nl', 'de'] as const
export type Lang = (typeof LANGS)[number]

/** Ce qu'on affiche dans le sélecteur. Le nom est écrit dans sa propre langue. */
export const LANG_NAMES: Record<Lang, string> = {
  fr: 'Français',
  en: 'English',
  nl: 'Nederlands',
  de: 'Deutsch',
}

/**
 * Tout le texte de l'app, en un seul objet.
 *
 * Il n'y a pas de clés plates du genre `t('choose.title')` : les quatre
 * dictionnaires sont typés contre cette interface, donc une clé oubliée dans
 * une langue est une erreur de compilation, pas une chaîne manquante découverte
 * par un vacancier devant la borne.
 */
export interface Copy {
  /** Nom du bouton de langue, pour les lecteurs d'écran. */
  langPicker: string
  themeToLight: string
  themeToDark: string

  home: {
    title: string
    titleAccent: string
    hint: string
    fieldLabel: string
    submit: string
    hasLoan: string
    hasLoanLink: string
  }

  kiosk: {
    connecting: string
    deadTitle: string
    deadFallback: string
    retry: string
    opening: string
  }

  identify: {
    title: string
    hint: string
    stayRefLabel: string
    stayRefHelp: string
    lastNameLabel: string
    submit: string
    submitBusy: string
    privacy: string
  }

  choose: {
    title: string
    greeting: (name: string) => string
    stock: (available: number) => string
    available: (n: number) => string
    soldOut: string
    /** Écran dédié quand la borne ne contient plus rien. */
    emptyTitle: string
    emptyHint: string
    emptyAgain: string
    footer: string
  }

  opened: {
    title: string
    instruction: string
    seeLoan: string
  }

  blocked: {
    title: string
    hint: string
    cta: string
  }

  loan: {
    loading: string
    noneTitle: string
    noneHint: string
    noneCta: string
    borrowedEyebrow: string
    where: (serial: string, locker: number) => string
    giveBack: string
    giveBackBusy: string
    beforePress: string
    returnedTitle: string
    returnedHint: string
    done: string
  }

  /** Carte publique des bornes — deuxième porte d'entrée, quand le QR n'est pas là. */
  carte: {
    title: string
    hint: string
    chargement: string
    erreur: string
    /** Suffixe après le nombre : « 3 disponibles ». */
    disponibles: string
    /** Borne sans aucun article libre. */
    vide: string
    /** La carte s'affiche mais la liste des bornes n'a pas repondu. */
    bornesIndispo: string
  }
  notFound: { title: string; hint: string; cta: string }
  crash: { title: string; hint: string; cta: string }

  /** Le mot peint au-dessus du grand numéro. */
  lockerWord: string

  /**
   * Le nom du matériel par famille.
   *
   * En français on garde le libellé saisi par l'exploitant — « Ballon de foot
   * taille 5 » est plus précis que « Ballon ». Dans les trois autres langues on
   * bascule sur ces mots-là : un Néerlandais préfère lire « Voetbal » que le
   * libellé exact d'un article qu'il ne peut pas déchiffrer, et le pictogramme
   * porte déjà la distinction fine.
   */
  items: Record<ItemKind, string>

  /** Les codes d'erreur du serveur, traduits. Le serveur n'envoie que le code. */
  errors: Record<string, string>
  errorFallback: string
}
