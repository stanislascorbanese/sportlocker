import type { Lang } from '../lang'

type DistributorsKey =
  // En-tête + sous-titre liste
  | 'pageTitle' | 'metaTitle'
  | 'subtitle1' | 'subtitleMany' | 'lockersFree' | 'lockersFreeOf'
  | 'newDistributor'
  // États vides / erreurs
  | 'emptyState' | 'emptyHint'
  // En-têtes de table
  | 'colDistributor' | 'colStatus' | 'colLockersFree' | 'colBattery'
  | 'colPosition' | 'colLastSeen' | 'colActions'
  // Modificateurs
  | 'distributorsCount1' | 'distributorsCountMany'
  // Page détail /distributors/[id]
  | 'detailMetaTitle'
  | 'backToList' | 'btnEdit' | 'never'
  | 'emptyCount' | 'loadedSuffix' | 'inCirculation' | 'faultSuffix'
  | 'kpiFreeForLoad' | 'kpiLoadedIdle' | 'kpiActiveReservations'
  | 'kpiBatteryLastSeen'
  | 'sectionGrid'
  | 'gridEmpty' | 'gridCellLockerAria'
  | 'tonneIdleEmpty' | 'toneIdleLoaded' | 'toneReserved' | 'toneActive'
  | 'toneReturning' | 'toneFault'
  | 'cellFaultPlaceholder' | 'cellEmptyPlaceholder'
  | 'infoAddress' | 'infoCoords' | 'infoCommune'
  // Temps réel (WebSocket)
  | 'liveConnecting' | 'liveOn' | 'liveReconnecting' | 'liveOffline' | 'liveOfflineHint'
  // Edit page
  | 'editMetaTitle' | 'back'
  // New page
  | 'newMetaTitle' | 'newTitle' | 'newSubtitle'
  // Create/Edit form
  | 'formName' | 'formSerial' | 'formSerialReadOnly'
  | 'formStatus'
  | 'formCommuneSelect' | 'formCommunePlaceholder' | 'formCommuneRequired'
  | 'formCommuneUuid' | 'formCommuneUuidHint' | 'formCommuneCreateLink'
  | 'formCommuneAutoSelected' | 'formCommuneAutoMissing'
  | 'formAddressLineHint' | 'formAddressLine'
  | 'formAddress' | 'formAddressHint'
  | 'formLatitude' | 'formLongitude' | 'formCoordsHint'
  | 'formLockerCount' | 'formLockerCountHint'
  | 'formFirmware'
  | 'btnCancel' | 'btnCreate' | 'btnCreating' | 'btnSave' | 'btnSaving'
  | 'formErrorTitle'
  // AddressAutocomplete
  | 'aaPlaceholder' | 'aaLoading' | 'aaSourceLine'
  | 'aaAutoFilled'
  | 'kbdNavigate' | 'kbdSelect' | 'kbdClose'
  // MapPicker
  | 'mpAria' | 'mpHint' | 'mpPlaceholder'
  // LoadLockerDrawer
  | 'lockerLoadCta' | 'lockerLoadDemoBlocker'
  | 'lockerLoadAria' | 'lockerLoadTitle'
  | 'lockerLoadSubtitle' | 'lockerLoadSubmitting' | 'lockerLoadSubmit'
  | 'lockerLoadFieldLocker' | 'lockerLoadFieldType' | 'lockerLoadFieldRfid'
  | 'lockerLoadFieldRfidHint'
  | 'lockerLoadSelectLocker' | 'lockerLoadSelectType'
  | 'lockerLoadSuccess' | 'lockerLoadError'

const STRINGS: Record<Lang, Record<DistributorsKey, string>> = {
  fr: {
    pageTitle:              'Parc de distributeurs',
    metaTitle:              'Distributeurs · SportLocker ops',
    subtitle1:              'distributeur',
    subtitleMany:           'distributeurs',
    lockersFree:            'casier libre',
    lockersFreeOf:          'casiers libres',
    newDistributor:         '+ Nouveau',
    emptyState:             'Aucun distributeur en base. Créez-en un via',
    emptyHint:              'POST /v1/distributors',
    colDistributor:         'Distributeur',
    colStatus:              'Statut',
    colLockersFree:         'Casiers libres',
    colBattery:             'Batterie',
    colPosition:            'Position',
    colLastSeen:            'Dernier signe',
    colActions:             'Actions',
    distributorsCount1:     'distributeur',
    distributorsCountMany:  'distributeurs',

    detailMetaTitle:        'Distributeur · SportLocker ops',
    backToList:             '← Distributeurs',
    btnEdit:                'Modifier',
    never:                  'jamais',
    emptyCount:             'vides',
    loadedSuffix:           'chargés',
    inCirculation:          'en circulation',
    faultSuffix:            'en panne',
    kpiFreeForLoad:         'Casiers libres pour chargement',
    kpiLoadedIdle:          'Articles chargés (idle)',
    kpiActiveReservations:  'Réservations en cours',
    kpiBatteryLastSeen:     'Batterie / dernier signe',
    sectionGrid:            'Grille des casiers',
    gridEmpty:              'Aucun casier configuré pour ce distributeur.',
    gridCellLockerAria:     'Casier',
    tonneIdleEmpty:         'Vide',
    toneIdleLoaded:         'Idle',
    toneReserved:           'Réservé',
    toneActive:             'En cours',
    toneReturning:          'Retour',
    toneFault:              'Panne',
    cellFaultPlaceholder:   'À diagnostiquer',
    cellEmptyPlaceholder:   'Casier vide',
    infoAddress:            'Adresse',
    infoCoords:             'Coordonnées GPS',
    infoCommune:            'Commune',
    liveConnecting:         'Connexion temps réel…',
    liveOn:                 'Temps réel',
    liveReconnecting:       'Reconnexion…',
    liveOffline:            'Hors ligne',
    liveOfflineHint:        'Temps réel indisponible — les données peuvent être en retard. Rafraîchissez pour resynchroniser.',

    editMetaTitle:          'Modifier distributeur · SportLocker ops',
    back:                   '← Retour',

    newMetaTitle:           'Nouveau distributeur · SportLocker ops',
    newTitle:               'Nouveau distributeur',
    newSubtitle:            'Renseigne les informations du distributeur. Tu pourras éditer l\'adresse, la position et le statut plus tard.',

    formName:               'Nom (lisible)',
    formSerial:             'Numéro de série',
    formSerialReadOnly:     'Non modifiable après création',
    formStatus:             'Statut',
    formCommuneSelect:      'Commune',
    formCommunePlaceholder: 'Sélectionnez une commune…',
    formCommuneRequired:    'Une commune est requise pour rattacher le distributeur.',
    formCommuneUuid:        'Commune (UUID)',
    formCommuneUuidHint:    "Aucune commune chargée — saisir l'UUID directement.",
    formCommuneCreateLink:  '+ créer une nouvelle commune',
    formCommuneAutoSelected:'Commune %s sélectionnée automatiquement (INSEE %i).',
    formCommuneAutoMissing: "Commune INSEE %i (%c) absente de la liste — créez-la d'abord ou sélectionnez-la manuellement.",
    formAddressLine:        'Adresse postale',
    formAddressLineHint:    "Auto-remplie depuis la recherche d'adresse, modifiable",
    formAddress:            'Adresse',
    formAddressHint:        'Optionnel · format libre, affiché tel quel dans le dashboard',
    formLatitude:           'Latitude',
    formLongitude:          'Longitude',
    formCoordsHint:         'WGS84 décimal · ex. 47.2184',
    formLockerCount:        'Nombre de casiers',
    formLockerCountHint:    'Doit correspondre à la grille physique du distributeur',
    formFirmware:           'Version firmware',
    btnCancel:              'Annuler',
    btnCreate:              'Créer le distributeur',
    btnCreating:            'Création…',
    btnSave:                'Enregistrer',
    btnSaving:              'Enregistrement…',
    formErrorTitle:         'Validation échouée',

    aaPlaceholder:          '🔎 Rechercher une adresse (auto-remplit position)',
    aaLoading:              'Recherche…',
    aaSourceLine:           'Source : data.gouv.fr · adresse-api',
    aaAutoFilled:           '✓ Auto-rempli',
    kbdNavigate:            'naviguer',
    kbdSelect:              'sélectionner',
    kbdClose:               'fermer',

    mpAria:                 'Carte de positionnement',
    mpHint:                 'Cliquer ou glisser le marqueur pour positionner précisément',
    mpPlaceholder:          'Renseigne une adresse ci-dessus ou clique sur la carte',

    lockerLoadCta:          '+ Charger un casier',
    lockerLoadDemoBlocker:  'Mode démo — branchez un token admin valide pour charger un casier.',
    lockerLoadAria:         'Charger un casier',
    lockerLoadTitle:        'Charger un casier',
    lockerLoadSubtitle:     'Sélectionne un casier vide et l\'article à y placer. Le RFID est scanné ou saisi à la main.',
    lockerLoadSubmitting:   'Chargement…',
    lockerLoadSubmit:       'Charger',
    lockerLoadFieldLocker:  'Casier',
    lockerLoadFieldType:    'Type d\'article',
    lockerLoadFieldRfid:    'Tag RFID',
    lockerLoadFieldRfidHint:'Identifiant unique scanné ou saisi (min. 4 caractères)',
    lockerLoadSelectLocker: '— Sélectionner un casier —',
    lockerLoadSelectType:   '— Sélectionner un type —',
    lockerLoadSuccess:      'Casier chargé.',
    lockerLoadError:        'Le chargement a échoué.',
  },
  en: {
    pageTitle:              'Distributor fleet',
    metaTitle:              'Distributors · SportLocker ops',
    subtitle1:              'distributor',
    subtitleMany:           'distributors',
    lockersFree:            'locker free',
    lockersFreeOf:          'lockers free',
    newDistributor:         '+ New',
    emptyState:             'No distributors yet. Create one via',
    emptyHint:              'POST /v1/distributors',
    colDistributor:         'Distributor',
    colStatus:              'Status',
    colLockersFree:         'Free lockers',
    colBattery:             'Battery',
    colPosition:            'Position',
    colLastSeen:            'Last seen',
    colActions:             'Actions',
    distributorsCount1:     'distributor',
    distributorsCountMany:  'distributors',

    detailMetaTitle:        'Distributor · SportLocker ops',
    backToList:             '← Distributors',
    btnEdit:                'Edit',
    never:                  'never',
    emptyCount:             'empty',
    loadedSuffix:           'loaded',
    inCirculation:          'in circulation',
    faultSuffix:            'in fault',
    kpiFreeForLoad:         'Lockers free to load',
    kpiLoadedIdle:          'Loaded items (idle)',
    kpiActiveReservations:  'Active reservations',
    kpiBatteryLastSeen:     'Battery / last seen',
    sectionGrid:            'Locker grid',
    gridEmpty:              'No locker configured for this distributor.',
    gridCellLockerAria:     'Locker',
    tonneIdleEmpty:         'Empty',
    toneIdleLoaded:         'Idle',
    toneReserved:           'Reserved',
    toneActive:             'Active',
    toneReturning:          'Returning',
    toneFault:              'Fault',
    cellFaultPlaceholder:   'Needs diagnosis',
    cellEmptyPlaceholder:   'Empty locker',
    infoAddress:            'Address',
    infoCoords:             'GPS coordinates',
    infoCommune:            'Commune',
    liveConnecting:         'Connecting live…',
    liveOn:                 'Live',
    liveReconnecting:       'Reconnecting…',
    liveOffline:            'Offline',
    liveOfflineHint:        'Live updates unavailable — data may be stale. Refresh to resync.',

    editMetaTitle:          'Edit distributor · SportLocker ops',
    back:                   '← Back',

    newMetaTitle:           'New distributor · SportLocker ops',
    newTitle:               'New distributor',
    newSubtitle:            'Fill in the distributor info. You will be able to edit address, position and status later.',

    formName:               'Name (human-readable)',
    formSerial:             'Serial number',
    formSerialReadOnly:     'Cannot be edited after creation',
    formStatus:             'Status',
    formCommuneSelect:      'Commune',
    formCommunePlaceholder: 'Select a commune…',
    formCommuneRequired:    'A commune is required to attach the distributor.',
    formCommuneUuid:        'Commune (UUID)',
    formCommuneUuidHint:    'No commune loaded — type the UUID directly.',
    formCommuneCreateLink:  '+ create a new commune',
    formCommuneAutoSelected:'Commune %s auto-selected (INSEE %i).',
    formCommuneAutoMissing: 'Commune INSEE %i (%c) not in the list — create it first or select manually.',
    formAddressLine:        'Postal address',
    formAddressLineHint:    'Auto-filled from address search, editable',
    formAddress:            'Address',
    formAddressHint:        'Optional · free-form, displayed as-is in the dashboard',
    formLatitude:           'Latitude',
    formLongitude:          'Longitude',
    formCoordsHint:         'Decimal WGS84 · e.g. 47.2184',
    formLockerCount:        'Locker count',
    formLockerCountHint:    "Must match the distributor's physical grid",
    formFirmware:           'Firmware version',
    btnCancel:              'Cancel',
    btnCreate:              'Create distributor',
    btnCreating:            'Creating…',
    btnSave:                'Save',
    btnSaving:              'Saving…',
    formErrorTitle:         'Validation failed',

    aaPlaceholder:          '🔎 Search an address (auto-fills position)',
    aaLoading:              'Searching…',
    aaSourceLine:           'Source: data.gouv.fr · adresse-api',
    aaAutoFilled:           '✓ Auto-filled',
    kbdNavigate:            'navigate',
    kbdSelect:              'select',
    kbdClose:               'close',

    mpAria:                 'Positioning map',
    mpHint:                 'Click or drag the marker to position precisely',
    mpPlaceholder:          'Enter an address above or click on the map',

    lockerLoadCta:          '+ Load a locker',
    lockerLoadDemoBlocker:  'Demo mode — connect a valid admin token to load a locker.',
    lockerLoadAria:         'Load a locker',
    lockerLoadTitle:        'Load a locker',
    lockerLoadSubtitle:     'Select an empty locker and the item to place. RFID is scanned or entered by hand.',
    lockerLoadSubmitting:   'Loading…',
    lockerLoadSubmit:       'Load',
    lockerLoadFieldLocker:  'Locker',
    lockerLoadFieldType:    'Item type',
    lockerLoadFieldRfid:    'RFID tag',
    lockerLoadFieldRfidHint:'Unique identifier scanned or typed (min. 4 chars)',
    lockerLoadSelectLocker: '— Select a locker —',
    lockerLoadSelectType:   '— Select a type —',
    lockerLoadSuccess:      'Locker loaded.',
    lockerLoadError:        'Loading failed.',
  },
}

export function distributorsStrings(lang: Lang): Record<DistributorsKey, string> {
  return STRINGS[lang]
}
