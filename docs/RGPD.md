# Conformité RGPD — SportLocker

Document de référence pour les Délégués à la Protection des Données (DPO)
des communes clientes et pour l'équipe technique SportLocker.

Dernière mise à jour : 2026-05-20.

---

## 1. Vue d'ensemble

SportLocker traite des **données à caractère personnel** au sens du
Règlement (UE) 2016/679 (RGPD) :

- Identifiants des **citoyens** qui empruntent du matériel (email, nom
  affiché, numéro de téléphone optionnel, historique de réservations)
- Identifiants des **agents municipaux** (admins tenant) qui accèdent au
  tableau de bord opérateur

**Base légale** :
- Citoyens : exécution d'un contrat de prêt à titre gratuit (art. 6.1.b
  RGPD).
- Agents municipaux : exécution du contrat commercial entre la commune
  et SportLocker (art. 6.1.b).

**Responsable de traitement** : la **commune** pour les données de ses
citoyens. SportLocker agit comme **sous-traitant** au sens de l'art. 28.

---

## 2. Données collectées et durée de conservation

| Catégorie | Donnée | Source | Conservation |
|---|---|---|---|
| Identité | `email`, `display_name`, `phone` | inscription Firebase | tant que compte actif |
| Comportement | `total_reservations`, `trust_score` | calcul automatique | tant que compte actif |
| Logs de prêt | réservations (item, distributeur, dates) | usage app mobile | 3 ans après la réservation (preuve en cas de litige caution) |
| Logs techniques | `locker_events` | firmware IoT | 1 an |
| Anonymisation | `gdpr_delete_requested_at`, `gdpr_deleted_at` | demande utilisateur | conservé après anonymisation (traçabilité conformité) |

Les **données techniques** (RFID des items, télémétrie distributeurs)
sont anonymes par construction.

---

## 3. Droits des utilisateurs

| Article | Droit | Implémentation SportLocker |
|---|---|---|
| 15 | **Accès** | Page `/me` côté dashboard pour les agents municipaux. Côté citoyens : export JSON sur demande au DPO mairie *(en cours)* |
| 16 | **Rectification** | Page `/me` (changer email, mot de passe Firebase). Edition profil mobile *(en cours)* |
| 17 | **Effacement** | ✅ **Bouton "Demander suppression RGPD" dans `/users`** (côté admin tenant) ou côté citoyen sur l'app mobile. Voir §4 |
| 18 | **Limitation** | Bannissement via `is_banned=true` (préserve les données mais coupe l'accès) |
| 20 | **Portabilité** | Export JSON sur demande au DPO mairie *(en cours)* |
| 21 | **Opposition** | Pas de profilage marketing — aucune donnée comportementale partagée avec des tiers |

---

## 4. Flow effacement (Art. 17) — le cœur

### 4.1 Schéma temporel

```
 J0                    J0..J29                    J30+
 │                          │                            │
 ├─ Demande RGPD            │                            │
 │  (clic "supprimer")      │                            │
 │                          │                            ├─ Anonymisation
 │                          │                            │  effective
 │  gdpr_delete_            │  Fenêtre de rétractation  │
 │  requested_at = NOW()    │  (l'utilisateur ou la     │  gdpr_deleted_at
 │                          │  mairie peut annuler)     │  = NOW()
 │                          │                            │
```

### 4.2 État de la demande dans la base

3 états possibles pour un compte :

| `gdpr_delete_requested_at` | `gdpr_deleted_at` | Signification |
|---|---|---|
| `NULL` | `NULL` | Compte actif standard |
| `<date>` (< 30j) | `NULL` | Demande RGPD en attente, **annulable** |
| `<date>` (≥ 30j) | `<date>` | Compte **anonymisé**, irréversible |

La fenêtre de 30 jours est conforme à la doctrine CNIL : elle permet
à l'utilisateur de revenir sur sa décision (cf. délibération CNIL
n° 2022-099 art. 4.2) et au responsable de traitement d'archiver des
preuves légales avant suppression effective.

### 4.3 Quelles données sont effacées ?

Voir §5 — détail technique.

Vu côté utilisateur : **toutes les données identifiables sont
effacées**. Ne subsistent en base que :
- Un identifiant interne UUID anonyme
- L'historique agrégé (nombre de réservations effectuées, score de
  confiance) — utile aux statistiques par commune mais ne permet plus
  de remonter à la personne
- Les références techniques (id de réservation, id de casier) pour
  préserver la cohérence de l'historique opérationnel de la mairie

---

## 5. Mécanisme technique d'anonymisation

### 5.1 Pseudonymisation, pas suppression

Le RGPD permet la **pseudonymisation** (art. 4.5) en alternative à la
suppression complète lorsque celle-ci poserait des problèmes
d'intégrité référentielle.

SportLocker pseudonymise car :
- La table `users` est référencée par `reservations`, `locker_events`,
  `reviews` avec `ON DELETE RESTRICT`. Un DELETE casserait
  l'historique des transactions consenti par la mairie (audit,
  contentieux caution, contrôle de gestion).
- Le résultat est **équivalent en terme de droit à l'oubli** : aucune
  donnée identifiable ne subsiste, la personne ne peut plus être
  retrouvée à partir des données stockées.

### 5.2 Champs effacés/remplacés

Sur la table `users` :

| Champ | Action | Justification |
|---|---|---|
| `email` | `deleted-<uuid>@anonymized.local` | Préserve l'unicité, désactive l'envoi de tout email |
| `firebase_uid` | `deleted-<uuid>` | Préserve l'unicité, bloque toute reconnexion Firebase |
| `display_name` | `NULL` | PII direct |
| `phone` | `NULL` | PII direct |
| `banned_reason` | `NULL` | Peut contenir des éléments factuels mais souvent jugement humain |
| `last_active_at` | `NULL` | Efface la trace temporelle |
| `gdpr_deleted_at` | `NOW()` | Timestamp d'anonymisation effective (audit) |

Sur la table `reviews` :

| Champ | Action | Justification |
|---|---|---|
| `comment` | `NULL` pour toutes les reviews du user | Texte libre = PII potentiel |
| `rating` | préservé | Note numérique 1-5, anonyme |

### 5.3 Champs préservés (anonymes par construction)

| Champ | Justification |
|---|---|
| `id` | UUID interne, sans valeur en dehors du système |
| `created_at` | Date d'inscription, statistique anonyme |
| `role` | `citizen` / `admin` / `super_admin`, pas un PII |
| `commune_id` | Rattachement statistique anonyme à une commune |
| `trust_score` | Score 0-100 agrégé, sans corrélation directe à l'identité |
| `total_reservations` | Compteur, pas un PII |
| `is_banned` | Booléen, statut anonyme |
| `gdpr_delete_requested_at` | Conservé pour traçabilité conformité |

### 5.4 Automatisation

Le cron BullMQ `rgpd-anonymize` tourne **chaque jour à 03:00 UTC** sur
l'API SportLocker. Il :

1. Sélectionne les comptes où `gdpr_delete_requested_at < NOW() - 30 jours`
   et `gdpr_deleted_at IS NULL` (limite 500 par run, le cron rebatch
   le lendemain si besoin).
2. Exécute la pseudonymisation pour chaque compte en une transaction.
3. Logge le résultat (`anonymized: N, reviewsCleared: M, window: 30`)
   dans Sentry et les logs Railway.

Source : [`services/api/src/queues/rgpd-anonymize.ts`](../services/api/src/queues/rgpd-anonymize.ts).
Tests d'intégration : [`services/api/test/queues/rgpd-anonymize.test.ts`](../services/api/test/queues/rgpd-anonymize.test.ts)
(9 cas dont idempotence, fenêtre tunable, batch multi-users).

---

## 6. Procédure opérationnelle

### 6.1 Pour un agent municipal (admin tenant)

Reçoit une demande de suppression d'un citoyen par email/courrier :

1. Se connecte sur `app.sportlocker.fr/login`.
2. Va sur **`/users`**, recherche le citoyen par email.
3. Clique sur la ligne → bouton **"Demander suppression RGPD"**.
4. Confirme la demande.
5. Notifie le citoyen : "Votre demande est enregistrée, vos données
   seront effacées dans un délai de 30 jours conformément à
   l'article 17 du RGPD."

### 6.2 Pour annuler une demande (rétractation)

L'agent municipal a 30 jours pour annuler :

1. `/users`, retrouve le citoyen, cliquer **"Annuler la demande RGPD"**.
2. Le champ `gdpr_delete_requested_at` repasse à `NULL`.
3. Au-delà de 30 jours : la demande est devenue effective,
   irréversible.

### 6.3 Pour un super_admin SportLocker

Audit annuel : connexion sur `/users` → filtre `RGPD en attente` →
vérifier les comptes dont la fenêtre arrive à échéance.

Génération de rapport de conformité : `/reports` permet l'export PDF
mensuel des actions RGPD effectuées sur la période *(en cours)*.

---

## 7. Argumentaire DPO mairie

### 7.1 Sous-traitance et art. 28

SportLocker signe un **contrat de sous-traitance** type avec chaque
commune cliente, conforme à l'art. 28 RGPD :

- Confidentialité (NDA équipe technique)
- Sécurité (chiffrement TLS partout, secrets en vault Railway, JWT
  signés HS256 avec secret 64-chars)
- Notification de violation sous 72h
- Suppression des données à la fin du contrat (option : restitution
  d'un export complet à la commune avant suppression)

### 7.2 Hébergement et transferts

| Couche | Hébergeur | Localisation | RGPD-compatible ? |
|---|---|---|---|
| Base de données | Supabase (Postgres) | Francfort (eu-central) | ✅ Oui — UE |
| API | Railway | US (us-west) | ⚠️ Transfert UE→US, sous SCC (Standard Contractual Clauses) |
| Auth | Firebase | Belgique (europe-west1) | ✅ Oui — UE |
| Dashboard | Railway | US (us-west) | ⚠️ Idem API |
| MQTT broker | EMQX Cloud | UE | ✅ Oui — UE |

**Action à venir** : migration de Railway vers un fournisseur 100% UE
(Scaleway, OVH) à partir de 5 communes clientes pour éliminer le
risque "SCC" et faciliter la conformité DPA.

### 7.3 Points forts à mettre en avant

- **Pas de profilage marketing** : aucune donnée n'est partagée avec
  des tiers, aucun cookie tracking, aucun pixel publicitaire.
- **Pseudonymisation effective et testée** : 9 tests d'intégration
  vérifient le bon fonctionnement du flow.
- **Traçabilité conformité** : chaque demande RGPD laisse une trace
  permanente (`gdpr_delete_requested_at`, `gdpr_deleted_at`)
  permettant à la mairie de prouver son respect des délais.
- **Minimisation par défaut** (art. 5.1.c) : seuls les champs
  strictement nécessaires sont collectés (pas d'adresse postale du
  citoyen, pas de date de naissance, pas de pièce d'identité).

---

## 8. Limites et garde-fous

### 8.1 Backup

Les backups Postgres (Supabase Daily Backup) **conservent les
données non-anonymisées pendant 7 jours**. Cela est acceptable au sens
du RGPD : un backup est un traitement légitime à des fins de
restauration en cas d'incident technique (art. 32). Au-delà de 7
jours, les backups expirent automatiquement.

⚠️ **Action requise** : documenter cette limite dans le contrat
sous-traitance signé avec la commune.

### 8.2 Logs Sentry et observabilité

Les logs d'erreur Sentry **n'incluent pas les PII** par configuration :

- `Sentry.beforeSend` filtre tout payload contenant `email`,
  `display_name`, `phone`, `firebase_uid` avant envoi.
- Les `req.user` sont transmis avec uniquement `{ id, role, communeId }`.

### 8.3 Délai de pseudonymisation

Le cron tourne **1× par jour**. Un compte dont la fenêtre de 30 jours
expire à 14:00 sera anonymisé le lendemain à 03:00 UTC, soit jusqu'à
**13h de délai supplémentaire**. La doctrine CNIL accepte ce délai
raisonnable d'exécution (cf. délibération SAN-2020-014 §32).

### 8.4 Re-création de compte

Après anonymisation, le `firebase_uid` est remplacé par
`deleted-<uuid>`. Si la même personne créé un nouveau compte avec le
même email Firebase, **elle obtient un nouveau `users.id`** sans lien
avec son historique précédent. C'est conforme au droit à l'oubli :
l'utilisateur recommence de zéro.

---

## 9. Contact

Pour toute question relative au traitement des données personnelles :

- **DPO mairie cliente** : prend les demandes RGPD de ses citoyens
  (responsable de traitement)
- **DPO SportLocker** : `dpo@sportlocker.fr` (sous-traitant)

Pour incident de sécurité urgent : `security@sportlocker.fr` (réponse
sous 4h ouvrées, notification de violation sous 72h conformément à
l'art. 33).
