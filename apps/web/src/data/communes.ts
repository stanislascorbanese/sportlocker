// Communes avec présence SportLocker → pages locales SEO (/communes/[slug]).
//
// ⚠️ Tier 1 uniquement : on ne crée des pages QUE pour les villes où le service
// existe réellement (distributeurs installés). Pas de génération massive de
// communes sans service (= contenu mince/doorway → pénalité Google).
// Chaque entrée doit avoir un `intro` UNIQUE (pas de duplication).

export interface Commune {
  slug: string
  name: string
  postalCode: string
  department: string
  departmentCode: string
  /** Paragraphe d'intro UNIQUE par ville (évite le contenu dupliqué). */
  intro: string
  /** Contexte local (lieux/sports) pour personnaliser la page. */
  context: string
}

export const COMMUNES: Commune[] = [
  {
    slug: 'nantes',
    name: 'Nantes',
    postalCode: '44000',
    department: 'Loire-Atlantique',
    departmentCode: '44',
    intro:
      "À Nantes, SportLocker installe des distributeurs de matériel sportif en "
      + "libre-service 24/7 sur les terrains publics, bords de Loire et parcs de la "
      + "métropole. Ballons, raquettes et équipements s'empruntent en 30 secondes "
      + "via QR code — sans guichet, sans horaires, sans rien emporter.",
    context:
      "Des bords de l'Erdre à l'île de Nantes, les Nantais accèdent au sport "
      + "spontané à toute heure.",
  },
  {
    slug: 'basse-goulaine',
    name: 'Basse-Goulaine',
    postalCode: '44115',
    department: 'Loire-Atlantique',
    departmentCode: '44',
    intro:
      "À Basse-Goulaine, aux portes de Nantes, SportLocker propose du matériel "
      + "sportif en libre-service 24/7 sur les espaces publics de la commune. "
      + "Ballons et équipements s'empruntent en 30 secondes via QR code, sans "
      + "guichet ni horaires.",
    context:
      "Bords de Loire, complexes sportifs et écoles : un accès au matériel de sport "
      + "sans contrainte, au cœur du vignoble nantais.",
  },
  {
    slug: 'la-roche-sur-yon',
    name: 'La Roche-sur-Yon',
    postalCode: '85000',
    department: 'Vendée',
    departmentCode: '85',
    intro:
      "À La Roche-sur-Yon, SportLocker met du matériel sportif à disposition en "
      + "libre-service 24/7 sur les espaces publics et campus de la préfecture "
      + "vendéenne. Emprunt via QR code, casier connecté, retour sur place — "
      + "le sport accessible quand on veut.",
    context:
      "Étudiants de l'Icam, familles des parcs yonnais et sportifs du Vendéspace : "
      + "un accès au matériel sans contrainte d'horaires.",
  },
  {
    slug: 'pornic',
    name: 'Pornic',
    postalCode: '44210',
    department: 'Loire-Atlantique',
    departmentCode: '44',
    intro:
      "À Pornic, SportLocker installe des distributeurs de matériel sportif en "
      + "libre-service 24/7 sur les terrains municipaux et les espaces balnéaires. "
      + "Ballons, raquettes et équipements de plage s'empruntent en 30 secondes "
      + "via QR code — sans guichet, disponibles toute la saison.",
    context:
      "Entre le front de mer, la voie verte et les terrains de sport du Pays de Retz : "
      + "du matériel accessible à toute heure pour les habitants et les estivants.",
  },
  {
    slug: 'saint-nazaire',
    name: 'Saint-Nazaire',
    postalCode: '44600',
    department: 'Loire-Atlantique',
    departmentCode: '44',
    intro:
      "À Saint-Nazaire, SportLocker déploie des casiers connectés sur les terrains "
      + "sportifs et espaces publics de l'agglomération. Emprunt via QR code en 30 secondes, "
      + "retour sur place — le sport spontané accessible 24h/24 aux Nazairiens.",
    context:
      "Du bassin de Saint-Nazaire au parc paysager de l'estuaire : des équipements "
      + "de sport en libre-service au plus près des habitants.",
  },
]
