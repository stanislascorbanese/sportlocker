// Communes → pages locales SEO (/communes/[slug]).
//
// Deux tiers, volontairement séparés pour ne JAMAIS mentir sur la présence du
// service :
//
//   • COMMUNES (Tier 1) — villes où des distributeurs sont réellement installés.
//     Ce sont elles, et elles seules, que /couverture affiche comme « déjà
//     déployées ». La page locale parle du service au présent.
//
//   • UPCOMING_COMMUNES (Tier 2) — grandes villes SANS distributeur encore.
//     Pages d'atterrissage honnêtes « pas encore de distributeur → demander une
//     installation ». Aucune affirmation de présence, aucun schema Product/Offer
//     actif (ce serait trompeur). Chaque `intro` reste UNIQUE et ancrée sur des
//     lieux réels de la ville pour éviter le contenu mince/dupliqué (doorway →
//     pénalité Google). NE JAMAIS fusionner ces entrées dans COMMUNES.

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
  /** Renseigné pour les grandes villes Tier 2 (facultatif en Tier 1). */
  region?: string
  /** Population INSEE indicative — contexte SEO (Tier 2). */
  population?: number
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

// Tier 2 — grandes villes ciblées SEO, SANS distributeur installé à ce jour.
// Voir l'avertissement en tête de fichier : contenu honnête « bientôt », jamais
// fusionné dans COMMUNES, jamais affiché comme « couvert » sur /couverture.
export const UPCOMING_COMMUNES: Commune[] = [
  {
    slug: 'paris',
    name: 'Paris',
    postalCode: '75000',
    department: 'Paris',
    departmentCode: '75',
    region: 'Île-de-France',
    population: 2133111,
    intro:
      "SportLocker n'a pas encore installé de distributeur à Paris, mais la capitale "
      + "— ses quais de Seine, ses bois et ses centaines de terrains de proximité — est "
      + "un terrain idéal pour le matériel sportif en libre-service 24/7. Dès qu'un "
      + "arrondissement, un bailleur ou un équipement parisien ouvre un site, l'emprunt "
      + "par QR code y devient possible en 30 secondes.",
    context:
      "Des berges de Seine aux Buttes-Chaumont, du bois de Vincennes aux city-stades du "
      + "périph : Paris ne manque pas d'endroits où un ballon ou une raquette transforme "
      + "une pause en séance de sport.",
  },
  {
    slug: 'lyon',
    name: 'Lyon',
    postalCode: '69000',
    department: 'Rhône',
    departmentCode: '69',
    region: 'Auvergne-Rhône-Alpes',
    population: 522250,
    intro:
      "À Lyon, SportLocker n'a pas encore de casier connecté, mais les berges du Rhône "
      + "et le parc de la Tête d'Or appellent un accès au matériel sportif sans guichet ni "
      + "horaires. Le service se déploie à la demande des collectivités et établissements "
      + "lyonnais — emprunt par QR code, retour sur place.",
    context:
      "Parc de la Tête d'Or, berges du Rhône et de la Saône, quartier de la Confluence : "
      + "autant de lieux où le sport spontané n'attend qu'un distributeur.",
  },
  {
    slug: 'marseille',
    name: 'Marseille',
    postalCode: '13000',
    department: 'Bouches-du-Rhône',
    departmentCode: '13',
    region: "Provence-Alpes-Côte d'Azur",
    population: 873076,
    intro:
      "Marseille n'a pas encore son distributeur SportLocker, mais entre les plages du "
      + "Prado, les calanques et les terrains de quartier, le matériel sportif en "
      + "libre-service 24/7 y trouverait vite son public. L'installation se fait à la "
      + "demande d'une mairie de secteur, d'un camping ou d'un hôtel.",
    context:
      "Du parc Borély aux plages du Prado en passant par le littoral des calanques : "
      + "Marseille vit le sport dehors, toute l'année.",
  },
  {
    slug: 'toulouse',
    name: 'Toulouse',
    postalCode: '31000',
    department: 'Haute-Garonne',
    departmentCode: '31',
    region: 'Occitanie',
    population: 504078,
    intro:
      "À Toulouse, le service SportLocker n'est pas encore actif, mais la Prairie des "
      + "Filtres et les bords de Garonne se prêtent parfaitement au matériel sportif en "
      + "libre-service. Dès qu'un site toulousain s'équipe, on emprunte ballons et "
      + "raquettes par QR code, sans dépôt ni horaires.",
    context:
      "Bords de Garonne, Prairie des Filtres, parc de la Ramée : la Ville rose ne manque "
      + "pas d'espaces pour une séance improvisée.",
  },
  {
    slug: 'nice',
    name: 'Nice',
    postalCode: '06000',
    department: 'Alpes-Maritimes',
    departmentCode: '06',
    region: "Provence-Alpes-Côte d'Azur",
    population: 342669,
    intro:
      "Nice n'accueille pas encore de casier SportLocker, mais la promenade des Anglais "
      + "et le parc Phoenix sont taillés pour le sport en libre-service 24/7. Le "
      + "déploiement se déclenche à la demande de la ville, d'un hôtel ou d'un camping "
      + "azuréen.",
    context:
      "Promenade des Anglais, colline du Château, parc Phoenix : à Nice, la mer et le "
      + "soleil invitent au sport presque toute l'année.",
  },
  {
    slug: 'strasbourg',
    name: 'Strasbourg',
    postalCode: '67000',
    department: 'Bas-Rhin',
    departmentCode: '67',
    region: 'Grand Est',
    population: 291313,
    intro:
      "À Strasbourg, SportLocker n'a pas encore posé ses distributeurs, mais le parc de "
      + "l'Orangerie et les berges de l'Ill offrent le décor idéal pour du matériel "
      + "sportif en libre-service. L'emprunt par QR code arrive dès qu'un site "
      + "strasbourgeois ouvre.",
    context:
      "Parc de l'Orangerie, bords de l'Ill, écoquartier des Deux-Rives : Strasbourg "
      + "conjugue vélo, running et sports de plein air.",
  },
  {
    slug: 'montpellier',
    name: 'Montpellier',
    postalCode: '34000',
    department: 'Hérault',
    departmentCode: '34',
    region: 'Occitanie',
    population: 299096,
    intro:
      "Montpellier attend encore son distributeur SportLocker, mais les berges du Lez et "
      + "le parc Montcalm sont parfaits pour emprunter du matériel sportif sans "
      + "contrainte. Le service se met en place à la demande des collectivités et "
      + "établissements héraultais.",
    context:
      "Promenade du Peyrou, berges du Lez, parc Montcalm : Montpellier, ville jeune et "
      + "étudiante, respire le sport en extérieur.",
  },
  {
    slug: 'bordeaux',
    name: 'Bordeaux',
    postalCode: '33000',
    department: 'Gironde',
    departmentCode: '33',
    region: 'Nouvelle-Aquitaine',
    population: 261804,
    intro:
      "À Bordeaux, aucun casier SportLocker n'est encore installé, mais les quais de "
      + "Garonne et le Jardin public appellent le matériel sportif en libre-service 24/7. "
      + "Dès qu'un site bordelais s'équipe, l'emprunt se fait en 30 secondes par QR code.",
    context:
      "Quais de Garonne, parc bordelais, Jardin public : Bordeaux court, roule et joue le "
      + "long de son fleuve.",
  },
  {
    slug: 'lille',
    name: 'Lille',
    postalCode: '59000',
    department: 'Nord',
    departmentCode: '59',
    region: 'Hauts-de-France',
    population: 236234,
    intro:
      "Lille n'a pas encore de distributeur SportLocker, mais le parc de la Citadelle, "
      + "le « poumon vert » lillois, est idéal pour du matériel sportif accessible à "
      + "toute heure. L'installation se fait à la demande d'une mairie ou d'un "
      + "établissement des Hauts-de-France.",
    context:
      "Bois de la Deûle, parc de la Citadelle, city-stades des quartiers : Lille bouge "
      + "par tous les temps.",
  },
  {
    slug: 'rennes',
    name: 'Rennes',
    postalCode: '35000',
    department: 'Ille-et-Vilaine',
    departmentCode: '35',
    region: 'Bretagne',
    population: 220488,
    intro:
      "À Rennes, le service SportLocker n'est pas encore actif, mais le parc du Thabor "
      + "et les prairies Saint-Martin se prêtent au matériel sportif en libre-service. "
      + "Dès qu'un site rennais ouvre, on emprunte par QR code, sans guichet.",
    context:
      "Parc du Thabor, prairies Saint-Martin, bords de la Vilaine : Rennes, ville "
      + "étudiante, ne manque pas d'occasions de bouger.",
  },
  {
    slug: 'reims',
    name: 'Reims',
    postalCode: '51100',
    department: 'Marne',
    departmentCode: '51',
    region: 'Grand Est',
    population: 181194,
    intro:
      "Reims attend encore ses distributeurs SportLocker, mais le parc de Champagne et "
      + "la coulée verte de la Vesle offrent un cadre parfait pour du matériel sportif "
      + "24/7. Le déploiement se fait à la demande de la ville ou d'un établissement "
      + "rémois.",
    context:
      "Parc de Champagne, coulée verte de la Vesle, parc de la Patte d'Oie : Reims "
      + "combine patrimoine et sport de plein air.",
  },
  {
    slug: 'le-havre',
    name: 'Le Havre',
    postalCode: '76600',
    department: 'Seine-Maritime',
    departmentCode: '76',
    region: 'Normandie',
    population: 165830,
    intro:
      "Au Havre, SportLocker n'a pas encore installé de casier, mais la longue plage et "
      + "la forêt de Montgeon sont idéales pour emprunter du matériel sportif en "
      + "libre-service. L'installation se déclenche à la demande d'une collectivité ou "
      + "d'un établissement havrais.",
    context:
      "Plage du Havre, forêt de Montgeon, front de mer : la cité Perret invite au sport "
      + "face à la Manche.",
  },
  {
    slug: 'saint-etienne',
    name: 'Saint-Étienne',
    postalCode: '42000',
    department: 'Loire',
    departmentCode: '42',
    region: 'Auvergne-Rhône-Alpes',
    population: 174337,
    intro:
      "Saint-Étienne n'a pas encore de distributeur SportLocker, mais le parc de "
      + "l'Europe et les abords du stade Geoffroy-Guichard appellent du matériel sportif "
      + "accessible à toute heure. Le service arrive dès qu'un site stéphanois s'équipe.",
    context:
      "Parc de l'Europe, gorges du Furan, chaudron de Geoffroy-Guichard : Saint-Étienne "
      + "a le sport dans l'ADN.",
  },
  {
    slug: 'toulon',
    name: 'Toulon',
    postalCode: '83000',
    department: 'Var',
    departmentCode: '83',
    region: "Provence-Alpes-Côte d'Azur",
    population: 179454,
    intro:
      "À Toulon, le service SportLocker n'est pas encore déployé, mais les plages du "
      + "Mourillon et le mont Faron sont parfaits pour du matériel sportif en "
      + "libre-service 24/7. L'emprunt par QR code arrive dès qu'un site varois ouvre.",
    context:
      "Plages du Mourillon, mont Faron, rade de Toulon : entre mer et collines, le sport "
      + "se pratique dehors toute l'année.",
  },
  {
    slug: 'grenoble',
    name: 'Grenoble',
    postalCode: '38000',
    department: 'Isère',
    departmentCode: '38',
    region: 'Auvergne-Rhône-Alpes',
    population: 158240,
    intro:
      "Grenoble attend encore son distributeur SportLocker, mais le parc Paul-Mistral et "
      + "les berges de l'Isère se prêtent au matériel sportif accessible sans horaires. "
      + "Le déploiement se fait à la demande des collectivités et établissements isérois.",
    context:
      "Parc Paul-Mistral, berges de l'Isère, montée de la Bastille : capitale des Alpes, "
      + "Grenoble est une ville de sportifs.",
  },
  {
    slug: 'dijon',
    name: 'Dijon',
    postalCode: '21000',
    department: "Côte-d'Or",
    departmentCode: '21',
    region: 'Bourgogne-Franche-Comté',
    population: 158002,
    intro:
      "À Dijon, aucun casier SportLocker n'est encore posé, mais le lac Kir et le parc "
      + "de la Colombière sont idéaux pour emprunter du matériel sportif en libre-service. "
      + "Dès qu'un site dijonnais s'équipe, l'emprunt se fait par QR code.",
    context:
      "Lac Kir, parc de la Colombière, jardin Darcy : Dijon offre de larges espaces verts "
      + "pour bouger.",
  },
  {
    slug: 'angers',
    name: 'Angers',
    postalCode: '49000',
    department: 'Maine-et-Loire',
    departmentCode: '49',
    region: 'Pays de la Loire',
    population: 155850,
    intro:
      "Angers n'a pas encore de distributeur SportLocker, mais le lac de Maine et les "
      + "bords de Maine appellent un accès au matériel sportif 24/7. L'installation se "
      + "fait à la demande d'une mairie, d'un camping ou d'un hôtel angevin.",
    context:
      "Lac de Maine, parc de la Garenne, bords de Maine : Angers, régulièrement primée "
      + "pour son cadre de vie, respire le plein air.",
  },
  {
    slug: 'nimes',
    name: 'Nîmes',
    postalCode: '30000',
    department: 'Gard',
    departmentCode: '30',
    region: 'Occitanie',
    population: 148561,
    intro:
      "À Nîmes, le service SportLocker n'est pas encore actif, mais les jardins de la "
      + "Fontaine et le plateau des Costières sont parfaits pour du matériel sportif en "
      + "libre-service. Dès qu'un site nîmois ouvre, on emprunte en 30 secondes par "
      + "QR code.",
    context:
      "Jardins de la Fontaine, plateau des Costières, garrigue toute proche : Nîmes se "
      + "prête au sport en extérieur presque toute l'année.",
  },
  {
    slug: 'villeurbanne',
    name: 'Villeurbanne',
    postalCode: '69100',
    department: 'Rhône',
    departmentCode: '69',
    region: 'Auvergne-Rhône-Alpes',
    population: 156929,
    intro:
      "Villeurbanne n'accueille pas encore de casier SportLocker, mais le parc de la "
      + "Feyssine, en bord de Rhône, est idéal pour du matériel sportif accessible à "
      + "toute heure. Le déploiement se déclenche à la demande de la ville ou d'un "
      + "établissement villeurbannais.",
    context:
      "Parc de la Feyssine, quartier des Gratte-Ciel, city-stades de Cusset : "
      + "Villeurbanne, jeune et dense, bouge au quotidien.",
  },
]
