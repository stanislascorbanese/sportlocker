# Implantation dans l'armoire 9 compartiments

Suite directe de `BENCH_TEST.md` : une fois les étapes 1→6 vertes sur le banc,
ce document décrit **où et comment monter chaque composant dans l'armoire**.
Dimensions issues des fiches techniques (détail : `ASSEMBLY.html`).

> Prérequis : checklist « bascule vers l'armoire » de `BENCH_TEST.md` cochée.
> On ne câble rien dans l'armoire tant que le banc n'est pas 100 % validé.

---

## 0. Armoire retenue

Armoire de bureau acier 9 cases (3×3), **90 × 45 × 92,5 cm**, tôle laminée à
froid ~0,6 mm, portes à persiennes avec **serrure à came à clé** intégrée à la
poignée, kit de fixation murale fourni.

Conséquences directes de cette construction :

- **92,5 cm de haut seulement → fixation murale en hauteur OBLIGATOIRE** :
  caler le bas de l'armoire à ~0,65 m du sol pour que la rangée médiane (façade
  caméra/NFC) tombe à ~1,10–1,30 m. Posée au sol, la caméra serait à 45 cm.
- **Les serrures à came existantes sont réutilisées** :
  - case TECH → la serrure à clé d'origine **est** l'accès mainteneur, rien à
    modifier ;
  - cases équipées solénoïde → **démonter la came (languette)** mais laisser le
    barillet en place (bouche le trou, la poignée reste fonctionnelle) ;
  - cases non équipées → inchangées, à clé.
- **Persiennes des portes = ventilation gratuite** du compartiment TECH (pas de
  grilles Ø 40 mm à percer) et accès de secours possible (poussoir Ø 4 mm à
  travers une fente, aligné sur le pêne).
- **Tôle fine (~0,6 mm)** : rivnuts déconseillés. Fixations en **boulons M3
  traversants + écrous nylstop** (l'intérieur des cases est accessible).

---

## 1. Topologie retenue

Armoire 3×3, numérotation vue de face :

```
┌─────┬─────┬─────┐
│  1  │  2  │  3  │   rangée haute (~1,45 m avec pose murale)
├─────┼─────┼─────┤
│  4  │ TECH│  6  │   rangée médiane (~1,15 m)
├─────┼─────┼─────┤
│  7  │  8  │  9  │   rangée basse (~0,80 m)
└─────┴─────┴─────┘
```

- **Compartiment TECH = case 5 (centre)** : il héberge toute l'électronique.
  - Distances de câble symétriques vers les 8 autres portes (runs les plus
    courts possibles → chutes de tension minimales sur le 12 V).
  - Hauteur ~1,10–1,30 m = zone naturelle d'interaction utilisateur : la
    **façade** de cette porte devient le panneau caméra + NFC + consignes.
  - Sa porte est **fixée fermée** (vis intérieures ou serrure à clé batteur) —
    c'est l'accès mainteneur, pas un casier louable.
- **Phase pilote (4 solénoïdes)** : équiper les cases **2, 4, 6, 8**
  (adjacentes au TECH → runs de câble ≤ 40 cm, pas de traversée multiple).
  Les cases 1, 3, 7, 9 restent mécaniques/désactivées jusqu'à la commande des
  4 solénoïdes suivants.

---

## 2. Façade utilisateur (porte du compartiment TECH)

| Élément | Implantation | Contraintes fiche technique |
|---|---|---|
| Caméra Pi v3 | Fenêtre Ø 12 mm (objectif) derrière la porte, centrée, à ~1,25 m du sol | FoV 75°, autofocus 5 cm→∞ : le QR se présente à **10–25 cm**. Prévoir une **collerette anti-reflet** (tube 10 mm noir mat) si soleil rasant. Nappe CSI 22 broches : longueur standard 200 mm → caméra fixée **sur la porte**, boucle de mou pour l'ouverture |
| PN532 (NFC) | Collé au dos de la façade, zone marquée « badge ici » | Portée 3–5 cm **à travers plastique/bois uniquement**. ⚠️ **Si l'armoire est métallique : découpe 60×60 mm obligatoire + plaque PMMA/ABS 3 mm** vissée par-dessus, sinon le champ 13,56 MHz est écranté et rien ne lit |
| LED d'état (option) | Ø 5 mm au-dessus de la zone badge | Verte = ouvert accordé, rouge = refus. Déjà des GPIO libres (IN5–IN8 du relais inutilisés) |
| Consignes | Autocollant A6 : « 1. Réservez sur app.sportlocker.fr · 2. Présentez votre QR ici · 3. Le casier s'ouvre » | — |

Percements : Ø 12 mm caméra, découpe NFC si métal, Ø 6 mm LED. Ébavurer +
passe-fils caoutchouc sur chaque traversée.

---

## 3. Plaque de montage (intérieur du compartiment TECH)

Tout est vissé sur **une plaque support amovible** (contreplaqué 10 mm ou alu
2 mm, ~300 × 250 mm) fixée au fond du compartiment sur 4 entretoises. On
prépare et câble la plaque **sur l'établi**, puis on la pose d'un bloc.

Disposition (vue de face, plaque dans le compartiment) :

```
┌──────────────────────────────────┐
│  [alim 5V]   [alim 12V]          │  ← haut : les 2 blocs secteur
│  [WAGO 12V+ ] [WAGO GND commun]  │  ← borniers de distribution
│                                  │
│  [ CM4 IO Board 160×90 ]         │  ← milieu, connecteurs vers le bas
│                                  │
│  [ Relais 8CH 138×56 ]           │  ← bas, borniers COM/NO vers la droite
└──────────────────────────────────┘
```

| Module | Fixation | Note |
|---|---|---|
| CM4 IO Board (160×90 mm) | 4× M2,5 sur entretoises 10 mm | **Dissipateur collé sur le CM4 obligatoire** (armoire fermée = pas de convection). Jack 12 V J19 accessible |
| Relais 8CH (138×56 mm) | 4× M3 sur entretoises 6 mm | Borniers à vis orientés vers les passe-fils de sortie |
| Alims 5 V 4A + 12 V | Colliers + embase adhésive, ou rail DIN si dispo | Multiprise compacte dans le compartiment, **serre-câble (strain relief) sur l'arrivée 230 V** |
| Borniers WAGO (2×) | Vissés sur la plaque | Distribution **en étoile** : 1 borne 12 V+ et 1 borne GND **commune** (Pi + relais + alim 12 V). Jamais de daisy-chain de GND |

Ventilation : 2 grilles Ø 40 mm (haut et bas du compartiment TECH, en façade ou
sur le côté abrité) pour créer un tirage. Le CM4 throttle à 80 °C ; en plein
été dans une armoire fermée sans grille, on y arrive.

---

## 4. Solénoïdes sur les portes (cases 2, 4, 6, 8)

Le solénoïde ATOPLEE (27×29×18 mm, course ~10 mm, ressort de rappel =
**fail-secure**, verrouillé hors tension) se monte **sur la structure fixe**,
jamais sur la porte (le câble ne doit pas bouger).

1. **Position** : sur la **cloison verticale côté serrure** (fixation M3
   traversant + nylstop), à la hauteur de l'ancienne came. Le pêne sort
   **horizontalement** et s'engage **derrière le retour replié de la porte** —
   exactement là où la came d'origine se verrouillait ; dans la plupart des cas
   **aucune gâche rapportée n'est nécessaire**. Si le pêne ne tombe pas en face
   du pli : petite équerre en L percée Ø 11 mm vissée sur la porte.
2. **Alignement** : tolérance ±1 mm. Monter en trous oblongs pour régler, puis
   freiner les vis (frein-filet). Tester 20 ouvertures/fermetures manuelles.
   Ébavurer tous les perçages (la tôle fine coupe) — joint mousse adhésif sur
   le battant si la porte « sonne » contre le pêne au vent.
3. **La porte doit plaquer d'elle-même** : ajouter un aimant faible ou un
   ressort si la porte baille — un pêne qui frotte = solénoïde qui force =
   surchauffe (le pulse ne dure que 0,5 s, l'ouverture doit être franche).
4. **Diode 1N4007 soudée au plus près des cosses du solénoïde** (bande
   blanche/cathode côté +12 V), gaine thermo — pas au niveau du relais : la
   surtension inductive doit être écrêtée à la source.
5. **Ouverture de secours** : chaque compartiment équipé doit rester ouvrable
   mainteneur (accès arrière de l'armoire, ou trou de poussée discret Ø 4 mm
   axé sur le pêne). À définir selon la construction de l'armoire — ne pas
   condamner un casier fermé en cas de panne.

---

## 5. Câblage inter-compartiments

| Liaison | Câble | Section | Longueur max |
|---|---|---|---|
| Relais NO/COM → solénoïde | 2 conducteurs souples | **0,75 mm² (AWG18)** | ≤ 1 m : chute < 0,15 V à 1 A, OK |
| GPIO Pi → IN relais | Dupont courts **remplacés par du fil serti/vissé** pour la version armoire | 0,25 mm² | ≤ 20 cm (tout est sur la plaque) |
| 12 V alim → WAGO | 2 conducteurs | 1 mm² | — |

- Percements Ø 10 mm entre compartiments (**passe-fils caoutchouc**
  systématiques), cheminement le long des angles arrière, colliers tous les
  15 cm. Alternative sans percer les cloisons : goulotte extérieure au dos.
- **Étiqueter chaque conducteur aux deux bouts** : `L2-BCM17-CH1`, etc.
- Séparer les chemins signal et puissance quand c'est possible (le pulse
  12 V d'un solénoïde à côté d'une nappe CSI = artefacts caméra possibles).

### Tableau de câblage (à figer AVANT le montage, copie dans le compartiment TECH)

| Case | Position | UUID casier (BDD) | Pin BCM | Canal relais | Longueur câble |
|---|---|---|---|---|---|
| 2 | haut-centre | `________-…` | 17 | IN1 | ~45 cm |
| 4 | milieu-gauche | `________-…` | 27 | IN2 | ~35 cm |
| 6 | milieu-droite | `________-…` | 22 | IN3 | ~35 cm |
| 8 | bas-centre | `________-…` | 23 | IN4 | ~45 cm |

⚠️ Ce tableau **est** le `calibration.json` : toute divergence = `UNKNOWN_LOCKER`
ou pire, **mauvaise porte qui s'ouvre**. On le remplit une fois, on le vérifie à
deux (relire ASSEMBLY.html volet ⚡ pour le brochage), et on ne le change plus.

---

## 6. Ordre de montage

1. Préparer la **plaque support** complète sur l'établi (modules + borniers +
   câblage interne), rejouer `local_scan` sur la plaque seule — c'est le banc
   de test déjà validé, juste re-mécanisé.
2. Percer l'armoire (façade TECH + passe-câbles + gâches), monter les
   4 solénoïdes + gâches, **tests mécaniques à la main** (20 cycles/porte).
3. Poser la plaque dans le compartiment TECH, fixer caméra + PN532 + LED sur
   la façade, raccorder les nappes (boucle de mou côté charnière).
4. Tirer les 4 lignes 12 V vers les solénoïdes, souder les flyback, raccorder
   aux borniers relais selon le tableau de câblage.
5. Remplir `calibration.json` depuis le tableau, redémarrer le service.
6. Rejouer `BENCH_TEST.md` **étapes 5→6 in situ**, porte par porte, puis le
   test de reboot (aucun solénoïde ne doit s'armer au boot).

---

## Checklist finale in situ

- [ ] 4 portes : scan QR → **la bonne** porte s'ouvre, franche, ~0,5 s.
- [ ] NFC lit à travers la façade (< 5 cm) sur les 2 modules.
- [ ] Reboot Pi → toutes portes restent verrouillées, service `enabled` remonte seul.
- [ ] Coupure secteur 10 min → redémarrage propre, heartbeat MQTT revient.
- [ ] Après 10 cycles consécutifs sur une porte : solénoïde à peine tiède.
- [ ] Aucun câble pincé porte fermée ; passe-fils sur chaque traversée.
- [ ] Tableau de câblage plastifié collé dans le compartiment TECH.
- [ ] Ouverture de secours testée sur chaque casier équipé.
