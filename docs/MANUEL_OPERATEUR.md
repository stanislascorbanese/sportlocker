# Manuel utilisateur — Dashboard opérateur SportLocker

**ops.sportlocker.fr** · Guide destiné aux agents municipaux et gérants de camping

> Version de juillet 2026 — rédigé à partir de la version en production du dashboard.
> Ce manuel décrit uniquement les fonctionnalités réellement disponibles à l'écran.

---

## Table des matières

1. [Bienvenue](#1-bienvenue)
2. [Prise en main](#2-prise-en-main)
3. [Tableau de bord (Accueil)](#3-tableau-de-bord-accueil)
4. [Carte du parc](#4-carte-du-parc)
5. [Distributeurs](#5-distributeurs)
6. [Santé du parc](#6-santé-du-parc)
7. [Articles & stock](#7-articles--stock)
8. [Tarification](#8-tarification)
9. [Réservations](#9-réservations)
10. [Utilisateurs & score de confiance](#10-utilisateurs--score-de-confiance)
11. [Paiements & reversements](#11-paiements--reversements)
12. [Maintenance](#12-maintenance)
13. [Statistiques, rapports & audit](#13-statistiques-rapports--audit)
14. [Administration (communes, invitations, super-admin)](#14-administration-communes-invitations-super-admin)
15. [Que faire quand… (dépannage)](#15-que-faire-quand-dépannage)
16. [Bientôt disponible](#16-bientôt-disponible)
17. [FAQ opérateur](#17-faq-opérateur)
18. [Glossaire](#18-glossaire)

---

## 1. Bienvenue

SportLocker met à disposition de vos administrés (ou de vos vacanciers) des **distributeurs
de matériel sportif en libre-service** : des casiers connectés installés sur les terrains
de sport ou dans votre camping. Les citoyens réservent depuis leur téléphone, déverrouillent
le casier avec un QR code, empruntent le matériel, puis le rapportent.

Le **dashboard opérateur** (ops.sportlocker.fr) est votre poste de pilotage. Il vous permet de :

- suivre en temps réel l'état de vos distributeurs et de chaque casier ;
- gérer votre stock de matériel (ballons, raquettes, etc.) ;
- fixer vos tarifs de location ;
- consulter les réservations et repérer les retards ;
- suivre les paiements et vos reversements ;
- traiter les incidents via des tickets de maintenance ;
- produire des rapports d'activité (PDF) pour votre conseil municipal ou votre direction.

⚠️ **Important** — Le dashboard est un outil de **supervision et de gestion**. Les citoyens,
eux, utilisent une application distincte (app.sportlocker.fr) pour réserver et payer.
Ce manuel ne couvre que le dashboard opérateur.

### À qui s'adresse quel écran ? Les trois rôles

| Rôle | Qui ? | Ce qu'il voit |
|---|---|---|
| **Super-admin** | L'équipe SportLocker | L'ensemble du parc, toutes les communes, plus deux menus réservés (« Tenants », « Agent Office ») |
| **Admin** | Vous : référent mairie ou gérant de camping | Les données de **votre** commune ou camping uniquement |
| **Opérateur** | Agent de terrain | Consultation, sans les actions d'administration |

💡 **Astuce** — Votre rôle est affiché en bas du menu latéral, sous votre adresse e-mail
(par exemple « Admin · 1 commune »).

---

## 2. Prise en main

### 2.1 Activer votre compte (invitation par e-mail)

Vous ne créez pas votre compte vous-même : vous recevez un **lien d'invitation** de la part
de SportLocker ou d'un administrateur de votre commune.

[Capture : page « Activation du compte » avec les trois champs]

**Pas à pas :**

1. Ouvrez le lien d'invitation reçu par e-mail. La page « Activation du compte » s'affiche,
   avec votre adresse e-mail déjà renseignée (non modifiable).
2. Choisissez un **mot de passe** (8 caractères minimum) et saisissez-le une seconde fois
   dans le champ « Confirmation ».
3. Cliquez sur **« Activer mon compte »**. Vous êtes connecté et redirigé vers l'accueil.

⚠️ **Important** — Le lien d'invitation expire après **7 jours** et ne peut être utilisé
qu'**une seule fois**. Si vous voyez le message « Ce lien d'invitation est expiré ou a déjà
été utilisé », demandez à votre administrateur de vous **renvoyer une invitation**
(voir section 14.2).

Messages d'erreur possibles à cette étape :

- « Les deux mots de passe ne correspondent pas. » — resaisissez la confirmation.
- « Mot de passe : 8 caractères minimum. » — choisissez un mot de passe plus long.
- « Un compte Firebase existe déjà pour cet email. Connectez-vous via la page de connexion. »
  — votre compte existe déjà : passez par la page de connexion classique.

### 2.2 Se connecter

Rendez-vous sur **ops.sportlocker.fr**. La page de connexion « SportLocker · ops —
Console opérateur » comporte deux champs : **Email** et **Mot de passe**.

**Pas à pas :**

1. Saisissez votre e-mail et votre mot de passe.
2. Cliquez sur **« Se connecter »**.

En cas d'échec, un message précis s'affiche :

| Message affiché | Cause probable | Que faire |
|---|---|---|
| « Email ou mot de passe incorrect. » | Faute de frappe | Vérifiez la saisie, ou réinitialisez le mot de passe |
| « Adresse email invalide. » | Format d'e-mail incorrect | Corrigez l'adresse |
| « Ce compte a été désactivé. » | Compte suspendu | Contactez SportLocker |
| « Trop de tentatives. Réessayez dans quelques minutes. » | Sécurité anti-essais | Patientez quelques minutes |
| « Votre compte n'a pas accès à ce dashboard. » | Compte citoyen, pas opérateur | Utilisez un compte invité comme administrateur |

### 2.3 Mot de passe oublié

**Pas à pas :**

1. Sur la page de connexion, cliquez sur **« Mot de passe oublié ? »**.
2. Saisissez votre e-mail, puis cliquez sur **« Envoyer le lien de réinitialisation »**.
3. Ouvrez l'e-mail reçu (vérifiez vos indésirables) et suivez le lien pour choisir un
   nouveau mot de passe sur une page sécurisée.

⚠️ **Important** — Le lien de réinitialisation expire après **1 heure**. Si vous ne recevez
rien sous 5 minutes, vérifiez l'adresse saisie ou contactez l'équipe SportLocker.

### 2.4 Le menu latéral (navigation)

Une fois connecté, le **menu latéral** occupe la gauche de l'écran (sur mobile, ouvrez-le
avec le bouton ☰ en haut à gauche). De haut en bas :

1. Le logo **SportLocker · ops** ;
2. Les entrées de navigation : **Accueil**, **Carte**, **Distributeurs**, **Santé du parc**,
   **Articles**, **Tarification**, **Communes**, **Utilisateurs**, **Réservations**,
   **Maintenance**, **Stats**, **Rapports**, **Audit**, **Paiements** ;
3. *(Super-admin uniquement)* **Tenants** et **Agent Office** ;
4. Votre encart profil : e-mail + rôle ;
5. Le sélecteur de langue **FR / EN** et l'interrupteur **thème clair / sombre** ;
6. Le bouton **« Se déconnecter »** et le numéro de version.

L'entrée active est signalée par une barre verte à gauche du libellé.

💡 **Astuce** — Sur chaque page, un bouton **« Rafraîchir »** en haut à droite recharge
les données ; l'heure de la dernière actualisation s'affiche à côté.

### 2.5 Changer la langue (FR / EN)

Cliquez sur **FR** ou **EN** en bas du menu latéral. Le choix est mémorisé pendant un an
sur votre navigateur.

⚠️ **Important** — La traduction anglaise couvre les pages de connexion, le menu et le
profil ; la plupart des écrans métier restent pour l'instant en français.

### 2.6 Thème clair / sombre

Le dashboard s'ouvre par défaut en **thème sombre**. L'icône soleil/lune en bas du menu
latéral bascule entre les deux thèmes ; votre préférence est mémorisée sur ce navigateur.

### 2.7 Votre profil (« Mon compte »)

Cliquez sur votre encart profil pour ouvrir la page **Mon compte**. Elle affiche :

- votre identité (avatar à initiales, e-mail, badge de rôle) ;
- la section **Profil** : e-mail, dernière activité, date de création du compte ;
- *(admin)* la section **Ma commune** : statut du contrat (badge « actif », « < 60 j »,
  « expiré » ou « sans contrat »), code INSEE, population, dates de contrat, contacts,
  et quatre indicateurs (distributeurs déployés, casiers totaux, réservations 30 j,
  taux d'occupation) ;
- la section **Sécurité** avec le bouton **« Changer mon mot de passe »**, qui vous envoie
  un lien par e-mail (confirmation verte « Email envoyé à … » une fois parti).

### 2.8 Le mode démonstration (badge « Démo »)

Si le dashboard ne parvient pas à joindre le serveur, ou si votre parc est encore vide,
certaines pages affichent des **données fictives** signalées par un badge orange **« Démo »**
et la mention « données fictives ». Dans ce mode, les actions de modification sont bloquées
avec un message du type « Mode démo — branchez un token admin valide… ».

💡 **Astuce** — Si vous voyez « Démo » alors que votre parc est bien installé, commencez par
cliquer sur « Rafraîchir », puis déconnectez-vous / reconnectez-vous. Si le badge persiste,
contactez le support (support@sportlocker.fr).

---

## 3. Tableau de bord (Accueil)

La page d'accueil s'adapte à votre rôle.

### 3.1 Vue « Tableau de bord » (admin de commune ou de camping)

[Capture : accueil admin avec bandeau de bienvenue vert]

En haut, un bandeau de bienvenue « Bonjour, *votre commune* » récapitule d'une phrase :
nombre de distributeurs en service, casiers libres sur le total, taux d'occupation.

Ensuite, deux blocs côte à côte :

- **Aujourd'hui** — *Réservations en cours* (emprunts actifs à l'instant T) et *En retard*
  (matériel non rendu à l'échéance ; cliquez sur ce chiffre pour ouvrir la liste filtrée).
- **Cette semaine** — *Tickets ouverts* (avec, le cas échéant, « dont X critique(s) »)
  et un mini-graphique des réservations des 7 derniers jours, avec le lien
  « voir stats détaillées → ».

Puis la section **« Vos distributeurs »** : une carte par distributeur affichant son nom,
son numéro de série, sa pastille d'état (en ligne / hors ligne / maintenance), ses casiers
libres (« 3/8 »), son taux d'occupation, ses réservations sur 7 jours, la mention
« Vu il y a X min » et un badge d'alerte si des tickets sont ouverts. Cliquer sur une carte
ouvre la fiche du distributeur.

Enfin, si nécessaire, la section **« Alertes à traiter »** liste les réservations en retard
et les tickets critiques, avec des liens directs.

💡 **Astuce** — En bas de page : « Besoin d'aide ? Un casier bloqué, un distributeur hors
ligne ? Ouvrez un ticket de maintenance ou contactez support@sportlocker.fr ».

### 3.2 Vue « Vue d'ensemble » (super-admin)

La version super-admin présente le parc entier : tendance des réservations sur 7 jours,
section **Parc** (Distributeurs, Casiers libres, Réservations actives, En retard),
section **Maintenance** (Tickets ouverts, Sévérité moyenne, Sites impactés, Non assignés),
et la même section **Alertes à traiter**.

### 3.3 Comprendre les couleurs des indicateurs

| Couleur | Signification |
|---|---|
| **Vert** | Tout va bien |
| **Ambre / orange** | Point de vigilance (ex. occupation > 80 %, tickets non assignés) |
| **Rouge / rose** | Action attendue (retards, tickets critiques, distributeur hors ligne) |
| Gris | Information neutre |

La plupart des cartes chiffrées sont **cliquables** et mènent à la liste détaillée
correspondante (par exemple « En retard » ouvre les réservations filtrées sur les retards).

---

## 4. Carte du parc

Le menu **Carte** affiche tous vos distributeurs sur une carte de France interactive.

[Capture : carte avec marqueurs colorés et légende]

- Chaque distributeur est un **cercle coloré** : vert = en ligne, rose = hors ligne,
  ambre = maintenance, gris = désactivé.
- Cliquez sur un cercle pour ouvrir une **fiche résumée** : nom, numéro de série, état,
  casiers libres, et un lien « Modifier → ».
- La **légende** au-dessus de la carte sert aussi de filtre : cliquez sur un état pour le
  masquer/afficher (le nombre de distributeurs par état est indiqué). Votre sélection et
  la position de la carte sont mémorisées.
- La **barre de recherche** accepte un nom de distributeur, un numéro de série, une région,
  un numéro de département ou une commune (ex. « SL-MAIRIE, Bretagne, 44, Nantes… ») et
  recentre la carte sur le résultat choisi.

⚠️ **Important** — Si certains distributeurs n'ont pas de coordonnées GPS, un bandeau
« X distributeur(s) sans coordonnées — renseigner » s'affiche : cliquez sur « renseigner »
pour compléter leur position depuis la liste des distributeurs.

---

## 5. Distributeurs

### 5.1 La liste (« Parc de distributeurs »)

Le menu **Distributeurs** liste toutes vos bornes avec les colonnes : **Distributeur**
(nom + numéro de série), **Statut**, **Casiers libres** (« 3 / 8 »), **Batterie**,
**Position** (GPS), **Dernier signe** (« il y a 2 min ») et **Actions**
(Détail, Santé, Modifier).

Les quatre états possibles d'un distributeur :

| État | Pastille | Signification |
|---|---|---|
| **en ligne** | verte | La borne communique normalement |
| **hors ligne** | rose | Plus aucun signal reçu — voir section 15.1 |
| **maintenance** | ambre | État posé manuellement pendant une intervention |
| **désactivé** | grise | Borne retirée du parc |

Un badge en haut de liste indique l'état de la **connexion temps réel** : « Temps réel »
(vert) quand la page se met à jour toute seule, « Reconnexion… » (ambre) ou « Hors ligne »
(rose) en cas de coupure réseau de votre côté.

⚠️ **Important** — La jauge **Batterie** affiche « — » pour le moment : la remontée du
niveau de batterie par les bornes n'est pas encore activée (voir section 16).

### 5.2 Ajouter un distributeur

**Pas à pas :**

1. Cliquez sur **« + Nouveau »** en haut à droite de la liste.
2. Utilisez le champ **« 🔎 Rechercher une adresse »** : tapez au moins 3 caractères,
   choisissez l'adresse dans la liste (source officielle : api-adresse.data.gouv.fr).
   La position GPS et l'adresse postale se remplissent automatiquement.
3. Vérifiez ou ajustez la position sur la **carte interactive** : cliquez, ou faites
   glisser le marqueur.
4. Renseignez le **numéro de série** (inscrit sur la borne), le **nom lisible**
   (ex. « Distributeur Parc Mairie »), la **commune** et le **nombre de casiers**
   (de 1 à 64 — il doit correspondre à la grille physique de la borne).
5. Cliquez sur **« Créer le distributeur »**.

⚠️ **Important** — Le **numéro de série** et le **nombre de casiers** ne sont **plus
modifiables** après création. En cas d'erreur, contactez le support. Si le message
« Numéro de série déjà utilisé. » apparaît, la borne est déjà enregistrée.

Pour modifier un distributeur existant (nom, statut, position, adresse), utilisez le
lien **Modifier** de la liste, puis **« Enregistrer »**.

### 5.3 La fiche détaillée : casiers en temps réel

Cliquez sur **Détail** pour ouvrir la fiche d'un distributeur.

[Capture : fiche distributeur avec grille de casiers colorée]

En haut : nom, numéro de série, pastille d'état, bouton **Modifier** et bouton vert
**« + Charger un casier »**. Une ligne résume l'instantané : « 3 / 8 vides · 5 chargés ·
2 en circulation · 1 en panne », suivie du badge « Temps réel ».

Quatre indicateurs : **Casiers libres pour chargement**, **Articles chargés**,
**Réservations en cours**, **Batterie / dernier signe**.

Puis la **grille des casiers**, une case par casier (numérotée #1, #2…), dont la couleur
indique l'état :

| État affiché | Couleur | Signification |
|---|---|---|
| **Vide** | contour gris pointillé | Casier libre, sans article — prêt à être chargé |
| **Idle** | vert | Casier fermé avec un article disponible à la location |
| **Réservé** | bleu | Un citoyen a réservé cet article et va venir le chercher |
| **En cours** | ambre | L'article est actuellement emprunté |
| **Retour** | violet | Le citoyen est en train de rapporter l'article |
| **Panne** | rose | Casier signalé défectueux — à diagnostiquer |

Chaque case affiche aussi le nom de l'article qu'elle contient (ex. « Ballon de basket »).
La grille se met à jour **en direct** : quand un citoyen ouvre un casier sur le terrain,
la case change de couleur sous vos yeux.

En bas de fiche : adresse postale, coordonnées GPS et commune de rattachement.

### 5.4 Charger un casier (mettre un article en service)

C'est l'opération que vous ferez le plus souvent sur le terrain : placer un article dans
un casier vide et l'enregistrer.

**Pas à pas :**

1. Sur la fiche du distributeur, cliquez sur **« + Charger un casier »**. Un panneau
   s'ouvre à droite.
2. Choisissez le **type d'article** (ex. « Ballon de basket »).
3. Saisissez ou scannez le **tag RFID** de l'article (identifiant unique, 4 caractères
   minimum).
4. Indiquez l'**état de l'article** : Neuf, Bon état ou À restaurer.
5. Choisissez le **casier** de destination (seuls les casiers vides sont proposés).
6. Cliquez sur **Charger**. Le message « Casier chargé. » confirme l'opération et la
   grille se met à jour.

Messages d'erreur possibles :

- « Ce tag RFID est déjà associé à un autre article. » — chaque article a un tag unique.
- « Ce casier ne peut pas être chargé (déjà occupé ou en panne). Rafraîchissez la liste. »
- « Ce casier appartient à une autre commune. » — vérifiez le distributeur sélectionné.

### 5.5 La page « Santé » d'un distributeur

Depuis la liste (lien **Santé**) ou la page Santé du parc, ouvrez le **diagnostic
technique** d'une borne. Choisissez la fenêtre d'analyse : **24 h**, **3 j** ou **7 j**.

Quatre indicateurs :

| Indicateur | Lecture | Seuil d'alerte |
|---|---|---|
| **Disponibilité** | % du temps où la borne a donné signe de vie | vert ≥ 95 %, ambre ≥ 80 %, rouge en dessous |
| **Température CPU** | Température du processeur embarqué | rouge > 75 °C |
| **Signal réseau** | Qualité de la connexion (dBm ; plus proche de 0 = meilleur) | rouge < −80 dBm |
| **Mémoire libre** | Mémoire disponible de la borne | rouge < 64 Mo |

Suivent trois **courbes** (température, signal, mémoire — moyennes horaires) et un résumé
« X heartbeats reçus · uptime … · dernier paquet il y a … ».

💡 **Astuce** — Une borne est considérée « en ligne » si elle a donné signe de vie dans les
**10 dernières minutes**. Si la page indique « Aucun heartbeat reçu sur la période », la
borne est hors ligne ou pas encore appairée : voir section 15.1.

---

## 6. Santé du parc

Le menu **Santé du parc** offre la même lecture technique, mais pour **toutes vos bornes
d'un coup**, sous forme de tableau : distributeur, commune, statut, dernier signe,
CPU °C, signal, mémoire libre, tickets, alertes, et un lien « Détail → » vers la page
santé individuelle.

Le filtre **« Avec alertes seulement »** ne garde que les bornes qui demandent votre
attention. Les alertes possibles :

- **Hors ligne** — plus de signal ;
- **Silence > 24 h** — aucun signe de vie depuis plus d'un jour ;
- **CPU trop chaud** — température > 75 °C ;
- **Signal faible** — réception < −80 dBm ;
- **Mémoire basse** — < 64 Mo disponibles ;
- **Ticket critique** — un ticket de sévérité 4 ou 5 est ouvert sur cette borne.

Le rappel des seuils figure en bas de page : « Seuils : CPU > 75°C · Signal < -80 dBm ·
Mémoire libre < 64 Mo · Heartbeat absent > 24 h · ticket critique sév. ≥ 4. »

---

## 7. Articles & stock

Le menu **Articles** gère votre catalogue en deux onglets :

- **Types d'articles** — les *modèles* de votre catalogue (ex. « Ballon de basket ») ;
- **Articles physiques** — les *exemplaires* réels, identifiés par leur tag RFID.

L'en-tête récapitule : « X types · Y articles physiques », avec en surbrillance les
exemplaires **endommagés** (orange) et **perdus** (rouge).

### 7.1 Types d'articles

Le tableau des types affiche : Type (nom + identifiant), Catégorie, **Caution** (montant
retenu en garantie), **Durée max** d'emprunt, nombre d'Articles rattachés, nombre
d'Emprunts, Actions.

⚠️ **Important** — La création et la modification des **types** sont réservées au
**super-admin** (le bouton indique « Création réservée aux super-admins »). En tant
qu'admin, vous gérez librement les **exemplaires** ; pour ajouter un nouveau type au
catalogue, adressez-vous à SportLocker.

Champs d'un type (pour information) : identifiant (« slug », non modifiable après
création), catégorie, nom, notes, URL d'image (optionnelle, image carrée 400×400 minimum),
caution en euros, durée maximale en minutes. La suppression d'un type est bloquée tant
que des articles physiques l'utilisent.

### 7.2 Articles physiques (exemplaires)

Le tableau des exemplaires affiche : **RFID**, Type, **État**, **Localisation**
(distributeur + « Casier #N », ou « — orphelin » si l'article n'est dans aucun casier),
**Inspection** (date du dernier contrôle, « jamais » sinon), Emprunts, Actions.

Les cinq états d'un exemplaire :

| État | Badge | Signification |
|---|---|---|
| **neuf** | vert | Jamais utilisé |
| **bon** | bleu | Utilisable sans réserve |
| **usé** | ambre | Utilisable mais fatigué — à surveiller |
| **endommagé** | orange | À retirer du service et réparer |
| **perdu** | rouge | Non restitué / introuvable |

Deux filtres au-dessus du tableau : par **état** et par **type**, avec un lien
« Réinitialiser ».

**Pas à pas — enregistrer un nouvel exemplaire :**

1. Onglet « Articles physiques », cliquez sur **« + Nouvel article »**.
2. Choisissez le **type**, saisissez le **tag RFID** (unique, 4 caractères minimum),
   sélectionnez l'**état**.
3. Optionnel : affectez directement un **casier** (le menu liste chaque casier disponible
   sous la forme « Nom du distributeur · Casier #1 »). Si vous laissez vide, l'article est
   en « stock libre », non attribué.
4. Cliquez sur **« Créer l'article »**.

**Pas à pas — après une inspection ou une réparation :**

1. Ouvrez l'exemplaire (lien **Modifier**).
2. Mettez à jour l'**état** (ex. « endommagé » → « bon ») et la date de
   **dernière inspection**.
3. Cliquez sur **« Enregistrer »**.

💡 **Astuce** — Pour charger un article directement dans un casier depuis le terrain,
passez plutôt par la fiche du distributeur → « + Charger un casier » (section 5.4) :
l'exemplaire est créé et placé en une seule opération.

---

## 8. Tarification

Le menu **Tarification** vous permet de fixer le **prix de location** de chaque type
d'article, pour chaque durée de créneau.

[Capture : matrice des prix avec une cellule en cours d'édition]

### 8.1 La matrice des prix

- **Lignes** : vos types d'articles (« Sport / item_type », avec la catégorie).
- **Colonnes** : les durées — **30, 60, 90, 120 minutes**, et **1440 min**, le
  « Forfait journée » (un créneau par jour, signalé par une infobulle et une colonne
  surlignée).
- **Cellules** : le prix en euros. Une cellule **vide** signifie que ce créneau **n'est pas
  proposé** pour ce type d'article.

Le compteur « X / Y créneaux tarifés » en haut de page suit votre avancement.

**Pas à pas — modifier un prix :**

1. Cliquez dans la cellule voulue et tapez le montant (virgule ou point acceptés,
   ex. « 1,50 »).
2. Validez avec **Entrée** ou **Tab** (la touche Échap annule la saisie).
3. La cellule s'enregistre immédiatement — pas de bouton « Sauvegarder » global.

Pour **retirer un créneau**, videz simplement la cellule puis validez : la règle de prix
est supprimée. En cas de saisie invalide (texte, montant négatif), la mention « invalide »
apparaît et la valeur précédente est restaurée.

### 8.2 Démarrer avec un modèle de grille

La section **« Démarrer avec un template »** propose quatre grilles prêtes à l'emploi :

| Modèle | Pour qui | Ordre de prix |
|---|---|---|
| **Communal léger** | Mairies, équipement grand public (ballons, raquettes de ping-pong, frisbees) | 0,50 € les 30 min · forfait journée 3 € |
| **Saisonnier camping / plage** | Beach-volley, raquettes de plage, snorkel | 1 € les 30 min · forfait journée 5 € |
| **Hôtel premium** | Matériel haut de gamme (tennis, fitness, pool) | 2 € les 30 min · forfait journée 15 € |
| **Forfait journalier seul** | Modèle « day pass » : uniquement le forfait journée | 3 à 5 € la journée selon l'article |

**Pas à pas :**

1. Cliquez sur **« Appliquer ce template »** sous le modèle choisi.
2. Confirmez avec **« Écraser les prix »** (ou « Annuler »).
3. Le message « X règles appliquées » confirme ; ajustez ensuite les cellules à la main
   si besoin.

⚠️ **Important** — L'application d'un modèle **écrase** les prix existants pour les
articles concernés. Le rattachement se fait par correspondance de nom/catégorie : si le
message « Ce template ne matche aucun de vos item_types existants » apparaît, saisissez
les prix à la main dans la matrice.

### 8.3 Qui peut modifier les prix ?

En tant qu'**admin**, vous modifiez la grille de **votre** commune ou camping. Le
**super-admin** voit en plus un sélecteur « Tarif de la commune : » pour choisir le
client dont il édite la grille.

---

## 9. Réservations

Le menu **Réservations** liste toutes les locations, de la réservation au retour.

### 9.1 Le cycle de vie d'une réservation

| Statut | Badge | Ce que cela signifie | Action de votre part |
|---|---|---|---|
| **programmée** | violet | Réservation à l'avance (jusqu'à J+7), pas encore active | Aucune |
| **en attente** | bleu | QR code émis, le citoyen n'a pas encore ouvert le casier | Aucune — expire seule si non utilisée |
| **active** | vert | Article emprunté, dans les temps | Aucune |
| **rendue** | gris | Article restitué et contrôlé | Aucune |
| **en retard** | rouge | Échéance dépassée, article non rendu | Surveiller ; contacter l'usager si besoin |
| **annulée** | gris foncé | Annulée par le citoyen ou par vous | Aucune |
| **expirée** | ambre | QR jamais utilisé, casier libéré automatiquement | Aucune |

💡 **Astuce** — En cas de retard, le système agit tout seul : le citoyen reçoit un
**rappel sur son téléphone** et son **score de confiance** baisse automatiquement
(voir section 10). Vous n'avez pas de relance manuelle à faire.

### 9.2 Consulter et filtrer

Colonnes du tableau : Créée le, Utilisateur, Distributeur, Article, Statut, Échéance,
Prolong. (nombre de prolongations). Les filtres : **Statut**, **Distributeur**,
**Du / Au** (dates de création), boutons **Filtrer** et **Réinitialiser**.
L'affichage va de 50 en 50 (« Page suivante → » en bas de liste).

Cliquez sur une ligne pour ouvrir le **panneau de détail** : usager (avec lien vers son
profil), distributeur et article, cycle de vie complet (création, expiration du QR,
ouverture, échéance, retour, prolongations, raison d'annulation) et la **chronologie**
de tous les événements (« Réservé », « Ouverture casier », « Retour confirmé »…).

### 9.3 Annulation forcée

En dernier recours (article perdu, usager injoignable, casier à libérer), vous pouvez
forcer l'annulation d'une réservation en cours.

**Pas à pas :**

1. Ouvrez le détail de la réservation.
2. En bas du panneau, cliquez sur **« Annulation forcée »** (bouton rouge).
3. Saisissez la **raison** (4 caractères minimum) — elle est conservée dans l'historique.
4. Validez : le casier est libéré et l'événement est tracé comme action administrateur.

⚠️ **Important** — L'annulation forcée est **définitive** et tracée. Le message
« Réservation déjà terminée » signifie qu'elle était déjà rendue, annulée ou expirée.

### 9.4 Export CSV

Le bouton **« Exporter CSV »** (en haut à droite) télécharge la liste **telle que
filtrée** au format tableur : identifiant, date, statut, e-mail et nom de l'usager,
distributeur, article, échéances, retour, prolongations, raison d'annulation. Le nom du
fichier reprend la période filtrée (ex. `reservations-2026-06-01_2026-06-30.csv`) —
pratique pour vos archives mensuelles.

---

## 10. Utilisateurs & score de confiance

Le menu **Utilisateurs** liste les citoyens inscrits (et les comptes du personnel).

Colonnes : Utilisateur (nom, e-mail, badges éventuels « banni » / « RGPD »), Rôle,
**Confiance**, Résa. (nombre de réservations), Commune, Dernière activité, Actions.
Recherche par **e-mail ou nom**, filtres par **rôle** et par **état** (actif / banni).

### 10.1 Le score de confiance

Chaque citoyen a un score de **0 à 100**, qui baisse automatiquement à chaque retard :

| Score | Couleur | Lecture |
|---|---|---|
| 90 à 100 | vert | Usager fiable |
| 60 à 89 | ambre | Quelques incidents (retards) — à surveiller |
| 0 à 59 | rouge | Usager problématique |

### 10.2 Actions sur un usager

- **Bannir** : cliquez sur l'icône bouclier, saisissez la **raison** (4 caractères
  minimum), confirmez. L'usager ne peut plus réserver ; le badge « banni » et la raison
  s'affichent. **Débannir** suit le chemin inverse.
- **Changer le rôle** : menu déroulant (citoyen / opérateur / admin / super-admin), avec
  confirmation. À manier avec précaution : donner « admin » ouvre l'accès au dashboard.
- **Suppression RGPD** : l'icône corbeille enregistre une **demande d'effacement**.
  Les données sont anonymisées automatiquement **30 jours** plus tard ; d'ici là, la
  demande est annulable (icône « annuler la demande RGPD »).

⚠️ **Important** — Si un administré exerce son droit à l'effacement (RGPD), utilisez la
demande de suppression RGPD plutôt que le bannissement : c'est elle qui déclenche
l'anonymisation légale sous 30 jours.

---

## 11. Paiements & reversements

Le menu **Paiements** (page « Paiements & reversements ») réunit vos transactions et
votre compte de reversement Stripe.

### 11.1 Les transactions

Le tableau **Transactions** affiche les **50 derniers paiements** : Date, Citoyen,
Matériel · Distributeur, Montant, Statut. Les statuts possibles :

| Statut | Badge | Signification |
|---|---|---|
| **Payé** | vert | Encaissé avec succès |
| **En attente** | bleu | En cours de traitement bancaire |
| **Échoué** | rouge | Paiement refusé ou expiré |
| **Annulé** | gris | Annulation avant encaissement |
| **Remboursé** | ambre | Remboursement effectué |

La mention « (test) » à côté d'un montant signale un paiement de démonstration.

⚠️ **Important** — Le dashboard **ne permet pas d'initier un remboursement**. Pour
rembourser un citoyen, contactez le support SportLocker (support@sportlocker.fr) avec
la date et le montant de la transaction.

### 11.2 Connecter votre compte Stripe (reversements)

Pour recevoir vos reversements (notamment en camping : **75 % du montant de chaque
location vous est reversé**, SportLocker conserve 25 % de commission), vous devez
connecter un compte **Stripe** — le prestataire de paiement.

**Pas à pas — première connexion :**

1. Sur la page Paiements, repérez le badge d'état : **« Non configuré »**.
2. Cliquez sur **« Connecter mon compte Stripe »**. Vous êtes redirigé vers Stripe.
3. Suivez le guide Stripe : identité de votre structure (KYC) et RIB. Comptez environ
   10 minutes avec les pièces sous la main.
4. De retour sur le dashboard, le badge passe à **« Vérification en cours »** : Stripe
   contrôle votre dossier, généralement sous **24 à 48 h**.
5. Quand tout est validé, le badge devient **« Connecté »** (vert), avec deux coches :
   « Paiements entrants » et « Payouts vers ton RIB ».

Les états intermédiaires possibles :

- **« Vérification en cours »** — dossier incomplet ou en cours d'examen : le bouton
  « Continuer la vérification » vous ramène chez Stripe.
- **« Payouts bloqués »** — les paiements fonctionnent mais Stripe retient les virements
  (contrôle complémentaire) : poursuivez la vérification ou contactez le support Stripe.
- **« Paiements bloqués »** — cas rare, contactez le support Stripe.

Le bouton **« Rafraîchir le statut »** resynchronise l'état avec Stripe à tout moment.

💡 **Astuce** — Une fois le compte connecté, les reversements sont **automatiques,
sous 2 jours ouvrés (J+2)**, directement sur votre RIB. La section « Comment fonctionne
le reversement ? » en bas de page résume le circuit en trois étapes.

---

## 12. Maintenance

Le menu **Maintenance** organise le suivi des incidents en trois colonnes (kanban) :

| Colonne | Contenu |
|---|---|
| **Ouverts** | Tickets à prendre en charge |
| **En cours** | Tickets assignés, en cours de traitement |
| **Terminés** | Tickets résolus ou abandonnés |

### 12.1 Lire un ticket

Chaque carte affiche : le titre, un badge de **sévérité** de **S1** (mineur) à **S5**
(critique), le distributeur concerné, la date d'ouverture, l'assigné éventuel et un
extrait de la description.

💡 **Astuce** — Le badge bleu **« Auto »** signale un ticket **ouvert automatiquement par
la surveillance** (borne silencieuse, casier en panne…). Pas d'inquiétude : c'est le
système qui veille. Les tickets sans ce badge ont été créés par un humain.

### 12.2 Traiter un ticket

**Pas à pas :**

1. Colonne « Ouverts » : cliquez sur **« Prendre en charge → »** — le ticket passe
   « En cours ». (Le bouton « ✕ » le classe au contraire sans suite : « Abandonné ».)
2. Ouvrez le ticket pour l'**assigner** : menu « Assigner à » → choisissez la personne
   (ou « Non assigné »).
3. Consignez vos observations dans **« Commentaires internes »** (zone de texte,
   2000 caractères max, bouton **« Commenter »**). Ces commentaires ne sont visibles que
   de votre équipe.
4. Une fois l'intervention terminée, cliquez sur **« ✓ Résoudre »**. Une note de
   résolution peut être associée au ticket.
5. En cas de besoin, **« Rouvrir »** relance un ticket terminé.

La fiche du ticket affiche aussi le **contexte** (distributeur, casier, article, ouvert
par — « Système (automatique) » pour les tickets Auto) et l'**historique des
transitions** (qui a fait quoi, quand).

### 12.3 Créer un ticket

Les tickets naissent soit **automatiquement** (surveillance), soit depuis les fiches
concernées (par exemple depuis un casier en panne). Décrivez le problème précisément :
distributeur, numéro de casier, symptôme constaté.

---

## 13. Statistiques, rapports & audit

### 13.1 Stats

Le menu **Stats** analyse l'usage sur **7, 30 ou 90 jours** (boutons en haut à droite) :

- la **tendance** des réservations par jour ;
- la **répartition par statut** (anneau coloré : actives, en retard, rendues…) ;
- les **Top 5 distributeurs** et **articles les plus empruntés** ;
- les **« Heures de pointe »** : un damier jour de semaine × heure, plus la case est
  verte, plus le créneau est demandé — idéal pour planifier vos tournées de rechargement.

### 13.2 Rapports (PDF pour votre conseil ou direction)

Le menu **Rapports** produit une synthèse d'activité sur la période de votre choix :
raccourcis « 30 derniers jours », « Mois en cours », « Mois précédent », ou dates libres
« Du / Au » + **Appliquer**.

Huit indicateurs : Réservations totales, Achevées, En retard, Taux d'achèvement,
Tickets ouverts, Distributeurs actifs, Occupation moyenne, Pic horaire — suivis de la
tendance, des Top 5 et des heures de pointe.

**Pas à pas — produire le rapport PDF :**

1. Choisissez la période.
2. Cliquez sur **« Télécharger PDF »** (en haut à droite).
3. Le fichier `sportlocker-rapport-…pdf` se télécharge : en-tête à votre nom, chiffres
   clés, graphique de tendance, top distributeurs et articles — prêt à transmettre au
   conseil municipal ou à votre direction.

### 13.3 Audit (journal d'activité)

Le menu **Audit** trace **tous les événements** du parc : « Réservé », « Ouverture
casier », « Fermeture casier », « Prolongation », « Retour confirmé », « Annulé »,
« Expiré », « Incident », « Maintenance ». Chaque ligne indique la source (admin, api,
firmware, system), le distributeur, le casier, l'usager concerné et le moment.

Filtres : **Type** d'événement, **Source**, **Distributeur**, période **Du / Au**.
Affichage par pages de 100 (« Page suivante → »).

💡 **Astuce** — L'audit est votre meilleur allié en cas de litige (« je n'ai jamais ouvert
ce casier ») : la chronologie horodatée y est complète et infalsifiable.

---

## 14. Administration (communes, invitations, super-admin)

### 14.1 Communes

Le menu **Communes** liste les collectivités/campings clients : Commune, Code INSEE,
Région · Dept., **Contrat** (badge « actif », « < 60 j » — expire dans moins de 60 jours,
« expiré », « sans contrat »), Loyer / mois, nombre de distributeurs, Contact, Actions.

**Pas à pas — ajouter une commune (généralement effectué par SportLocker) :**

1. Cliquez sur **« + Nouvelle commune »**.
2. Utilisez le champ **« 🔎 Rechercher une commune »** : tapez un nom ou un code postal ;
   la sélection remplit automatiquement le code INSEE, le code postal, le département, la
   région et la population (source officielle : geo.api.gouv.fr).
3. Complétez la section **Contrat** (début, fin, loyer mensuel) et **Contact**
   (e-mail, téléphone).
4. Cliquez sur **« Créer la commune »**.

⚠️ **Important** — Le **code INSEE** n'est plus modifiable après création.

### 14.2 Inviter un administrateur

Depuis **Utilisateurs → Invitations** (« ← Utilisateurs » pour revenir) :

**Pas à pas :**

1. Saisissez l'**e-mail du destinataire** (ex. nom@commune.fr). Le super-admin choisit en
   plus la commune ; en tant qu'admin, l'invité rejoindra automatiquement la vôtre.
2. Cliquez sur **« Envoyer l'invitation »**.
3. La fenêtre « Invitation créée » affiche le **lien d'activation** : cliquez sur
   **« Copier le lien »** et transmettez-le par e-mail au destinataire.

⚠️ **Important** — Le lien n'est affiché qu'**une seule fois** et expire après
**7 jours**. Le tableau de suivi indique le statut de chaque invitation : **En attente**,
**Acceptée** ou **Expirée**, avec deux actions : **« Renvoyer »** (génère un nouveau
lien, l'ancien devient inutilisable) et **« Révoquer »** (invalide le lien).

### 14.3 Espace super-admin

Réservé à l'équipe SportLocker :

- **Tenants** — vue globale des communes et de leurs administrateurs, avec le formulaire
  d'invitation multi-communes ;
- **Agent Office** — visualisation 3D interne de la flotte d'agents.

Si vous n'êtes pas super-admin, ces pages affichent « Accès refusé ».

---

## 15. Que faire quand… (dépannage)

### 15.1 Un distributeur est « hors ligne »

1. **Vérifiez l'alimentation électrique** de la borne sur place (disjoncteur, prise).
2. Patientez quelques minutes : la borne se reconnecte seule dès le courant ou le réseau
   revenus (elle repasse « en ligne » dès qu'elle redonne signe de vie — seuil de
   10 minutes).
3. Consultez sa page **Santé** : si le « dernier signe » remonte à plusieurs heures et que
   l'alimentation est bonne, le problème est réseau ou matériel.
4. Un ticket **« Auto »** a probablement déjà été ouvert par la surveillance (silence
   > 24 h). Sinon, ouvrez-en un.
5. Si la panne persiste, contactez **support@sportlocker.fr** en précisant le numéro de
   série et ce que vous avez déjà vérifié.

⚠️ **Important** — Une borne hors ligne **continue de fonctionner en mode dégradé** pour
les citoyens : les QR codes restent vérifiables localement pendant leur durée de validité
(15 minutes). Les données remontent au serveur dès le retour de la connexion.

### 15.2 Un casier est affiché « Panne »

1. Sur la fiche du distributeur, repérez la case rose « Panne ».
2. Vérifiez le ticket de maintenance associé (souvent créé automatiquement).
3. Après réparation sur place, faites résoudre le ticket ; si l'article était endommagé,
   mettez à jour son état dans **Articles** (section 7.2).

### 15.3 Un citoyen ne rend pas le matériel

1. La réservation passe automatiquement **« en retard »** (rouge) : rappel push envoyé au
   citoyen et pénalité de score de confiance appliquées sans intervention de votre part.
2. Si le matériel revient : la réservation passera « rendue » à la restitution.
3. S'il ne revient pas : forcez l'annulation (section 9.3) pour libérer le casier, passez
   l'article en état « perdu » (section 7.2), et le cas échéant bannissez l'usager
   récidiviste (section 10.2).

### 15.4 « Connexion impossible. Réessayez. » à la connexion

Message générique : vérifiez votre connexion internet, puis réessayez. Si le problème
persiste, tentez la réinitialisation de mot de passe ; sinon contactez le support.

---

## 16. Bientôt disponible

Fonctionnalités prévues mais **pas encore actives** dans le dashboard — inutile de les
chercher à l'écran :

- **Niveau de batterie des bornes** — la colonne existe mais affiche « — » tant que les
  bornes ne remontent pas cette mesure.
- **Schéma électrique du distributeur** — le diagnostic visuel des composants n'est pas
  encore intégré à la page Santé.
- **Avis citoyens** — les notes laissées par les usagers ne sont pas encore consultables
  depuis le dashboard.
- **Articles premium (tarif majoré ×2/×3)** — le marquage « premium » d'un type d'article
  n'est pas encore exposé ; utilisez la matrice de tarification pour différencier les prix.
- **Sélecteur multi-communes** — un compte admin est aujourd'hui rattaché à une seule
  commune ; la bascule entre plusieurs entités arrivera avec le multi-tenant étendu.
- **Suivi des virements Stripe** — le détail des payouts (virements J+2) n'est pas encore
  affiché ; seuls les paiements citoyens le sont.
- **Remboursements en un clic** — passent pour l'instant par le support.
- **Porte-monnaie citoyen** — le solde prépayé des usagers n'est pas visible côté opérateur.
- **Traduction anglaise complète** — le menu et les pages d'accès sont traduits, le reste
  arrive progressivement.

---

## 17. FAQ opérateur

**1. Je n'ai pas reçu mon invitation, ou le lien est expiré. Que faire ?**
Demandez à votre administrateur (ou à SportLocker) de la **renvoyer** depuis
Utilisateurs → Invitations : un nouveau lien valable 7 jours est généré.

**2. Comment savoir si un distributeur fonctionne en ce moment ?**
Regardez sa pastille : verte = « en ligne » (signal reçu dans les 10 dernières minutes).
La liste des distributeurs et la carte se mettent à jour en temps réel.

**3. Que signifie le badge « Auto » sur un ticket de maintenance ?**
Le ticket a été ouvert automatiquement par la surveillance (borne silencieuse, panne
détectée). Traitez-le comme un ticket normal.

**4. Un citoyen a dépassé l'heure de retour. Dois-je faire quelque chose ?**
Non, dans un premier temps : rappel push et pénalité de score de confiance sont
automatiques. N'intervenez (annulation forcée, article « perdu ») que si le matériel ne
revient vraiment pas.

**5. Comment changer le prix de location d'un article ?**
Menu **Tarification** : cliquez dans la cellule (article × durée), tapez le prix, validez
par Entrée. C'est immédiat.

**6. Comment retirer un article abîmé du service ?**
Menu **Articles** → onglet « Articles physiques » → Modifier → état « endommagé ».
S'il occupait un casier, retirez-le physiquement et rechargez le casier avec un autre
exemplaire.

**7. Puis-je rembourser un citoyen depuis le dashboard ?**
Pas encore : contactez support@sportlocker.fr avec la date et le montant de la
transaction (visibles dans **Paiements**).

**8. Quand vais-je recevoir l'argent des locations ?**
Une fois votre compte Stripe « Connecté », les reversements sont automatiques sous
2 jours ouvrés (J+2) sur votre RIB, à hauteur de 75 % du montant des locations.

**9. Comment produire un bilan pour mon conseil municipal ?**
Menu **Rapports** : choisissez la période (ex. « Mois précédent »), puis
« Télécharger PDF ». Le document est prêt à diffuser.

**10. Un usager conteste avoir ouvert un casier. Comment vérifier ?**
Menu **Audit** : filtrez par distributeur et par période. Chaque ouverture/fermeture est
horodatée avec sa source. Le détail d'une réservation montre la même chronologie.

**11. Pourquoi certaines pages affichent « Démo — données fictives » ?**
Le dashboard n'a pas pu joindre le serveur, ou le parc est vide. Rafraîchissez, puis
reconnectez-vous ; si cela persiste, contactez le support.

**12. Comment ajouter un nouveau type de matériel (ex. « paddle ») au catalogue ?**
La création de types est réservée au super-admin : adressez votre demande à SportLocker.
Vous pourrez ensuite créer les exemplaires et fixer les prix vous-même.

**13. Comment donner l'accès au dashboard à un collègue ?**
Utilisateurs → Invitations : saisissez son e-mail, envoyez, puis transmettez-lui le lien
d'activation (valable 7 jours).

**14. La grille de casiers ne bouge plus / le badge indique « Hors ligne ».**
C'est la connexion temps réel de **votre navigateur** qui est coupée (et non la borne).
Elle se rétablit seule ; au retour, la page se resynchronise. Vous pouvez aussi cliquer
sur « Rafraîchir ».

**15. Que devient une réservation si le citoyen ne vient jamais chercher l'article ?**
Le QR expire, la réservation passe « expirée » et le casier est libéré automatiquement.
Aucune pénalité pour l'usager, aucune action pour vous.

---

## 18. Glossaire

| Terme | Définition |
|---|---|
| **Distributeur** (ou borne) | L'armoire connectée installée sur site, composée de plusieurs casiers |
| **Casier** | Un compartiment du distributeur, contenant au plus un article |
| **Article physique** (exemplaire) | Un objet réel (un ballon précis), identifié par son tag RFID |
| **Type d'article** | Le modèle au catalogue (« Ballon de basket »), avec caution et durée max |
| **Tag RFID** | Étiquette électronique collée sur chaque article, qui permet de l'identifier au retour |
| **Créneau (slot)** | Durée de location réservée : 30, 60, 90 ou 120 minutes |
| **Forfait journée** | Créneau spécial « 1440 min » : l'article pour la journée entière |
| **QR code** | Code affiché sur le téléphone du citoyen pour déverrouiller le casier (valable 15 minutes) |
| **Heartbeat** (« signal de vie ») | Message technique envoyé régulièrement par la borne pour dire « je fonctionne » |
| **En ligne / hors ligne** | La borne a (ou non) donné signe de vie dans les 10 dernières minutes |
| **Réservation « en retard » (overdue)** | Article non rendu à l'échéance prévue |
| **Score de confiance** | Note de 0 à 100 par citoyen, qui baisse automatiquement à chaque retard |
| **Ticket de maintenance** | Fiche de suivi d'un incident, du signalement à la résolution |
| **Ticket « Auto »** | Ticket ouvert automatiquement par la surveillance du système |
| **Sévérité (S1–S5)** | Gravité d'un ticket : S1 mineur → S5 critique |
| **Caution** | Montant de garantie associé à un type d'article |
| **Stripe** | Prestataire de paiement qui encaisse les locations et vous reverse votre part |
| **Reversement (payout)** | Virement automatique de votre part (75 %) sur votre RIB, sous 2 jours ouvrés |
| **KYC** | Vérification d'identité demandée par Stripe à l'ouverture du compte (obligation légale) |
| **RGPD** | Règlement européen sur les données personnelles ; la « suppression RGPD » anonymise un compte sous 30 jours |
| **Tenant** | Terme technique désignant un client (une commune, un camping) dans le système |
| **Mode démo** | Affichage de données fictives quand le serveur est injoignable ou le parc vide |

---

*Manuel opérateur SportLocker — ops.sportlocker.fr · support : support@sportlocker.fr*
