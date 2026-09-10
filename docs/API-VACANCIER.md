# API vacancier — contrat à implémenter

Septembre 2026. L'app vacancier (`apps/citizen`) a été reconstruite autour d'un
parcours sans compte et sans paiement. Elle consomme cinq routes qui n'existent
pas encore côté `services/api` : ce document les spécifie.

En attendant, l'app tourne en **mode démo** (`NEXT_PUBLIC_DEMO=1`), qui rejoue le
parcours en mémoire. C'est ce mode qui sert en rendez-vous client et au SETT.

---

## Principe d'authentification

Il n'y a pas de compte vacancier, donc pas de mot de passe et pas de jeton
persistant. Ce qui fait foi, c'est le couple **(numéro de séjour, nom de
famille)** — le camping l'a déjà vérifié au check-in, pièce d'identité en main.

`POST /identify` échange ce couple contre un `stayId` opaque, de courte durée
(30 minutes suffisent : le temps de choisir un ballon), lié au séjour **et** à
la borne. Ce n'est pas un secret fort, et il n'a pas à l'être : le seul pouvoir
qu'il confère est d'ouvrir un casier de matériel de sport, devant lequel il faut
physiquement se trouver.

Garde-fous attendus côté serveur :

- limitation de débit par borne et par IP sur `/identify` (un séjour se devine
  en trois chiffres) ;
- un seul emprunt vivant par séjour ;
- `stayId` invalidé au départ du client (date de fin de séjour dépassée).

---

## Routes

### `GET /v1/kiosk/:serial`

État public de la borne. Aucune authentification : le numéro de série est
imprimé sur la machine.

```json
{
  "serial": "SL-001",
  "siteName": "Camping des Dunes",
  "items": [
    { "itemTypeId": "uuid", "label": "Ballon de football", "kind": "ballon", "available": 2 }
  ]
}
```

`kind` ∈ `ballon | basket | volley | raquette | disque | plot | corde | boule | autre`.
Il ne pilote que le pictogramme ; un type inconnu tombe sur `autre`.

`available` est le nombre d'exemplaires présents. Les articles à 0 sont
**renvoyés quand même** : l'app les affiche grisés, ce qui vaut mieux que de
laisser croire qu'ils n'existent pas.

Erreur : `404 { "error": "kiosk_not_found" }`

### `POST /v1/kiosk/:serial/identify`

```json
{ "stayRef": "214", "lastName": "Martin" }
```

Réponse :

```json
{
  "stayId": "opaque",
  "guestName": "Camille Martin",
  "activeLoan": null
}
```

`activeLoan` porte l'emprunt en cours s'il y en a un, au format ci-dessous —
c'est ce qui permet à l'app de proposer directement « rendre l'article ».

Comparaison du nom : insensible à la casse et aux accents, sur le nom de
famille seul. Un vacancier qui saisit « martin » doit passer.

Erreur : `404 { "error": "stay_not_found" }`

### `POST /v1/kiosk/:serial/loans`

```json
{ "stayId": "opaque", "itemTypeId": "uuid" }
```

Ouvre un casier contenant cet article et enregistre l'emprunt. Réponse :

```json
{
  "id": "uuid",
  "itemLabel": "Ballon de football",
  "kind": "ballon",
  "lockerNumber": 4,
  "borrowedAt": "2027-07-14T10:32:00Z",
  "serial": "SL-001",
  "siteName": "Camping des Dunes"
}
```

`lockerNumber` est le numéro **peint sur la porte**, pas l'identifiant en base.
C'est la seule information que le vacancier doit retenir.

Erreurs : `409 item_unavailable` · `409 loan_already_active` · `502 locker_stuck`

### `GET /v1/kiosk/loans/:loanId`

Même format que ci-dessus. `404 loan_not_found` si l'emprunt est clôturé —
l'app efface alors sa trace locale sans afficher d'erreur.

### `POST /v1/kiosk/loans/:loanId/return`

Ouvre un casier libre pour le dépôt et clôture l'emprunt.

```json
{ "lockerNumber": 7 }
```

Erreurs : `404 loan_not_found` · `409 no_free_locker` · `502 locker_stuck`

---

## Codes d'erreur

Le corps d'erreur est toujours `{ "error": "<code>" }`. L'app possède ses
propres libellés en français : **le serveur ne renvoie pas de message
utilisateur**, il renvoie un code. Un code inconnu tombe sur un message
générique.

| Code | Sens |
|---|---|
| `kiosk_not_found` | Numéro de série inconnu |
| `stay_not_found` | Séjour introuvable, ou nom qui ne correspond pas |
| `item_unavailable` | Plus d'exemplaire disponible |
| `loan_already_active` | Ce séjour a déjà un article dehors |
| `loan_not_found` | Emprunt inexistant ou déjà clôturé |
| `locker_stuck` | La borne n'a pas confirmé l'ouverture |
| `no_free_locker` | Aucun casier libre pour le retour |

---

## Ce qui n'est volontairement pas là

- **Aucun paiement.** Si le camping facture le prêt, la ligne part sur le compte
  séjour via son PMS — l'app n'en sait rien et n'affiche aucun prix.
- **Aucune caution.** Le camping détient déjà celle du séjour.
- **Aucune géolocalisation.** On est devant la borne, on vient de scanner son QR.
- **Aucune notification push.** À rouvrir seulement si les retards deviennent un
  vrai problème mesuré sur une saison.
