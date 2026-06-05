import type { Lang } from '../lang'

/**
 * Strings et utils i18n partagés entre toutes les pages du dashboard.
 *
 * Convention : un fichier `lib/i18n/<domaine>.ts` par page/domaine. Si une
 * string est utilisée par 2+ pages, elle remonte ici (DRY). Sinon elle reste
 * locale au domaine pour éviter qu'un dico devienne un sac fourre-tout.
 *
 * Côté Server Component  : `await getLang()` puis `commonStrings(lang)`.
 * Côté Client Component  : `const lang = useLang()` puis `commonStrings(lang)`.
 */

type CommonKey =
  // Badges / labels génériques
  | 'demo' | 'all' | 'none' | 'unknown'
  // Boutons partagés
  | 'refresh' | 'filter' | 'reset' | 'cancel' | 'save' | 'create' | 'edit' | 'delete' | 'back'
  | 'detail' | 'modify' | 'export' | 'viewAll' | 'nextPage' | 'previousPage' | 'new' | 'health'
  // Form labels génériques
  | 'search' | 'status' | 'from' | 'to' | 'date' | 'name' | 'email'
  // Demo banner
  | 'demoFootnote'
  // Erreurs API
  | 'apiErrorTitle' | 'apiErrorFallback'
  // Vide
  | 'emptyForFilters'
  // Statuts distributeur (utilisés cross-pages)
  | 'statusOnline' | 'statusOffline' | 'statusMaintenance' | 'statusDecommissioned'
  // Empty states cross-composants
  | 'noData' | 'noDataPeriod' | 'loading' | 'never'

const STRINGS: Record<Lang, Record<CommonKey, string>> = {
  fr: {
    demo:                'Démo',
    all:                 'Tous',
    none:                'Aucun',
    unknown:             'Inconnu',

    refresh:             'Rafraîchir',
    filter:              'Filtrer',
    reset:               'Réinitialiser',
    cancel:              'Annuler',
    save:                'Enregistrer',
    create:              'Créer',
    edit:                'Modifier',
    delete:              'Supprimer',
    back:                'Retour',
    detail:              'Détail',
    modify:              'Modifier',
    health:              'Santé',
    export:              'Exporter',
    viewAll:             'Voir tout',
    nextPage:            'Page suivante',
    previousPage:        'Page précédente',
    new:                 'Nouveau',

    search:              'Recherche',
    status:              'Statut',
    from:                'Du',
    to:                  'Au',
    date:                'Date',
    name:                'Nom',
    email:               'Email',

    demoFootnote:        'données fictives — branchez un token admin valide pour voir les vraies',

    apiErrorTitle:       'API admin indisponible — affichage en mode démo',
    apiErrorFallback:    'API injoignable',

    emptyForFilters:     'Aucun résultat pour ces filtres.',

    statusOnline:        'en ligne',
    statusOffline:       'hors ligne',
    statusMaintenance:   'maintenance',
    statusDecommissioned:'désactivé',

    noData:              'aucune donnée',
    noDataPeriod:        'aucune donnée sur la période',
    loading:             'Chargement…',
    never:               'jamais',
  },
  en: {
    demo:                'Demo',
    all:                 'All',
    none:                'None',
    unknown:             'Unknown',

    refresh:             'Refresh',
    filter:              'Filter',
    reset:               'Reset',
    cancel:              'Cancel',
    save:                'Save',
    create:              'Create',
    edit:                'Edit',
    delete:              'Delete',
    back:                'Back',
    detail:              'Detail',
    modify:              'Edit',
    health:              'Health',
    export:              'Export',
    viewAll:             'View all',
    nextPage:            'Next page',
    previousPage:        'Previous page',
    new:                 'New',

    search:              'Search',
    status:              'Status',
    from:                'From',
    to:                  'To',
    date:                'Date',
    name:                'Name',
    email:               'Email',

    demoFootnote:        'sample data — connect a valid admin token to see real data',

    apiErrorTitle:       'Admin API unavailable — falling back to demo data',
    apiErrorFallback:    'API unreachable',

    emptyForFilters:     'No results for these filters.',

    statusOnline:        'online',
    statusOffline:       'offline',
    statusMaintenance:   'maintenance',
    statusDecommissioned:'decommissioned',

    noData:              'no data',
    noDataPeriod:        'no data for the period',
    loading:             'Loading…',
    never:               'never',
  },
}

export function commonStrings(lang: Lang): Record<CommonKey, string> {
  return STRINGS[lang]
}

/**
 * Libellé localisé pour un statut de distributeur.
 *
 * L'enum côté DB / API reste `online | offline | maintenance | decommissioned`
 * (technique, anglais) mais on traduit l'affichage utilisateur : "en ligne",
 * "hors ligne", "désactivé" en FR · "online", "offline", "decommissioned"
 * en EN.
 */
export type DistributorStatus = 'online' | 'offline' | 'maintenance' | 'decommissioned'

export function distributorStatusLabel(lang: Lang, status: DistributorStatus): string {
  const t = commonStrings(lang)
  switch (status) {
    case 'online':         return t.statusOnline
    case 'offline':        return t.statusOffline
    case 'maintenance':    return t.statusMaintenance
    case 'decommissioned': return t.statusDecommissioned
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Format helpers (date, time, relative time)
// ──────────────────────────────────────────────────────────────────────────

const LOCALES: Record<Lang, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
}

/** Locale BCP-47 à passer à `Intl` / `toLocaleString`. */
export function dateLocale(lang: Lang): string {
  return LOCALES[lang]
}

/** "il y a 30s" / "30s ago", "il y a 5min" / "5min ago", etc. */
export function fmtRelative(lang: Lang, iso: string | null): string {
  if (!iso) return '—'
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (lang === 'en') {
    if (diffSec < 60) return `${diffSec}s ago`
    if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`
    if (diffSec < 86_400) return `${Math.round(diffSec / 3600)}h ago`
    return `${Math.round(diffSec / 86_400)}d ago`
  }
  if (diffSec < 60) return `il y a ${diffSec}s`
  if (diffSec < 3600) return `il y a ${Math.round(diffSec / 60)}min`
  if (diffSec < 86_400) return `il y a ${Math.round(diffSec / 3600)}h`
  return `il y a ${Math.round(diffSec / 86_400)}j`
}

/** Date courte localisée : "21/05/2026" (fr) / "21/05/2026" (en-GB). */
export function fmtDateShort(lang: Lang, iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(LOCALES[lang])
}

/** Date + heure : "21/05/26, 14:30". */
export function fmtDateTime(lang: Lang, iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(LOCALES[lang], {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

/** "vendredi 21 mai" (fr) / "Friday 21 May" (en). Pour le sous-titre home. */
export function fmtToday(lang: Lang): string {
  return new Date().toLocaleDateString(LOCALES[lang], {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}
