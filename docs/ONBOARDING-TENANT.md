# Onboarding tenant pilote — playbook commercial

Le parcours opérationnel de "le tenant a dit oui" à "le premier citoyen
emprunte un ballon". Conçu pour un **pilote 3 mois** (offre commerciale
réduite avec clause de sortie au bout de 90 jours), donc plus rapide
qu'un déploiement long-terme. Tout est ici : la check-list quotidienne,
les commandes exactes, les emails à envoyer.

> Pas un substitut au CGV (`apps/web/src/pages/cgv.astro`) qui reste le
> document juridique opposable. Ce playbook décrit le "comment", le CGV
> décrit le "quoi".

---

## Vue d'ensemble — timeline pilote

| Phase       | Jour     | Action principale                                           | Owner           |
|-------------|----------|-------------------------------------------------------------|-----------------|
| Discovery   | J-30     | RDV de découverte + démo PWA (utilise `demo_unlock` si pas de Pi) | Commercial      |
| Devis       | J-25     | Envoi devis nominatif (3 mois pilote, tarif réduit)         | Commercial      |
| Contrat     | J-15     | Signature devis + acompte 30 %                              | Commercial / DAF tenant |
| Kickoff     | J-10     | Visio kickoff — récup données pour onboarding               | Lead op         |
| Setup data  | J-7      | `pnpm onboard-tenant` + invite admin tenant                 | Lead op         |
| Hardware    | J-5      | Livraison + installation distributeurs sur site             | Tech ops        |
| Calibration | J-3      | Cabling Pi + calibration locker_id ↔ GPIO + test scan       | Tech ops        |
| Soft launch | J-1      | Walkthrough dashboard avec l'admin tenant                   | Lead op         |
| Go-live     | **J0**   | Première résa réelle d'un citoyen — communication interne   | Lead op + Tenant |
| Suivi       | J+7      | Check usage + adresse les bugs prioritaires                 | Lead op         |
| Review      | J+30     | Bilan chiffré + décision continuation                       | Commercial + Tenant |

---

## J-7 : Setup data via le script d'onboarding

Le script `services/api/scripts/onboard-tenant.mjs` crée d'un coup en
base la commune (tenant), les distributeurs, leurs lockers/items, et la
grille tarifaire. Idempotent : on peut le relancer pour resynchroniser
les prix ou ajouter un distributeur.

### 1. Préparer le fichier de config

Pars d'un des templates dans `services/api/scripts/templates/` :

- `tenant-mairie-example.json` — vraie commune avec INSEE
- `tenant-camping-example.json` — entité privée (workaround insee_code arbitraire)

Renseigne :
- `commune` : INSEE officiel (mairie) ou code arbitraire 5 chars (camping/hôtel)
- `distributors` : 1 par site physique, avec coords GPS Google Maps copiées exactement
- `pricing_rules` : la grille négociée commercialement (price_cents en CENTIMES)

⚠️ **Limite connue** — `communes.insee_code` est UNIQUE en base. Pour des
hôtels/campings multiples dans la même commune réelle, attendre la
migration `tenants` séparée. En attendant, utiliser des codes arbitraires
distincts ("C0001", "H0042", etc.) et marquer le type dans le nom.

### 2. Exécuter

```bash
# Local (DB Docker)
docker compose -f infra/docker/docker-compose.dev.yml up -d postgres
pnpm --filter @sportlocker/api db:migrate          # une fois si pas à jour
pnpm --filter @sportlocker/api onboard-tenant -- --config ./services/api/scripts/templates/tenant-mairie-example.json

# Prod (Railway) — récupérer DATABASE_URL depuis Railway → @sportlocker/api → Variables
DATABASE_URL="postgres://..." \
  pnpm --filter @sportlocker/api onboard-tenant -- --config /tmp/tenant-mairie-bordeaux.json
```

Le script affiche un récap + la commande SQL pour promouvoir l'admin tenant.

### 3. Promouvoir l'admin tenant

Deux options :

**Option A — route /admin/invites (recommandée)** — depuis le dashboard
ops connecté en super_admin :
1. Menu **Tenants** → ouvrir le tenant fraîchement créé
2. **Inviter un admin** → email du référent côté tenant
3. Le tenant reçoit un email avec un lien magique de 24 h pour s'inscrire
   directement avec le bon `commune_id`

**Option B — SQL direct** (setup pilote, quand le super_admin n'est pas
encore prêt) :
```sql
UPDATE users
SET role = 'admin',
    commune_id = '<UUID-de-la-commune-imprimé-par-le-script>'
WHERE email = 'admin@mairie-bordeaux.fr';
```

⚠️ Le user Firebase doit déjà exister (le tenant doit s'être créé un
compte sur https://ops.sportlocker.fr/signup avant l'UPDATE).

---

## J-3 : Calibration physique du Pi

Cette étape n'a lieu **que si un vrai Raspberry Pi est livré sur site**.
Pour un pilote 100 % démo, sauter directement à la sec° "Démo sans Pi" en
bas de ce doc.

Sur le Pi :
1. Flash Balena OS avec le fleet `sportlocker-fleet`
2. Variables device sur dashboard Balena : `DEVICE_ID`, `DEVICE_API_KEY`,
   `JWT_DEVICE_SECRET` (récupérés du dashboard ops, onglet Distributeurs
   du tenant)
3. SSH dans le device → vérifier les logs : `balena logs <uuid> --tail`
4. Calibrer le mapping `lockerId → GPIO pin` :
   - Lister les UUIDs lockers du distributeur (script `services/api/scripts/`
     ou requête manuelle `SELECT id, position FROM lockers WHERE distributor_id = '...' ORDER BY position`)
   - Éditer `/etc/sportlocker/calibration.json` sur le device
   - Format : `{ "<locker-uuid>": <pin-bcm>, ... }`
   - Tester chaque casier individuellement (pulse manuel via script)
5. Restart agent : `systemctl restart sportlocker-firmware`
6. Heartbeat doit apparaître sur le dashboard ops sous 30 s

---

## J-1 : Walkthrough dashboard avec l'admin tenant

Ordre du jour de la visio (45 min) :

1. **Connexion** — vérifier que l'admin tenant arrive bien sur sa vue
   filtrée (seulement ses distributeurs, pas ceux des autres tenants)
2. **Onglet Distributeurs** — montrer l'état temps réel, heartbeat
3. **Onglet Réservations** — historique + filtres
4. **Onglet Tarification** — modifier un prix en live pour valider l'UX
   (et pour mettre le tenant en confiance sur le fait qu'il garde la
   main sur ses tarifs)
5. **Onglet Maintenance** — comment ouvrir un ticket si un casier
   physique a un souci
6. **Comm citoyens** — leur fournir :
   - Le **flyer A6 PDF** avec QR vers `https://app.sportlocker.fr/?d=<distributorId>`
     (à imprimer côté tenant, on fournit le PDF)
   - Le **kit communication** : 2 paragraphes pour leur newsletter, un
     post Instagram type, des photos libres de droits

---

## J0 : Go-live

**Avant le premier scan citoyen :**
1. Vérifier le heartbeat dernier reçu < 30 s sur chaque distributeur
2. Faire un test soi-même : créer un user citoyen jetable
   (`stanislas+test@sportlocker.fr`), réserver un créneau de 30 min sur
   le distributeur de prod, déverrouiller via QR
3. Vérifier que la réservation est passée `idle → reserved → active`
   dans la base et sur le dashboard
4. Refermer le casier, vérifier `active → returning → idle`

**Communication interne** (un canal Slack/Telegram dédié pour ce tenant) :
- Notification que le go-live est OK
- Lien vers le dashboard Sentry filtré sur le `commune_id` du tenant
- Astreinte technique pendant 24 h

**Côté tenant :** envoyer l'email "go-live-J0" (voir templates).

---

## J+7 et J+30 : suivi du pilote

À J+7 (semaine 1) :
- Compter les réservations effectuées
- Identifier les bugs remontés
- Faire un point de 15 min en visio avec le tenant

À J+30 (mois 1) — bilan chiffré sur le dashboard analytics (si dispo)
ou via SQL :
```sql
-- Nombre de réservations terminées
SELECT COUNT(*) FROM reservations r
JOIN distributors d ON d.id = r.distributor_id
WHERE d.commune_id = '<commune-uuid>'
  AND r.status IN ('returned', 'expired_late')
  AND r.created_at > NOW() - INTERVAL '30 days';

-- Top 5 items les plus loués
SELECT it.name, COUNT(*) AS reservations
FROM reservations r
JOIN items i ON i.id = r.item_id
JOIN item_types it ON it.id = i.item_type_id
JOIN distributors d ON d.id = r.distributor_id
WHERE d.commune_id = '<commune-uuid>'
  AND r.status IN ('returned', 'expired_late')
GROUP BY it.name
ORDER BY reservations DESC
LIMIT 5;

-- Taux d'utilisation des distributeurs (sur la dernière semaine)
SELECT d.name,
       COUNT(*) FILTER (WHERE r.created_at > NOW() - INTERVAL '7 days') AS resas_semaine
FROM distributors d
LEFT JOIN reservations r ON r.distributor_id = d.id
WHERE d.commune_id = '<commune-uuid>'
GROUP BY d.id, d.name
ORDER BY resas_semaine DESC;
```

**Décision pilote** :
- ≥ 50 réservations / distributeur / mois → succès → bascule sur le
  contrat 24-36 mois plein tarif
- 20-50 → marginal → 1 mois supplémentaire ciblé sur la communication
- < 20 → échec → debrief honnête, recommandations pour la prochaine fois

---

## Démo sans Pi physique

Pour un pilote 100 % logiciel (montrer la PWA aux élus sans investir
dans le hardware), utiliser la stack `docker-compose.dev.yml` + le CLI
`demo_unlock` (voir `services/firmware/README.md`).

Le tenant peut prendre la décision sur un cycle complet vu en démo, et
le hardware n'est commandé qu'à la signature.

---

## Templates de communication

Voir `docs/templates/email-onboarding.md` pour les 5 emails clés du
parcours (devis-suivi, kickoff, go-live, J+7, J+30).
