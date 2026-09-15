# SportLocker — Cahier des charges

Version 2, septembre 2026. Ce document remplace la version 1 (mai 2026), dont
le modèle économique — marketplace de créneaux payants vendue aux communes,
avec commission de 25 % prélevée via Stripe Connect — a été abandonné.

Compléments :
- `docs/ARCHITECTURE.md` — le **comment** technique
- `docs/RUNBOOK.md` — le **comment** opérationnel
- `docs/PERIMETRE.md` — ce qui est dans le MVP et ce qui en sort
- `SportLocker-Docs/Documents/SportLocker_Refonte_2026.md` — l'analyse qui justifie ce pivot

---

## 1. Ce qui a changé, et pourquoi

La version 1 visait les communes avec un modèle où le citoyen paie chaque
location et où SportLocker prélève 25 % au passage. Trois raisons ont rendu ce
modèle inexploitable :

1. **Le marché communal est déjà servi, gratuitement.** Equip Sport (250 stations,
   contrat Ville de Paris, matériel financé par Decathlon) et BoxUp/SMC2 y sont
   installés, avec un accès gratuit pour l'usager. Equip Sport est présent à
   Saint-Nazaire depuis décembre 2023.
2. **Le prélèvement d'une commission sur des recettes communales est juridiquement
   fermé.** L'article L. 1611-7-1 du CGCT limite à une liste exhaustive les recettes
   qu'une collectivité peut faire encaisser par un tiers ; la location de matériel
   sportif n'y figure pas. Hors liste, c'est de la gestion de fait.
3. **Le financement public invoqué n'existe plus.** Les plans « 5000 terrains » sont
   clos, la campagne ANS 2026 ne comporte aucun volet « équipements de proximité »,
   et une DETR/DSIL ne finance jamais un abonnement de fonctionnement.

La version 2 vise **les campings de la côte atlantique**, où aucun de ces
trois obstacles n'existe.

---

## 2. Vision

Permettre à un gestionnaire d'hébergement de plein air de **mettre du matériel
sportif à disposition de ses clients 24 h/24 sans mobiliser son accueil et sans
perdre son matériel.**

SportLocker vend une borne de casiers connectés et le logiciel qui la pilote.
**SportLocker n'encaisse jamais de paiement du vacancier.**

---

## 3. Marché et concurrence

### 3.1 Cible

Campings classés 3, 4 et 5 étoiles de la façade atlantique, à partir de 120
emplacements. Vendée d'abord, puis Loire-Atlantique et Charente-Maritime.

| | Chiffre | Source |
|---|---|---|
| Emplacements en Vendée (1er département français) | 52 275 | INSEE, 1er janv. 2026 |
| Campings en Vendée | 334, dont 232 en 3/4/5 étoiles | Vendée Expansion |
| Taille moyenne d'un camping vendéen | ~157 emplacements | calculé |
| Emplacements sur les 5 départements atlantiques | 177 360 (21 % du parc national) | INSEE |

Cible secondaire, à ouvrir seulement après la saison 2027 : villages vacances,
résidences de tourisme, bases de loisirs, hôtels-clubs. Même modèle, même
contrat.

**Les communes sortent du périmètre commercial.** Elles pourront y revenir un
jour, avec un contrat d'abonnement pur, gratuit pour le citoyen, et un avis
juridique préalable — pas avant.

### 3.2 Concurrence

| Acteur | Modèle | Position |
|---|---|---|
| **Equip Sport** | 250 stations, gratuit usager, financé par sponsors et Decathlon | Sur le canal collectivités. Ne vise pas le camping privé, où le sponsoring n'a pas de sens |
| **BoxUp / SMC2** | Casiers outdoor solaires, prêt gratuit, 11 stations | Idem |
| **Drive Cube, Sealocker, RIVES** | Casiers de location libre-service | Plages, auberges, domaine public. Vendeurs de brique technique |
| **Le Casier Français** | Casiers connectés en camping | Épicerie automatique, pas de matériel de sport |

**Aucun acteur identifié sur le canal camping pour du matériel de sport.**
L'annuaire fournisseurs de référence de l'hôtellerie de plein air n'en
référence aucun. L'avantage n'est pas technologique — la brique casier
s'achète — il est commercial : occuper ce canal avant qu'un acteur plage ne le
remonte.

### 3.3 L'argument de vente

Ce n'est pas le sport, c'est le **classement Atout France**. La grille du
niveau 4 étoiles comporte les critères « proposer la location de matériel sur
place » et « mettre à disposition le prêt de jeux, raquettes, jeux extérieurs ».

> « Vous cochez deux critères de la grille Atout France, sans mobiliser votre
> accueil et sans perdre de matériel. »

*À vérifier avant usage commercial : le numéro exact du critère et son poids en
points dans le référentiel officiel Atout France.*

---

## 4. Personas

### 4.1 Gérant de camping (le client payeur)

Décide seul. Achète en hiver pour la saison suivante. Ne veut ni former son
personnel pendant une heure, ni gérer un logiciel de plus. Ce qu'il veut voir
au dashboard : qu'est-ce qui est sorti, qu'est-ce qui n'est pas rentré, et
quel casier est vide.

### 4.2 Personnel d'accueil (l'utilisateur quotidien)

Saisonnier, en poste 3 mois, formé en 10 minutes. Son seul écran utile est
l'**écran de réassort** : quels casiers sont vides, que remettre dedans.

### 4.3 Vacancier

En vacances, souvent avec des enfants, pas patient. Il a un numéro de séjour et
un smartphone. Il ne créera pas de compte, ne téléchargera pas d'application,
et n'acceptera pas une préautorisation de 80 € sur sa carte pour une raquette.

**Conséquence produit : pas de compte, pas d'application native, pas de caution
bancaire.** Le parcours tient dans un navigateur mobile.

---

## 5. Modèle économique

### 5.1 Principe

SportLocker vend un équipement et une licence logicielle. Le flux d'argent du
vacancier, s'il existe, passe **par le compte séjour du camping**, jamais par
SportLocker.

### 5.2 Les deux usages, au choix du camping

**Prêt gratuit** (recommandé au démarrage) — inclus dans le séjour. C'est
l'usage qui coche la grille de classement.

**Location payante** — la ligne est portée sur le compte séjour du vacancier et
réglée au check-out, comme le pain, la laverie et les vélos. Export CSV vers le
PMS du camping. SportLocker ne voit passer aucun euro et n'est pas
intermédiaire de paiement.

Le non-retour et la casse sont facturés par le camping sur le compte séjour,
avec la caution de séjour qu'il détient déjà. C'est son processus actuel pour
les vélos : on ne lui demande rien de nouveau.

### 5.3 Grille tarifaire

**Offre A — vente** (par défaut)

| Poste | Prix HT |
|---|---|
| Borne 8 casiers, installée, garnie de 12 articles | 4 500 € |
| Abonnement logiciel, maintenance, remplacement du matériel d'usure | 790 €/saison |

**Offre B — location saisonnière**, pour les campings qui refusent
l'investissement : 349 €/mois sur 6 mois, tout compris, SportLocker reste
propriétaire.

Repère de marché : une station Equip Sport est annoncée à ~4 500 € par an tout
compris.

### 5.4 Économie

Marge par borne vendue la première saison : **2 068 €**. Marge récurrente :
360 €/saison. Point mort de la première saison : **4 bornes vendues**.

Détail et sensibilité : `SportLocker-Docs/Finances/SportLocker_Previsionnel_Campings_2027-2029.xlsx`.

---

## 6. Le produit

### 6.1 Parcours vacancier

1. Il scanne le QR code collé sur la borne (ou saisit l'URL courte).
2. Une page web s'ouvre. Il saisit son **numéro de séjour et son nom**.
3. Il choisit un article parmi ceux disponibles.
4. Le casier s'ouvre. Il prend, il joue.
5. Il remet l'article dans un casier libre et referme. Le capteur de porte
   enregistre le retour.
6. Si le camping a activé la location payante, la ligne apparaît sur son
   compte séjour.

Pas de compte. Pas d'application à installer. Pas de carte bancaire.

### 6.2 Parcours personnel d'accueil

Un écran, une liste : casiers vides, articles à remettre, articles non rentrés
avec le nom du client et son emplacement.

### 6.3 Parcours gérant

Statistiques de la saison : articles les plus empruntés, pic d'usage, taux de
non-retour, valeur du matériel perdu. C'est ce qui lui sert à décider s'il
rachète une borne l'année suivante.

---

## 7. Matériel

Borne 8 casiers, alimentée en 230 V, installée en site clos.

| Poste | Coût cible |
|---|---|
| Caisson, serrures 12 V ×8, capteurs de porte ILS ×8, quincaillerie | 1 370 € |
| Alimentation 230 V + onduleur de secours | 120 € |
| SBC, carte E/S, DC/DC, modem 4G, LED, câblage | 910 € |
| Aléas 8 % | 192 € |
| **Total** | **~2 592 €** |

Deux postes du devis initial sont **sortis du périmètre** :

- **Le RFID** (1 210 €). Il servait à savoir *quel* objet est revenu. Un casier
  contient un article et un capteur de porte à 5 € suffit à savoir *qu'un*
  casier a été refermé. L'écart se voit au réassort et se facture sur le compte
  séjour. À réintroduire seulement si le terrain prouve que c'est un vrai
  problème.
- **La console embarquée** (écran tactile, clavier PIN, scanner QR — 360 €). Le
  smartphone du vacancier est l'interface. On ne garde que les LED d'état.

L'alimentation solaire et la batterie 100 Ah disparaissent aussi : un camping a
du 230 V.

**Marquage CE** : en restant en 12/24 V DC en aval d'une alimentation certifiée
et avec un module 4G déjà certifié RED, l'auto-déclaration de conformité est
visée. À confirmer avec un organisme de conseil **avant** la première vente.

---

## 8. Périmètre logiciel

Le détail est dans `docs/PERIMETRE.md`. En résumé :

**Conservé** — API réservations/casiers/distributeurs, firmware MQTT + JWT +
GPIO + capteurs de porte, dashboard (parc, casiers, catalogue, maintenance,
multi-tenant), parcours web vacancier.

**Gelé** — Stripe, Stripe Connect, webhooks de paiement, wallet, cautions,
`pricing_rules`, slots, day pass, pénalités de retard. Le code reste, le
drapeau de fonctionnalité est coupé, les tests et le déploiement l'ignorent.

**Supprimé** — pages SEO par commune, carte de couverture nationale.

**Reporté** — notifications push, PWA hors-ligne, avis citoyens, multilingue
(sauf l'anglais, utile en camping).

**À construire** — identification par numéro de séjour, ligne « à facturer sur
le compte séjour » et export CSV, écran de réassort, mode dégradé sans réseau
validé sur du vrai matériel.

---

## 9. Roadmap

Le calendrier n'est pas libre : **les campings achètent en novembre et en hiver
pour installer avant l'ouverture d'avril.** Le SETT de Montpellier, premier
salon européen de l'hôtellerie de plein air, a lieu du 3 au 5 novembre 2026.

| Période | Objectif | Critère de passage |
|---|---|---|
| Septembre 2026 | 10 visites de campings, aucune démo, 5 questions | ≥ 4 gérants confirment l'irritant, ≥ 2 acceptent une démo |
| Octobre 2026 | Le prototype ouvre vraiment un casier avec un vrai Pi. 3 devis fournisseurs | Ouverture fiable sur 20 essais |
| Novembre 2026 | SETT en visiteur, 30 gérants rencontrés | 10 rendez-vous d'hiver programmés |
| Déc. 2026 – janv. 2027 | SASU, contrat type, RC pro, dossier CE, rendez-vous | 2 bons de commande signés avec acompte de 30 % |
| Févr. – mars 2027 | Fabrication, installation, formation du personnel | Bornes en service à l'ouverture |
| Saison 2027 | Exploiter, mesurer, corriger | Données réelles d'usage et de perte |

**Trois moments d'arrêt** : fin septembre si moins de 4 gérants sur 10
confirment le problème ; fin octobre si le prototype n'ouvre pas un casier de
façon fiable ; fin janvier si aucun bon de commande après 15 rendez-vous.

---

## 10. Indicateurs

### 10.1 Business

| Indicateur | Saison 2027 | Saison 2029 |
|---|---|---|
| Bornes vendues dans l'année | 4 | 25 |
| Parc installé | 4 | 41 |
| Chiffre d'affaires | 21 160 € | 144 890 € |
| Taux de renouvellement d'abonnement | n/a | > 85 % |

### 10.2 Produit — les seuls qui comptent la première saison

| Indicateur | Cible |
|---|---|
| Taux d'ouverture du casier après scan | > 98 % |
| Temps entre le scan et l'ouverture | < 5 s |
| Emprunts par borne et par semaine en haute saison | à mesurer — aucune hypothèse fiable aujourd'hui |
| Taux de non-retour | à mesurer |
| Interventions sur site par borne et par saison | < 2 |

Les objectifs de la version 1 (15 locations/jour/borne) étaient inventés. Ceux
qui sont marqués « à mesurer » le restent tant qu'une borne n'a pas tourné une
saison.

---

## 11. Risques

| Risque | Gravité | Traitement |
|---|---|---|
| Saisonnalité : 62 % des nuitées sur juillet-août | Élevée | Vendre plutôt que louer ; occuper l'hiver à vendre la saison suivante |
| Equip Sport descend sur le canal camping | Élevée | Verrouiller la Vendée avant. Leur modèle sponsoring n'a pas de sens en camping privé |
| Le camping s'équipe seul avec un casier générique | Moyenne | L'avantage est le catalogue sport, le réassort, l'argument classement et le SAV local |
| Responsabilité produit en cas de blessure | Moyenne | RC produit dès la première borne ; le contrat précise que le matériel est mis à disposition par le camping |
| Le prêt gratuit ne justifie pas 4 500 € | Moyenne | C'est ce que valide l'étape de septembre, avant toute dépense |
| Hygiène du matériel partagé | Faible | Protocole de nettoyage au réassort, intégré à la formation |
| Bus factor = 1 | Élevée | Documentation à jour ; ne pas ajouter de complexité qu'une seule personne sait maintenir |

---

## 12. Décisions de cadrage (septembre 2026)

| # | Question | Décision |
|---|---|---|
| D1 | Segment prioritaire | Campings 3/4/5 étoiles, Vendée puis façade atlantique |
| D2 | Communes | Hors périmètre commercial jusqu'à nouvel ordre |
| D3 | Qui paie | Le camping. Jamais SportLocker dans le flux du vacancier |
| D4 | Paiement du vacancier | Compte séjour du camping, ou gratuit. Ni Stripe, ni caution bancaire |
| D5 | Identification du vacancier | Numéro de séjour + nom. Pas de compte, pas d'application |
| D6 | Modèle de vente | Vente de la borne + abonnement saisonnier ; location saisonnière en repli |
| D7 | RFID | Sorti du MVP, remplacé par des capteurs de porte |
| D8 | Console embarquée | Supprimée, le smartphone est l'interface |
| D9 | Énergie | 230 V. Solaire abandonné |
| D10 | Marquage CE | Auto-déclaration visée, à confirmer avant la première vente |
| D11 | Langues | Français, puis anglais |
| D12 | Support | Le camping en premier niveau, SportLocker en second |

---

Ce CDC est à amender quand un camping signe, quand une saison est passée, ou
quand un risque se matérialise. Dernière mise à jour : septembre 2026.
