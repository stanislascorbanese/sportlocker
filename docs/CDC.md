# SportLocker — Cahier des charges

Document de cadrage produit et business. Version 1, mai 2026.

Complément à :
- `docs/ARCHITECTURE.md` (le **comment** technique)
- `docs/RUNBOOK.md` (le **comment** opérationnel)
- `CLAUDE.md` (les règles métier appliquées au code)

Ce CDC décrit le **pourquoi** et le **quoi** — vision, marché, personas,
modèle commercial, fonctionnalités, roadmap.

---

## 1. Vision

**Démocratiser l'accès au matériel sportif** dans l'espace public et les
lieux de séjour, par des distributeurs IoT en libre-service ouverts
24/7 via smartphone.

Modèle B2B SaaS : SportLocker vend l'infrastructure (distributeur + logiciel
+ maintenance) aux gestionnaires de lieux (mairies, campings, hôtels). Le
service est **gratuit pour le citoyen** (caution rendue à 100% si retour
en bon état).

---

## 2. Marché et concurrence

### 2.1 Cible commerciale prioritaire

**Phase 1 (3-12 mois)** : mairies et campings de la région d'implantation
de SportLocker (proximité géographique pour permettre l'installation et le
SAV physique par le fondateur seul).

**Phase 2 (12-24 mois)** : extension géographique nationale + ajout du
segment hôtellerie.

| Segment | Cycle de vente | Volume / site | Valeur perçue | Engagement type |
|---|---|---|---|---|
| Mairies | 3-12 mois (procédure publique) | 2-5 distributeurs | Service citoyen, image dynamique | 36 mois |
| Campings | 1-3 mois (privé, saisonnier) | 1-3 distributeurs | Satisfaction client, animation | 24 mois |
| Hôtels (phase 2) | 1-2 mois | 1-2 distributeurs | Premium guest experience | 24 mois |

### 2.2 Concurrence identifiée

| Acteur | Modèle | Différenciation SportLocker |
|---|---|---|
| **Decathlon Rent** | Location en magasin, horaires limités | 24/7, libre-service, sans personnel |
| **Equip** (paddle libre-service) | Niche paddle, marché local | Catalogue multi-sport, déploiement large |
| Locations municipales classiques | Manuel, accueil mairie | Automatisé, scalable, gratuit |

**Avantage concurrentiel principal** : SportLocker est aujourd'hui le seul
acteur multi-sport en libre-service 24/7 sur le marché B2B France.

---

## 3. Personas

### 3.1 Super-admin SportLocker (interne — Stanislas)

- **Profil** : fondateur solo, dev + commercial + ops
- **Outils** : super-dashboard interne (à construire en post-MVP),
  Railway, Supabase, Stripe Dashboard, Balena
- **Besoins** : visualiser tous les tenants, déboguer en prod, facturer,
  intervenir sur incident hardware

### 3.2 Admin tenant (mairie / camping)

- **Profil** : 1 responsable par site (élu, responsable accueil camping),
  pas forcément à l'aise tech
- **Outils** : `dashboard.sportlocker.com` (Next.js) sur poste fixe ou
  tablette
- **Besoins** :
  - Voir l'état temps réel **de son parc uniquement** (multi-tenant strict)
  - Ajouter / éditer ses distributeurs depuis l'UI
  - Consulter le catalogue d'items disponibles dans ses distributeurs
  - Gérer les tickets maintenance ouverts par les citoyens
  - Suivre les statistiques d'utilisation (taux d'occupation, items les
    plus loués, revenus par caution capturée)
  - Filtrer / forcer-annuler les réservations en cas d'abus
- **NE doit PAS pouvoir** : voir / modifier les data d'un autre tenant,
  modifier le firmware, fixer les prix d'abonnement

### 3.3 Citoyen utilisateur final

- **Profil** : grand public, tout âge, pas forcément technophile,
  smartphone obligatoire
- **Outils** : app mobile SportLocker (iOS + Android via Expo)
- **Besoins** :
  - Trouver un distributeur proche via une carte (single account
    fonctionne partout en France, peu importe le tenant qui gère le distributeur)
  - Voir le matériel disponible avant de se déplacer
  - Réserver puis ouvrir un casier en 30 secondes (QR code scan)
  - Comprendre la caution avant de payer (transparence)
  - Récupérer sa caution automatiquement après retour en bon état
- **NE doit PAS** : avoir à créer un compte par tenant (single account
  suffit), comprendre ou interagir avec la mécanique SportLocker ↔ tenant

---

## 4. Modèle commercial

> **Pivots successifs mai 2026** : le modèle a évolué en 3 itérations sur
> quelques jours après tests/réflexion produit :
> 1. V0 : service gratuit citoyen, revenu = abo tenant uniquement
> 2. V1 : marketplace 5€/jour day pass + 25% commission
> 3. **V2 actuel : marketplace slots courts (15min → 2h max), prix
>    variable par item, configuré par tenant, + 25% commission**
>
> Ce CDC reflète V2.

### 4.1 Vue d'ensemble — 3 flux de revenu

```
┌──────────────────┐  paye slot 15/30/60/    ┌──────────────────┐
│     CITOYEN      │  90/120min (var/item)   │      STRIPE      │
│  (utilisateur)   │ ─────────────────────▶  │   (Connect)      │
│                  │  + caution préauto      │                  │
└──────────────────┘                          └──────────────────┘
                                                       │
                                                       │ split à chaque tx
                                       ┌───────────────┼───────────────┐
                                       ▼                               ▼
                              ┌───────────────────┐         ┌──────────────────┐
                              │   TENANT (75%)    │         │ SPORTLOCKER (25%)│
                              │ commune / camping │         │  application_fee │
                              │  / hôtel          │         │                  │
                              └───────────────────┘         └──────────────────┘
                                                                      ▲
                                                                      │
                              ┌───────────────────┐                   │
                              │   TENANT          │  abo 350-500€/mois│
                              │  paye abo SaaS    │ ──────────────────┘
                              └───────────────────┘
```

### 4.2 Revenu 1 — Abonnement SaaS (tenant → SportLocker)

| Composant | Montant indicatif | Détails |
|---|---|---|
| **Abonnement mensuel par distributeur** | 350-500 € HT | Tout inclus : matériel sportif, maintenance, logiciel, hotline N2, mises à jour OTA |
| **Setup fee one-shot** | 500-1 000 € HT | Déplacement, installation, formation admin, configuration initiale |
| **Engagement** | 24 mois (campings/hôtels) / 36 mois (mairies) | Permet d'amortir le distributeur |
| **Facturation** | Mensuelle, prélèvement SEPA via Stripe | Facture automatique générée |

### 4.3 Revenu 2 — Location citoyen (slots courts variables)

**Modèle : 5 slots courts au choix, prix variable par item type, configuré
par le tenant.**

#### Slots disponibles
Le tenant active tout ou partie de ces 5 slots dans sa config :
- 15 minutes
- 30 minutes
- 1 heure
- 1 heure 30
- **2 heures (maximum strict d'une session)**

#### Prix
Variable selon `(item_type × duration)`. Stocké dans la table `pricing_rules`
de la DB. Le tenant configure dans son dashboard :

```
Ballon foot        : 0,50 €/15min  -  1 €/30min  -  2 €/1h  -  3 €/2h
Raquette tennis    : 1 €/15min     -  2 €/30min  -  3,50 €/1h  -  6 €/2h
Équipement plage   : 1 €/15min     -  2 €/30min  -  3 €/1h  -  5 €/2h
```

(prix exacts à finaliser, ce sont juste des exemples)

#### Split commission

| Composant | Pourcentage | Mécanisme |
|---|---|---|
| **Commission SportLocker** | **25%** | `application_fee` Stripe Connect prélevée à chaque tx |
| **Reversement tenant** | **75%** | Reversement automatique J+2 sur compte Stripe Express |

#### Retard de retour (au-delà des 2h)

| Composant | Montant | Note |
|---|---|---|
| **Pénalité forfaitaire retard** | **2 € flat** | Débitée à la 1ère minute de dépassement |
| **Auto-renew par tranches de 15 min** | tarif item × 15min | Continue à débiter jusqu'au retour |

→ Pas de capture caution automatique pour retard. La caution n'est capturée
QUE si dégradation ou non-retour avéré (> 6h après l'expiration probablement).

#### Templates par défaut (à l'install d'un nouveau tenant)

3 templates pré-configurés pour démarrer rapidement (le tenant pick 1, peut
customiser ensuite via dashboard) :

1. **"Communal léger"** (mairies équipement grand public)
   - Ballons / raquettes ping-pong / frisbees
   - Tarifs : 0,50€/15min, 1€/30min, 2€/1h, 3€/2h

2. **"Saisonnier camping/plage"**
   - Raquettes plage, beach-tennis, équipement snorkel, frisbees
   - Tarifs : 1€/15min, 2€/30min, 3€/1h, 5€/2h
   - Slot 1h30 désactivé (peu pertinent côté plage)

3. **"Hôtel premium"**
   - Raquettes tennis pro, équipement pool, accessoires fitness haut de gamme
   - Tarifs : 2€/15min, 4€/30min, 7€/1h, 12€/2h

Les prix exacts seront affinés au fil des installations réelles. Templates
modifiables en V1 quand le dashboard tarification custom sortira.

#### Pourquoi ce modèle (vs précédentes itérations)

**Vs day pass 5€/jour** :
- Anti-monopolisation : avec day pass, un citoyen pouvait bloquer 1 item
  toute la journée (gros frein rotation matos = perte revenu tenant)
- Granularité : un usage "ballon 30min" ne devrait pas coûter 5€

**Vs prix unique par item** (tarif horaire flat) :
- Permet la pricing power au tenant (premium hôtel vs communal léger)
- S'adapte aux contextes (camping en haute saison peut surfacturer)

#### Pourquoi 25% de commission

- Standard marketplaces B2C (Uber Eats 30%, Deliveroo 30%, Airbnb 15%, Doctolib 15%)
- Couvre frais Stripe Connect (1,4% + 0,25€ par tx) + marge SportLocker
- Permet d'avoir un abo SaaS attractif (350-500€/mois) sans amputer la marge

### 4.4 Revenu 3 (indirect) — Caution citoyen (préautorisation Stripe)

La caution n'est PAS un revenu — c'est un mécanisme de **dissuasion + couverture risque** pour le tenant.

**Variable selon l'item** (autorisation Stripe sur CB ou Apple/Google Pay) :

| Item type | Caution préautorisée | Capturée vers |
|---|---|---|
| Ballon foot / basket / frisbee | 30 € | Compte tenant si dégradation |
| Raquette tennis / badminton / ping-pong | 80 € | idem |
| Équipement plage (raquettes plage, masque snorkel) | 50 € | idem |
| Équipement « pro » (matériel valeur > 150 €) | **plafond 150 €** | idem + mandat SEPA in-app pour différence |

**Important** : la caution **n'est jamais débitée si retour OK** — c'est juste une préautorisation (hold) sur la CB. Capturée par le **tenant** si dégradation/vol confirmé.

### 4.5 Qui paie quoi en cas de problème

| Scénario | Qui paie |
|---|---|
| Retour matériel intact | Personne ; caution préauto **libérée** ; commission SportLocker conservée |
| Dégradation légère | Tenant **capture** la caution (partielle ou totale selon barème) |
| Perte / vol citoyen | Tenant capture caution + relance SEPA pour différence si > 150 € |
| Vandalisme tiers (distributeur cassé hors emprunt) | **Tenant** (assurance ou budget) |
| Remplacement matériel usé (vétusté normale) | **Tenant** (assumé dans son budget d'exploitation) |
| Bug technique SportLocker (locker pas ouvert mais débité) | **SportLocker** rembourse intégralement (forfait + libère caution) |

**Important** : SportLocker ne porte AUCUN risque matériel — le tenant assume
remplacement, vandalisme, vétusté, perte non-couverte par caution. C'est ce
qui justifie l'abo mensuel SaaS pur (pas de "lease").

### 4.6 Calcul cible 12 mois

Hypothèses prudentes (modèle slots, panier moyen 2,50 €/location) :
- 10 clients tenants signés
- 4 distributeurs moyens par client = 40 distributeurs
- Abo moyen 425 €/mois HT
- **15 locations/jour/distributeur** (mature — slots courts = plus de rotation
  que day pass donc volume supérieur)
- Panier moyen 2,50 € (mix entre 0,50€/15min ballon et 12€/2h hôtel pro)
- Commission moyenne 2,50 × 25% = 0,625 €/location

| Source | Calcul | Montant mensuel |
|---|---|---|
| MRR abos | 40 × 425 € | **17 000 € HT** |
| Commission locations | 40 × 15 × 30 × 0,625 € | **11 250 € HT** |
| **Total** | | **28 250 €/mois HT** |

→ Slots courts génèrent un peu moins de commission par location qu'un day
pass à 5€ (1,25€), mais la rotation matos plus rapide compense
partiellement. À tester en réel.

### 4.7 Compte « Premium Citoyen » (post-MVP)

À étudier en V2 : abonnement citoyen 5 €/mois donnant :
- 5 slots de 1h offerts par mois (ou équivalent)
- Caution mutualisée sans plafond (SportLocker porte le risque, via assurance partenaire)
- Réservations prioritaires haute saison
- Historique étendu

→ Source de revenu B2C récurrente, augmente rétention citoyen, lisse
les revenus de commission (fluctuants par nature).

### 4.8 Schéma DB induit (à implémenter `[api]`)

Nouvelle table `pricing_rules` à ajouter en migration `0006_pricing_rules.sql` :

```sql
CREATE TABLE pricing_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES communes(id) ON DELETE CASCADE,
  item_type_id     UUID NOT NULL REFERENCES item_types(id) ON DELETE CASCADE,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes IN (15, 30, 60, 90, 120)),
  price_cents      INTEGER NOT NULL CHECK (price_cents >= 0),
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, item_type_id, duration_minutes)
);
```

Et update `reservations` :
- Ajouter `duration_minutes INTEGER NOT NULL`
- Ajouter `price_cents INTEGER NOT NULL`
- Ajouter `late_penalty_cents INTEGER NOT NULL DEFAULT 0`
- Le `stripe_payment_intent_id` existe déjà (migration 0004)

---

## 5. Architecture produit

### 5.1 Multi-tenant strict côté admin

- Une seule instance partagée (1 API + 1 DB Supabase) pour tous les tenants
- Isolation par `commune_id` (à généraliser en `tenant_id` quand on
  élargira au-delà des mairies)
- Row Level Security PostgreSQL à activer **avant V1** (aujourd'hui
  l'API utilise super-user, suffisant pour MVP solo)
- Dashboard admin filtre tout par tenant connecté

### 5.2 Single account citoyen (côté mobile)

- L'app mobile est un **marketplace SportLocker**
- Le citoyen voit tous les distributeurs sur la carte, quel que soit le
  tenant
- Une seule inscription (Firebase Auth, niveau KYC 1 = email + SMS au MVP)
- Historique de réservations consolidé, peu importe le tenant utilisé
- Caution centralisée côté SportLocker (Stripe customer unique par citoyen)
- Reversement comptable du tenant via Stripe Connect ou facturation
  mensuelle (à arbitrer en V2)

### 5.3 Identifiant universel

Le distributeur a un `serial_number` unique (`SL-XXX-NNN`) qui permet :
- L'identification physique sur le matériel
- Le scan QR pour activation lors de l'installation
- La traçabilité support / maintenance

---

## 6. Fonctionnalités MVP

Le MVP est le périmètre minimum pour signer **le premier client payant**.

### 6.1 App mobile citoyen (déjà partiellement codé)

| Story | Statut |
|---|---|
| Inscription via Firebase Auth (email + SMS) | ✅ |
| Carte avec distributeurs proches (single account, multi-tenant) | ✅ |
| Détail distributeur + items disponibles | ✅ |
| Réservation : sélection item → calcul caution → confirmation | 🟡 (paiement Stripe à brancher) |
| Paiement caution (Apple Pay / Google Pay / CB) | ⏳ |
| Affichage QR code temporaire (15 min, JWT signé) | ✅ |
| Ouverture casier physique (firmware reçoit MQTT) | 🟡 (firmware codé, pas encore sur Pi physique) |
| Retour matériel + libération caution | ⏳ |
| Historique des emprunts | ⏳ |
| Notifications push (rappel retour, confirmation paiement) | post-MVP |

### 6.2 Dashboard admin tenant (déjà partiellement codé)

| Story | Statut |
|---|---|
| Login admin (rôle `admin` JWT) | ✅ |
| Carte du parc + état temps réel des distributeurs/lockers | ✅ |
| CRUD distributeurs (ajouter, modifier, supprimer) | ✅ |
| CRUD communes (zones géographiques) | ✅ |
| Liste filtrable des réservations + force-cancel | ✅ |
| Kanban maintenance tickets | ✅ |
| Stats utilisation (réservations/jour, top items, occupation) | 🟡 (heatmap + toplist en cours) |
| Export comptable mensuel (CSV/PDF) | post-MVP |
| Gestion utilisateurs bannis | post-MVP |

### 6.3 Site vitrine commercial (à coder)

| Story | Priorité MVP |
|---|---|
| Page d'accueil : présentation produit, segments visés | ✅ |
| Page « Comment ça marche » (citoyen + client) | ✅ |
| Page tarifs (avec calculateur simple : nb distributeurs → MRR) | ✅ |
| Formulaire de demande de devis qualifié (nb dist, type matos, lieu, budget) | ✅ |
| Page « Pour les mairies » et « Pour les campings » (landing dédiées) | ✅ |
| Témoignages clients | post-MVP (besoin de clients d'abord) |
| Blog / SEO | post-MVP |
| Signup self-service complet avec paiement | post-MVP (Phase 2) |

**Pas d'inscription self-service au MVP** : le client envoie une demande
de devis → Stanislas qualifie + visite + signe + installe physiquement.

### 6.4 Firmware Raspberry Pi (déjà codé en mock)

| Story | Statut |
|---|---|
| Démarrage agent au boot Pi | ✅ |
| Connexion MQTT EMQX | ✅ |
| Subscribe topic `sportlocker/distributors/{id}/commands` | ✅ |
| Vérification JWT QR offline (HS256, anti-replay nonce SQLite) | ✅ |
| Ouverture serrure GPIO | ✅ (mock, à valider sur vrai Pi) |
| Publication events `sportlocker/distributors/{id}/events` | ✅ |
| Heartbeat (toutes les 60 s) | ✅ |
| Déploiement OTA via Balena | ⏳ (compte Balena à créer + Pi physique à commander) |

### 6.5 API backend (déjà déployée et testée)

| Story | Statut |
|---|---|
| Routes auth, distributors, item-types, reservations | ✅ |
| Routes admin (distributors POST/PUT, communes CRUD, etc.) | ✅ |
| Webhook Stripe `/webhooks/stripe` | ⏳ (à coder pour MVP paiement) |
| Migration DB pour `stripe_payment_intent_id` sur reservations | ⏳ |
| 99% coverage tests sur routes critiques | ✅ |

---

## 7. Fonctionnalités post-MVP (V1 → V2)

### V1 (3-9 mois)

- Notifications push mobile (rappel retour, expiration caution)
- Stats avancées dashboard (revenu mensuel, taux remboursement, items les plus rentables)
- Export comptable CSV/PDF par tenant pour facturation interne
- Multi-langue : ajout **anglais** sur app mobile + dashboard
- Stripe Connect : chaque tenant a son compte Stripe lié, SportLocker
  prend sa commission de service
- RLS Supabase strict (sécurisation isolation tenant)
- Identité KYC niveau 2 (Stripe Identity) pour cautions > 150 €

### V2 (9-18 mois)

- Compte Premium Citoyen (3-5 €/mois, caution mutualisée, prio résa)
- Marque blanche / co-branding distributeur (mix option C)
- Multi-langue : espagnol, italien, allemand (touristes)
- Réservation à l'avance (slot horaire)
- Système d'avis citoyens sur distributeurs / matos
- Marketplace inverse : citoyen peut suggérer un emplacement de distributeur
- API publique pour intégration avec d'autres apps (mairie, office tourisme)

### V3+ (vision long terme)

- Distributeurs « plug and play » self-install (suppression du déplacement
  physique → signup self-service intégral du site vitrine)
- Distributeurs solaires autonomes (off-grid total)
- Catalogue partagé inter-tenants (un citoyen rend à un autre distributeur
  que celui d'emprunt, comme JCDecaux Vélib)
- Service de livraison (matériel apporté au demandeur si pas de distributeur
  proche)

---

## 8. Stack technique

Voir `docs/ARCHITECTURE.md` pour le détail.

Résumé :
- **API backend** : Fastify + Drizzle + Supabase PostgreSQL (hébergé Railway US-West)
- **Dashboard ops** : Next.js 15 App Router (hébergé Railway)
- **Site vitrine** : HTML statique + `serve` (hébergé Railway)
- **App mobile** : Expo SDK 51 + React Native 0.74
- **Firmware** : Python 3.11 sur Raspberry Pi CM4 (déployé via Balena)
- **Broker MQTT** : EMQX Cloud Serverless (eu-central-1)
- **Auth** : Firebase Auth
- **Paiements** : Stripe
- **Observabilité** : Sentry sur les 4 services
- **CI/CD** : GitHub Actions

---

## 9. Métriques de succès et KPIs

### 9.1 Métriques business (suivies par Stanislas)

| KPI | Cible 3 mois | Cible 12 mois |
|---|---|---|
| Clients tenants signés payants | 1 | 10 |
| MRR (revenu mensuel récurrent) | 1 700 € | 17 000 € |
| Nombre distributeurs en prod | 4 | 40 |
| Citoyens inscrits | 200 | 5 000 |
| Réservations / mois | 100 | 4 000 |
| NPS clients tenants | n/a (trop tôt) | > 50 |

### 9.2 Métriques produit (suivies via Sentry / dashboard interne)

| KPI | Cible |
|---|---|
| Uptime API | > 99.5 % |
| Erreurs 5xx / 1000 requêtes | < 1 |
| Latence p95 endpoints critiques | < 500 ms |
| Taux ouverture casier après scan QR | > 95 % |
| Temps moyen ouverture casier (scan → click) | < 5 s |
| Taux remboursement caution intégral | > 90 % |

### 9.3 Métriques opérationnelles (par tenant)

Affichées dans le dashboard de chaque tenant :

- Taux d'occupation moyen distributeur (lockers utilisés / lockers totaux)
- Items les plus loués
- Pic d'utilisation (jour / heure)
- Revenu caution capturée (rare en théorie, signal dégradation)
- Tickets maintenance ouverts vs fermés

---

## 10. Roadmap récapitulative

### 0-3 mois : MVP & 1er client

- ✅ Infra Railway / Supabase / EMQX en place
- ✅ Code base API/dashboard/mobile/firmware
- ⏳ Stripe bout en bout (caution citoyen)
- ⏳ Site vitrine avec demande de devis
- ⏳ 1er Raspberry Pi physique commandé + flashé
- ⏳ Installation chez 1er client + signature contrat

### 3-9 mois : V1 et 10 clients

- Notifications push, stats avancées, RLS strict
- Stripe Connect pour reversement automatique
- Bilan terrain : ajustements UX, ajout features critiques
- Renforcement support N2 (Stanislas reste 1er point) + base de
  connaissances pour clients (support N1)

### 9-18 mois : V2 et passage à l'échelle

- Premium citoyen, co-branding, multi-langue
- Embauche éventuelle (1 dev + 1 commercial / ops)
- Levée de fonds éventuelle (banque + bpifrance + investisseurs)

### 18+ mois : V3 vision

- Self-install distributeurs, expansion européenne, marketplace
  inter-tenants

---

## 11. Risques identifiés

| Risque | Impact | Mitigation |
|---|---|---|
| Refus banque sur préautorisation caution | Pas de vente citoyen | Cap 150 € + Apple/Google Pay |
| Vandalisme distributeur extérieur | Coût hardware + image | Assurance tenant + matériel renforcé + caméra dissuasion (V2) |
| Defaut tenant (mairie ne paye plus) | Perte MRR + matériel à récupérer | Engagement 24-36 mois + clause de récupération matériel |
| Vol intégral d'un distributeur | Perte hardware (8-15 k€) | Géolocalisation IoT, alerte Sentry sur perte heartbeat |
| Bug critique sécurité (auth bypass, JWT cracked) | Catastrophe RGPD + image | Tests systématiques (99% coverage), Sentry monitoring, audit externe avant V1 |
| Concurrence prend le marché | Perte avantage premier | Vitesse d'exécution + relations clients fortes + lock-in 36 mois |
| Stanislas indisponible (maladie, surcharge) | Bus factor = 1 | Documentation complète (CDC + RUNBOOK + ARCHITECTURE), prévoir embauche dev V1 |

---

## 12. Annexes — Décisions de cadrage (mai 2026)

Pour traçabilité, les choix structurants validés en session de cadrage :

| # | Question | Décision |
|---|---|---|
| Q1 | Cible prioritaire | Mairies + campings, géo locale phase 1 |
| Q2 | Modèle économique | SaaS abonnement mensuel + setup fee one-shot |
| Q3 | Multi-tenant | Isolation stricte par tenant côté admin |
| Q4 | Onboarding | Demande devis → install physique par Stanislas |
| Q5 | MVP minimal | Mobile résa+ouv + dashboard temps réel + CRUD dist + vitrine |
| Q6 | Caution | Variable selon item, cap MVP à 150 €, Apple/Google Pay first |
| Q7 | Catalogue | Items casier-compatibles uniquement (pas vélo, paddle, encombrant) |
| Q8 | Compte citoyen | Single account multi-tenant côté mobile |
| Q9 | Site vitrine | Présentation + config + demande devis personnalisée |
| Q10 | KYC citoyen | Niveau 1 (email + SMS) pour MVP, niveau 2 plus tard |
| Q11 | Marque | SportLocker (option A) au MVP, co-branding (C) en V2 |
| Q12 | Langues | FR par défaut, EN/ES/IT progressivement post-MVP |
| Q13 | Support N1 | Le tenant (mairie / camping) en frontline, escalation vers SportLocker N2 |
| Q14 | Domaine custom | À acheter : `sportlocker.fr` (Cloudflare Registrar). Sous-domaines : `www.` (vitrine), `app.` (dashboard client), `api.` (backend) |
| Q15 | Onboarding admin tenant | Email d'invitation magique : Stanislas crée le tenant via super-admin + génère un lien d'invitation que l'admin client clique pour choisir son mot de passe |
| Q16 | Authentification admin | Firebase Auth (cohérence avec mobile citoyen, 1 seul fournisseur d'identité) |

### Chantier "Multi-tenant production-ready" (mai 2026)

Décisions opérationnelles induites pour rendre le dashboard utilisable
par de vrais clients :

- Table `users` étendue avec `role` (citizen / admin / super_admin) et
  `commune_id` (nullable, set pour les admins)
- Nouvelle table `admin_invites` (token one-time, expires_at, accepted_at)
- Nouvelles routes API :
    - `POST /v1/admin/auth/login` (échange Firebase ID token contre JWT session)
    - `POST /v1/admin/invites` (super_admin only, génère token+URL)
    - `POST /v1/admin/invites/accept` (accepte, crée user, retourne JWT)
- Toutes les routes `/v1/admin/*` scopées par `commune_id = req.user.commune_id`
  (super_admin bypass le scoping)
- Dashboard :
    - Page `/login` (Firebase Auth web SDK)
    - Page `/accept-invite?token=xxx`
    - Middleware Next.js redirect /login si pas de session
    - Page `/super-admin/tenants` pour Stanislas (invite clients)
- Suppression du `DASHBOARD_ADMIN_TOKEN` hardcodé (MVP shortcut)

---

## 13. Pour aller plus loin

- **Architecture détaillée** : `docs/ARCHITECTURE.md`
- **Procédures ops** : `docs/RUNBOOK.md`
- **Règles métier appliquées au code** : `CLAUDE.md`
- **Schéma DB** : `database/schema.sql`

Ce CDC est un document vivant. À relire et amender quand :
- Un client signe (ses feedbacks impactent la roadmap)
- Un risque majeur se matérialise
- Une opportunité business apparaît (nouveau segment, levée de fonds)
- Un pivot technique devient nécessaire

Dernière mise à jour : mai 2026.
