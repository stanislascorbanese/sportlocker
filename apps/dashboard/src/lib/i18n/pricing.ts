import type { Lang } from '../lang'

type PricingKey =
  | 'pageTitle' | 'metaTitle'
  | 'subtitle' | 'slotsTariffedSuffix' | 'slotsTariffedTotal'
  | 'apiPrefix' | 'noCommunesInFleet'
  | 'noCommunesCreateFirst' | 'noItemTypesCreate'
  | 'goCommunes' | 'goItems'
  // Matrix
  | 'matrixTitle' | 'matrixHint'
  | 'colSport' | 'colCategory'
  | 'tooltipDayPass'
  // ApplyTemplate
  | 'templateTitle' | 'templateSubtitle'
  | 'btnApplyTemplate' | 'btnOverridePrices' | 'btnCancel'
  | 'feedbackRulesApplied1' | 'feedbackRulesAppliedMany' | 'feedbackApplied'
  | 'feedbackNoMatch' | 'feedbackError'
  // CommuneSelector
  | 'superAdminTag' | 'communeTariffLabel'
  | 'communeNone' | 'communeChoose'
  // PriceCell
  | 'priceAria' | 'priceInvalid'

const STRINGS: Record<Lang, Record<PricingKey, string>> = {
  fr: {
    pageTitle:               'Tarification',
    metaTitle:               'Tarification · SportLocker ops',
    subtitle:                "Prix d'affichage par sport et durée de créneau. Vide = ce créneau n'est pas proposé pour ce sport. Modèle MVP sans paiement : les montants sont informatifs côté citoyen.",
    slotsTariffedSuffix:     'créneaux tarifés',
    slotsTariffedTotal:      '/',
    apiPrefix:               'API :',
    noCommunesInFleet:       "Aucune commune dans le parc. Créez d'abord une commune dans",
    noCommunesCreateFirst:   "Aucune commune dans le parc.",
    noItemTypesCreate:       "Aucun item_type configuré. Créez d'abord des articles dans",
    goCommunes:              '/communes',
    goItems:                 '/items',
    matrixTitle:             'Matrice des prix',
    matrixHint:              'Tab/Enter pour valider une cellule, Escape pour annuler. Vider une cellule supprime la règle.',
    colSport:                'Sport / item_type',
    colCategory:             'Catégorie',
    tooltipDayPass:          "Forfait journée — 1 slot/jour à l'ouverture",
    templateTitle:           'Démarrer avec un template',
    templateSubtitle:        'Le matching item_type ↔ template se fait par substring sur catégorie/nom. Les prix existants sur les mêmes triplets seront écrasés.',
    btnApplyTemplate:        'Appliquer ce template',
    btnOverridePrices:       'Écraser les prix',
    btnCancel:               'Annuler',
    feedbackRulesApplied1:   'règle appliquée',
    feedbackRulesAppliedMany:'règles appliquées',
    feedbackApplied:         'Template appliqué',
    feedbackNoMatch:         'Ce template ne matche aucun de vos item_types existants. Saisissez les prix à la main dans la matrice ci-dessous, ou créez des item_types nommés ex. « raquette tennis », « ballon foot » pour qu\'ils matchent les catégories du template.',
    feedbackError:           'Erreur',
    superAdminTag:           'Super-admin',
    communeTariffLabel:      'Tarif de la commune :',
    communeNone:             'Aucune commune disponible',
    communeChoose:           '— Choisir une commune —',
    priceAria:               'Prix %d min en euros',
    priceInvalid:            'invalide',
  },
  en: {
    pageTitle:               'Pricing',
    metaTitle:               'Pricing · SportLocker ops',
    subtitle:                "Display price per sport and slot duration. Empty = this slot is not offered for this sport. MVP model without payment: amounts are informational for the citizen.",
    slotsTariffedSuffix:     'slots priced',
    slotsTariffedTotal:      '/',
    apiPrefix:               'API:',
    noCommunesInFleet:       'No commune in the fleet. First create a commune in',
    noCommunesCreateFirst:   'No commune in the fleet.',
    noItemTypesCreate:       'No item_type configured. First create items in',
    goCommunes:              '/communes',
    goItems:                 '/items',
    matrixTitle:             'Price matrix',
    matrixHint:              'Tab/Enter to commit a cell, Escape to cancel. Clearing a cell deletes the rule.',
    colSport:                'Sport / item_type',
    colCategory:             'Category',
    tooltipDayPass:          'Day pass — 1 slot/day at opening',
    templateTitle:           'Start from a template',
    templateSubtitle:        'item_type ↔ template matching is done by substring on category/name. Existing prices on the same triplets will be overwritten.',
    btnApplyTemplate:        'Apply this template',
    btnOverridePrices:       'Overwrite prices',
    btnCancel:               'Cancel',
    feedbackRulesApplied1:   'rule applied',
    feedbackRulesAppliedMany:'rules applied',
    feedbackApplied:         'Template applied',
    feedbackNoMatch:         "This template doesn't match any of your existing item_types. Set prices by hand in the matrix below, or create item_types like \"tennis racket\", \"football\" so they match the template categories.",
    feedbackError:           'Error',
    superAdminTag:           'Super-admin',
    communeTariffLabel:      'Commune tariff:',
    communeNone:             'No commune available',
    communeChoose:           '— Choose a commune —',
    priceAria:               'Price %d min in euros',
    priceInvalid:            'invalid',
  },
}

export function pricingStrings(lang: Lang): Record<PricingKey, string> {
  return STRINGS[lang]
}
