# Périmètre après le pivot campings

Septembre 2026. Ce document dit, fichier par fichier, ce qui reste dans le
produit et ce qui en sort. Il complète `docs/CDC.md` v2.

**Règle : on ne supprime rien qui a coûté du travail.** Le code hors périmètre
est gelé — drapeau de fonctionnalité coupé, routes non enregistrées, exclu du
build et des tests — pas effacé. S'il faut le rallumer un jour, il est là.

---

## 1. Conservé — le chemin critique

| Zone | Fichiers |
|---|---|
| Réservations, casiers, distributeurs | `services/api/src/routes/reservations.ts`, `distributors.ts`, `item-types.ts` |
| Admin parc et maintenance | `services/api/src/routes/admin-*.ts` (sauf paiements et tarification) |
| Firmware | `services/firmware/**` — MQTT, vérification JWT hors ligne, GPIO, capteurs de porte |
| Dashboard | `apps/dashboard/src/app/**` sauf `settings/payments` |
| Parcours vacancier | `apps/citizen/src/app/{page,map,distributors}` |

Le firmware est le seul risque technique encore ouvert du projet : il n'a
jamais ouvert un casier physique. Tout le reste peut attendre.

---

## 2. Gelé — paiement et marketplace

Le vacancier ne paie plus SportLocker. Tout ce qui suit devient sans objet.

| Fichier | Sort |
|---|---|
| `services/api/src/lib/stripe.ts`, `payments.ts`, `wallet.ts` | Gelé |
| `services/api/src/routes/stripe-webhook.ts`, `webhooks-stripe.ts` | Gelé |
| `services/api/src/routes/admin-stripe-connect.ts`, `admin-payments.ts` | Gelé |
| `services/api/src/routes/admin-pricing-rules.ts`, `wallet.ts` | Gelé |
| `apps/citizen/src/lib/stripe-client.ts`, `components/PaymentStep.tsx` | Gelé |
| `apps/citizen/src/app/wallet/page.tsx` | Gelé |
| `apps/dashboard/src/app/settings/payments/**` | Gelé |

Migrations concernées, à **laisser en place** (une migration appliquée ne se
retire pas) mais dont les tables ne sont plus alimentées : `0008_pricing_and_slots`,
`0009_day_pass_duration`, `0013_payments`, `0016_premium_item_types_and_pricing`,
`0017_wallet_topups`, `0019_stripe_connect`.

Marche à suivre : un drapeau `PAYMENTS_ENABLED=false` dans la configuration, les
routes non enregistrées quand il est faux, les tests correspondants marqués
`skip` avec un commentaire renvoyant à ce document.

---

## 3. Supprimé — hérité de la cible communale

| Fichier | Raison |
|---|---|
| `apps/web/src/pages/mairies.astro` | Les communes sortent du périmètre commercial |
| `apps/web/src/pages/communes/**` | Pages SEO par commune |
| `apps/web/src/pages/couverture.astro` | Carte de couverture nationale — il n'y a rien à couvrir |
| `apps/web/src/pages/hotels.astro` | Segment secondaire, à rouvrir après la saison 2027 |

---

## 4. Reporté

Notifications push, PWA hors ligne, avis vacanciers, multilingue au-delà de
l'anglais. Rien de tout cela n'a empêché une vente, parce qu'aucune vente n'a
encore été tentée.

---

## 5. À construire

Par ordre de valeur, aucun n'est gros :

1. **Identification par numéro de séjour + nom** — remplace Firebase Auth côté
   vacancier. Firebase reste pour l'admin.
2. **Écran de réassort** pour le personnel d'accueil : casiers vides, articles à
   remettre, articles non rentrés avec le nom du client et son emplacement.
3. **Ligne « à facturer sur le compte séjour » + export CSV** pour le PMS du
   camping.
4. **Mode dégradé sans réseau** : si la 4G tombe, le QR signé doit continuer à
   ouvrir le casier. Le firmware sait déjà le faire — à prouver sur du matériel
   réel.

---

## 6. Dette à traiter

- **102 branches distantes à supprimer**, `claude/*` et `dependabot/*`, toutes
  générées automatiquement en mai-juin 2026 et référencées par aucune PR ouverte.
  `scripts/cleanup-repo.sh` les liste mais ne les touche pas sans `DELETE_REMOTE=1`
  en plus de `CONFIRM=1` : un `push --delete` ne se rejoue pas.
- **8 worktrees abandonnés** dans le répertoire personnel, ~6,5 Go avec leurs
  `node_modules`. Même script, qui ne retire que ceux dont le répertoire est
  réellement visible et dont l'arbre est propre — lancé depuis un environnement
  qui ne monte pas tout le disque, `git worktree list` les annonce tous
  « prunable » alors qu'ils existent, et un prune les orphelinerait en bloc.
- **Une clé de service Firebase en clair** dans
  `SportLocker-Docs/Archives/sportlocker-f85b7-firebase-adminsdk-*.json`.
  À révoquer dans la console Firebase et à supprimer du disque.
