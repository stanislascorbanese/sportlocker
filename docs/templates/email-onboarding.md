# Templates emails — parcours onboarding tenant pilote

5 emails clés du parcours commercial pilote. Variables à substituer à la
main (pas de templating engine) — entre accolades : `{tenantName}`,
`{distributorCount}`, `{goLiveDate}`, `{dashboardUrl}`, `{primaryContact}`,
`{commercialContact}`, `{technicalContact}`.

> Ton tutoiement professionnel pour mairies, vouvoiement pour hôtels
> haut de gamme — adapter au contexte du tenant. Ces templates sont
> rédigés au vouvoiement par défaut (cas le plus formel).

---

## 1. Devis envoyé — relance à J-25

**Objet** : `SportLocker — devis pilote {tenantName} (à valider sous 7 jours)`

```
Bonjour {primaryContact},

Suite à notre échange du {discoveryDate}, vous trouverez ci-joint le
devis pour un déploiement pilote SportLocker sur {tenantName}.

Récapitulatif :
  • {distributorCount} distributeur(s) installé(s)
  • Durée pilote : 3 mois (clause de sortie à J+90 sans frais)
  • Tarif pilote : -30 % vs grille publique
  • Setup + livraison hardware inclus
  • Support dédié pendant toute la durée du pilote

Le devis est valable 7 jours. Une fois validé, nous démarrons l'installation
sous 4 semaines maximum.

Si vous avez besoin d'aller plus vite ou d'ajuster le périmètre, je suis
disponible {availability}.

Cordialement,
{commercialContact}
SportLocker — contact@sportlocker.fr
```

---

## 2. Kickoff — confirmation à J-10

**Objet** : `SportLocker x {tenantName} — kickoff confirmé pour {kickoffDate}`

```
Bonjour {primaryContact},

Merci pour la signature du devis et de l'acompte. Nous sommes maintenant
en phase de préparation du pilote, avec un go-live ciblé au {goLiveDate}.

Notre prochaine étape : un kickoff visio de 30 min le {kickoffDate} à
{kickoffTime}. Lien : {kickoffMeetingUrl}

Ordre du jour :
  1. Récupération des emplacements précis des distributeurs (coords GPS)
  2. Validation de la grille tarifaire (déjà pré-remplie depuis notre échange)
  3. Désignation de votre référent technique côté {tenantName}
  4. Vérification des prérequis site (alim 230V, accès Wi-Fi/4G)
  5. Définition du canal de communication interne pendant le pilote

Préparez de votre côté :
  • Coordonnées GPS des emplacements (Google Maps suffit, on extrait)
  • Email du référent technique qui aura accès au dashboard ops
  • Photos des emplacements pressentis (utiles pour la prochaine étape
    de calibration physique)

À très vite,
{leadOpsContact}
SportLocker
```

---

## 3. Go-live — J0

**Objet** : `🎾 {tenantName} : SportLocker est en service !`

```
Bonjour {primaryContact},

Nous y sommes — les distributeurs SportLocker sont opérationnels sur
{tenantName} depuis ce matin.

Récapitulatif :
  • {distributorCount} distributeur(s) actifs et connectés
  • Dashboard de pilotage : {dashboardUrl} (vos identifiants vous ont
    été transmis hier lors du walkthrough)
  • Stock initial : déjà chargé et vérifié

Vos citoyens peuvent dès maintenant :
  • Télécharger la PWA sur https://app.sportlocker.fr
  • Réserver leur premier créneau gratuitement (ou au tarif que vous
    avez fixé — voir l'onglet Tarification)

Communication recommandée pour les 7 prochains jours :
  • Post sur vos réseaux sociaux (kit fourni en pièce jointe)
  • Affichage sur les distributeurs (flyers A4 fournis)
  • Mention dans votre prochaine newsletter

Notre canal de support pendant le pilote :
  • Mail prioritaire : pilote@sportlocker.fr (réponse < 4 h en jours ouvrés)
  • Urgence technique : {technicalContact} (sur appel direct, 7j/7)

Nous vous recontactons dans 7 jours pour un premier point d'usage.

Bonne mise en service à toute votre équipe,
{leadOpsContact}
SportLocker
```

---

## 4. Suivi semaine 1 — J+7

**Objet** : `{tenantName} — bilan première semaine SportLocker`

```
Bonjour {primaryContact},

Une semaine que SportLocker tourne chez vous — voici notre premier bilan.

📊 Usage observé sur 7 jours :
  • {weekOneReservations} réservations terminées
  • Item le plus loué : {topItem}
  • Distributeur le plus utilisé : {topDistributor}
  • Aucun incident technique majeur / {incidentCount} incident(s) traité(s)
    [adapter selon réalité]

📌 Retours d'expérience à partager ?
Avez-vous des remontées de vos administrés / clients ? Tout retour
même informel (râle au comptoir, suggestion en réunion) nous est utile
pour la suite du pilote.

🎯 Prochain point : J+30 (le {j30Date}), bilan chiffré complet et
décision de continuation.

D'ici là, n'hésitez pas si besoin — notre équipe reste mobilisée.

À bientôt,
{leadOpsContact}
SportLocker
```

---

## 5. Bilan pilote — J+30

**Objet** : `{tenantName} — bilan pilote SportLocker et prochaines étapes`

```
Bonjour {primaryContact},

Un mois jour pour jour depuis le go-live de SportLocker sur {tenantName}.
Voici le bilan chiffré, et la suite que nous proposons.

📊 Chiffres du pilote
  • Réservations totales : {totalReservations}
  • Moyenne par distributeur / mois : {avgPerDistributor}
  • Réservations payantes : {paidReservations} ({paidShare} % du total)
  • Citoyens uniques : {uniqueUsers}
  • Taux de retour dans les temps : {onTimeReturnRate} %
  • Note moyenne (si reviews activés) : {avgRating} / 5

📈 Comparaison avec nos pilotes
  • Médiane pilotes mairie : 40-60 résa / dist / mois
  • Médiane pilotes camping : 80-120 (saisonnier)
  • Votre positionnement : {tenantPositioning} [au-dessus / dans la moyenne / en dessous]

🎯 Prochaines étapes proposées

Option A — Conversion contrat plein :
  • Tarif full : {monthlyFeeFull} € / dist / mois
  • Engagement {commitMonths} mois
  • Aucune action de votre part requise (continuité de service)
  • Avantage : verrouillage du tarif sur la durée

Option B — Prolongation pilote 3 mois :
  • Tarif pilote maintenu
  • Pertinent si vous voulez mesurer un effet saisonnier ou un projet
    de communication ciblé que vous lancez

Option C — Arrêt :
  • Aucune pénalité (clause de sortie pilote)
  • Désinstallation des distributeurs sous 30 jours
  • Anonymisation des données citoyens conformément au RGPD

Visio de bilan : je vous propose le {bilanDate}, lien : {bilanMeetingUrl}

À votre écoute pour discuter de la suite,
{commercialContact}
SportLocker
```

---

## Notes pour celui qui envoie

- **Personnaliser au moins 2 phrases** par email pour ne pas faire
  template-spam. Une phrase qui rappelle une discussion précédente, une
  qui mentionne un détail spécifique du tenant.
- **Pas de logo SportLocker en signature** tant que la SAS n'est pas
  immatriculée — risque de paraître pro avant d'avoir le statut légal.
- **CC `pilote@sportlocker.fr`** sur tous les emails d'un même tenant
  pour avoir la trace centralisée (à mettre en place une fois le
  forward Gandi configuré, cf. setup contact@).
- **Délai de réponse cible** : J+1 sur les emails entrants pendant le
  pilote, J+3 hors période pilote.
