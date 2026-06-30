# SportLocker — Politique de sécurité

> Document à double audience : **RSSI / DSI** d'une mairie cliente (audit avant signature)
> et **équipe SportLocker** (référentiel interne, audit qualité, formation).
>
> Mis à jour le 2026-05-20. Référence : commit courant `claude/docs-security`.
> Complète [`RGPD.md`](./RGPD.md) (volet protection des données personnelles).

---

## 1. Vue d'ensemble & modèle de menace

SportLocker est un service B2B SaaS opéré pour le compte de communes : une mairie
achète l'accès au dashboard et le déploiement des distributeurs ; les citoyens
utilisent l'app mobile pour emprunter du matériel sportif gratuitement.

**Surfaces exposées**
| Surface | Hôte | Authentification |
|---|---|---|
| API REST/WebSocket | Railway (Node.js 20 / Fastify) | JWT session (HS256) après login Firebase Auth |
| Dashboard opérateur | Railway (Next.js 15) | Cookie HttpOnly + Firebase Auth |
| App mobile citoyen | iOS/Android (Expo) | Firebase Auth (email/password ou anonyme) |
| Firmware distributeur | Raspberry Pi CM4 (Balena) | MQTT TLS + cert client + JWT HS256 QR code |
| Base de données | Supabase Postgres 16 | Mot de passe + SSL obligatoire |
| File de jobs | Redis 7 (Railway) | Mot de passe + TLS |

**Menaces principales prises en compte**
- Vol/usurpation de compte admin mairie → impact : exfiltration de données citoyens, faux distributeurs
- Compromission d'un distributeur physique (accès au RPi) → impact : extraction de la clé JWT partagée
- Bruteforce login admin → impact : compte compromis
- Injection SQL via endpoints publics → impact : exfiltration BDD
- Replay d'un QR code de déverrouillage → impact : ouverture frauduleuse
- Fuite de données via logs ou erreurs Sentry → impact : RGPD

**Hors-scope (et assumé) :** attaque physique invasive (extraction puce mémoire d'un RPi
scellé), exploits 0-day Node/Postgres, compromission du fournisseur cloud (Railway, Supabase, GCP).

---

## 2. Authentification & autorisation

### 2.1 Citoyens (app mobile)
- **Firebase Authentication** — email/password ou compte anonyme.
- Politique mot de passe : règles Firebase par défaut (min 6 car. — sera durcie à 10 car. + complexité, cf. §9).
- ID token Firebase → vérifié côté API via `firebase-admin` à chaque requête.
- Pas de mot de passe stocké côté SportLocker — délégué à Firebase (Google Cloud, ISO 27001/27017/27018, SOC1/2/3).

### 2.2 Admins de mairie
- Firebase Auth email/password (compte créé par invitation depuis le dashboard).
- Après login, le dashboard appelle `/admin/auth/session` qui :
  1. Vérifie l'ID token Firebase,
  2. Vérifie que le user existe en base avec `role ∈ {admin, super_admin}` et n'est pas banni,
  3. Émet un **JWT de session HS256** (clé `JWT_SESSION_SECRET`), valable 24h,
  4. Pose un **cookie HttpOnly** (`sl_session`) — `Secure` en prod, `SameSite=Lax`.
- Les rôles sont **scopés à une commune** sauf `super_admin` : tout admin scopé voit
  uniquement les données de sa commune (vérification systématique via
  `requireAdminScope()` dans `services/api/src/lib/commune-scope.ts`).

### 2.3 Super-admins (équipe SportLocker)
- Même mécanisme que les admins, mais `communeId` absent → bypass du scoping commune.
- **Compte super-admin créé manuellement** via le script `bootstrap-super-admin.mjs`
  (jamais d'inscription self-service).
- **À venir (cf. §9)** : 2FA TOTP obligatoire pour les super-admins.

### 2.4 Firmware distributeur
- Le RPi s'authentifie auprès du broker MQTT (EMQX Cloud) avec un certificat client
  X.509 unique par appareil, généré et révocable depuis le dashboard.
- Pour ouvrir un casier, le firmware vérifie un **JWT HS256** signé par l'app citoyen
  ou l'API, avec la clé partagée `JWT_DEVICE_SECRET` (cf. `services/api/src/lib/jwt-device.ts`).
- TTL du token : **15 min**. Anti-replay : `jti` stocké en base (`token_nonces`).
- La clé `JWT_DEVICE_SECRET` est rotée tous les 90 jours (cf. §8.2). En cas de
  compromission d'un seul distributeur, toute la flotte doit être ré-enrôlée — c'est
  une limite connue, mitigée par le scellement physique du boîtier.

---

## 3. Chiffrement

### 3.1 En transit
- **HTTPS obligatoire** sur tout le périmètre (Railway + Supabase + EMQX Cloud).
- TLS 1.2 minimum, TLS 1.3 préféré.
- MQTT chiffré (port 8883) avec authentification mutuelle (cert serveur + cert client).
- Connexion Postgres : `sslmode=require` (Supabase l'impose).
- Connexion Redis : `rediss://` (TLS) en prod.

### 3.2 Au repos
- **Postgres (Supabase)** : chiffrement AES-256 transparent (TDE) géré par AWS RDS sous-jacent.
- **Redis (Railway)** : chiffrement disque AWS EBS.
- **Logs et backups** : chiffrés côté fournisseur (cf. clauses Supabase/Railway).
- **Secrets** : variables d'environnement Railway (chiffrées au repos, accessibles
  uniquement aux membres de l'équipe avec rôle `admin` sur le projet Railway).

### 3.3 Secrets critiques
| Secret | Usage | Rotation |
|---|---|---|
| `JWT_DEVICE_SECRET` | Signature QR code firmware | 90 jours |
| `JWT_SESSION_SECRET` | Cookie session dashboard | 30 jours |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Vérif ID tokens Firebase | À la demande Google |
| `STRIPE_SECRET_KEY` | Facturation mairies | Annuelle |
| `DATABASE_URL` | Connexion Postgres | À la demande Supabase |
| `REDIS_URL` | Connexion Redis | À la demande Railway |

Aucun secret n'est jamais committé. `.env.example` documente uniquement les noms de
variables. La CI échouerait sur un push contenant un secret (cf. §7.4).

---

## 4. Sécurité applicative (API + dashboard)

### 4.1 En-têtes HTTP
- `@fastify/helmet` activé côté API → applique `X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy`, `X-DNS-Prefetch-Control`, etc.
- **CSP : actuellement désactivée** (`contentSecurityPolicy: false`) — voir §9 roadmap.
- HSTS : géré par Railway en bordure (`max-age=31536000; includeSubDomains`).

### 4.2 CORS
- `@fastify/cors` avec whitelist explicite (variable `CORS_ALLOWED_ORIGINS`, CSV des Origin acceptés, match exact) + `credentials: true`.
- Les requêtes sans header `Origin` (mobile native, curl, serveur-à-serveur) sont autorisées — CORS ne protège que les navigateurs.
- Garde-fou au boot : en `NODE_ENV=production`, la liste ne peut pas être vide ni constituée uniquement de loopback (sinon crash bruyant au démarrage de l'API).

### 4.3 Validation des entrées
- **Zod** sur 100% des endpoints API (body, query, params).
- `fastify-type-provider-zod` injecte la validation dans le routeur — aucun handler
  ne reçoit jamais une donnée non validée.
- Idem côté dashboard pour les formulaires (server actions Next.js).

### 4.4 Injection SQL
- **Drizzle ORM** uniquement — pas de string concat, pas de `pg.query(rawSQL)`.
- Les paramètres sont systématiquement passés via le placeholder driver Postgres.

### 4.5 Cookies de session
| Attribut | Valeur | Justification |
|---|---|---|
| `HttpOnly` | true | Inaccessible au JS, anti-XSS |
| `Secure` | true en prod | Cookie envoyé uniquement sur HTTPS |
| `SameSite` | `Lax` | Anti-CSRF léger (à durcir en `Strict` post-pilote) |
| `Path` | `/` | Périmètre dashboard |
| `Max-Age` | 24h | Re-login quotidien |

---

## 5. Sécurité base de données

### 5.1 Isolation multi-tenant
- Chaque ligne sensible porte une `commune_id` (FK vers `communes.id`).
- Le scoping est appliqué **au niveau applicatif** (helper `requireAdminScope()`) :
  toute requête d'un admin scopé est filtrée par sa `communeId` avant exécution.
- Les super-admins bypassent ce filtre (cas légitime : support, audit).
- **À venir (§9)** : passage à Postgres Row-Level Security (RLS) pour défense en profondeur.

### 5.2 Intégrité référentielle
- Toutes les FK vers des entités citoyennes (reservations, locker_events, reviews) sont
  `ON DELETE RESTRICT` — empêche la destruction accidentelle d'un user qui détruirait
  son historique d'emprunts (impact : statistiques mairie faussées, traçabilité perdue).
- C'est aussi la raison du choix **pseudonymisation > DELETE** côté RGPD (cf. `RGPD.md` §5).

### 5.3 Audit log
- Table `audit_logs` capture toutes les actions admin sensibles : création/modification
  de user, distributeur, commune, changement de rôle, suppression de réservation.
- Conservée 24 mois (au-delà, anonymisation par cron — à planifier).
- Consultable via `/audit` côté dashboard.

### 5.4 Backups
- Supabase PITR (Point-In-Time Recovery) sur 7 jours en plan Pro.
- Snapshot quotidien chiffré.
- **À ajouter (§9)** : dump manuel hebdomadaire stocké hors Supabase (S3 chiffré côté équipe).

---

## 6. Sécurité du firmware (Raspberry Pi CM4)

### 6.1 Modèle de confiance
Le firmware tourne sur du matériel **physiquement accessible** (distributeur public).
L'hypothèse : un attaquant peut, avec effort, ouvrir le boîtier et lire la mémoire.

### 6.2 Mitigations en place
- **Boîtier scellé** avec joint d'inviolabilité (la rupture est détectable visuellement).
- **JWT HS256 offline** : le RPi vérifie un QR code sans connexion Internet ; clé partagée
  avec l'app via `JWT_DEVICE_SECRET`. Compromission d'un RPi = ré-enrôlement de la flotte.
- **MQTT TLS + cert client unique par appareil** : un cert volé est révocable depuis le
  dashboard.
- **OTA chiffré via Balena.io** : seuls les firmwares signés par notre clé de release sont
  acceptés. Pas de SSH ouvert sur la flotte de prod (sauf override support, audité).
- **Anti-replay** : chaque QR code est usable 1× (le `jti` est inséré dans `token_nonces` ;
  retentative = rejet).

### 6.3 Limites assumées
- Pas de TEE / Secure Element sur la CM4 → un attaquant avec compétences moyennes peut
  extraire la clé en quelques heures.
- Mitigation produit (pas technique) : surveillance vidéo sur sites pilotes, joints
  d'inviolabilité, télémétrie watchdog (un RPi qui disparaît du réseau > 3 min déclenche
  une alerte).

---

## 7. Logging, monitoring & détection

### 7.1 Logs applicatifs
- **Pino** structuré JSON côté API → ingéré par Railway.
- Niveau `info` en prod, `debug` en dev.
- **Ce qu'on log** : ID user (UUID), endpoint, status code, latence, ID requête.
- **Ce qu'on NE log JAMAIS** : email en clair (hash uniquement si nécessaire), mot de passe,
  ID token Firebase, JWT de session, secrets, contenu de review utilisateur.
- Les logs sont conservés 30 jours par Railway, puis archivés froidement 12 mois.

### 7.2 Sentry
- `@sentry/node` capture les exceptions non gérées (API + dashboard).
- **PII scrubbing activé** : email, IP, headers d'auth stripés avant envoi.
- Rétention 30 jours.
- Accès Sentry restreint à l'équipe core (3 personnes en 2026).

### 7.3 Heartbeat & watchdog
- Chaque distributeur envoie un heartbeat MQTT toutes les 60s.
- Cron `heartbeat-watchdog` (toutes les 3 min) marque OFFLINE tout distributeur silencieux > 5 min
  → alerte dashboard pour l'admin mairie.

### 7.4 CI / dépendances
- GitHub Actions `ci.yml` : `pnpm install --frozen-lockfile` + `pnpm typecheck` + `pnpm test`
  sur chaque PR.
- GitHub Actions `security.yml` (workflow séparé, bloquant sur PR + cron hebdo lundi 06:00 UTC) :
  - **`pnpm audit --audit-level=high`** sur le monorepo (`audit-node` job).
    ⚠ Actuellement en `continue-on-error: true` (mode soft) : le monorepo a 25 vulns ≥ high
    au livrage du workflow (3 critical sur `fast-jwt`, 22 high sur `fast-uri` + `@xmldom/xmldom`).
    Le job remonte l'info sans bloquer les autres PRs. Passage en hard prévu via `pnpm.overrides`
    (cf. §9 item #13).
  - **`pip-audit`** sur les requirements du firmware (`audit-python` job, hard) — 0 vuln au livrage.
  - **Secret scan** via `scripts/preflight.sh --secrets` (11 patterns connus : AWS, GitHub PAT,
    Stripe live, Slack, Firebase, JWT secret, Postgres URL avec password, etc.) — hard.
- **Dependabot** (`.github/dependabot.yml`) : updates auto hebdomadaires (lundi 07:00 Paris)
  pour npm/pnpm, pip (firmware), github-actions et docker base images. Minor+patch
  regroupés en une PR par ecosystem, majors en PRs séparées (review attentive).

---

## 8. Réponse à incident

### 8.1 Détection
- Alertes Sentry sur taux d'erreur > 1% / 5 min.
- Alerte Railway sur indisponibilité service > 2 min.
- Watchdog distributeurs (§7.3).
- Toute déclaration de compromission d'un compte admin → procédure §8.2 immédiate.

### 8.2 Procédure de rotation d'urgence
1. **Identifier le périmètre** (un compte, une mairie, toute la prod ?).
2. **Révoquer** : reset password Firebase + invalidation cookies session (rotation `JWT_SESSION_SECRET`).
3. **Tracer** : extraire les `audit_logs` du compte/période concernée.
4. **Pour le firmware** : si `JWT_DEVICE_SECRET` compromise, rotation + redéploiement OTA Balena
   sur toute la flotte (~30 min d'indisponibilité partielle).
5. **Communication** : notifier la mairie cliente dans les 24h, et la CNIL dans les 72h si
   données personnelles touchées (obligation RGPD art. 33).

### 8.3 Contacts
- **Équipe SportLocker** : security@sportlocker.fr (boîte alias monitorée 24/7 par l'astreinte).
- **CNIL** : https://www.cnil.fr/fr/notifier-une-violation-de-donnees-personnelles
- **DPO de la mairie cliente** : renseigné dans `communes.dpo_email` lors de l'onboarding.

---

## 9. Roadmap sécurité (transparence honnête)

Ce qui n'est **pas encore** en place, par ordre de priorité :

| # | Item | Cible | Effort |
|---|---|---|---|
| 1 | Rate-limit `/auth/*` (anti-bruteforce) | T2 2026 | 1 j |
| 2 | CSP stricte côté dashboard (réactiver helmet) | T2 2026 | 2 j |
| 3 | 2FA TOTP obligatoire pour super-admins | T3 2026 | 3 j |
| 4 | ~~CORS whitelist explicite (vs `origin: true`)~~ | ✅ **done** — variable d'env `CORS_ALLOWED_ORIGINS` (CSV, match exact), garde-fou prod sur whitelist vide / loopback-only. Voir §4.2. | — |
| 5 | Postgres Row-Level Security (défense en profondeur multi-tenant) | T3 2026 | 5 j |
| 6 | Backups manuels hebdo hors Supabase (S3 chiffré) | T2 2026 | 1 j |
| 7 | ~~`pnpm audit` bloquant en CI + Dependabot~~ | ✅ **done** (PR #67) — cf. §7.4 | — |
| 8 | ~~Secret-scanning GitHub Actions~~ | ✅ **done** (PR #67) — via `preflight.sh --secrets`, pas gitleaks (licence payante sur repos privés) | — |
| 9 | Pentest externe (ANSSI-qualifié si possible) | T4 2026 | budget ~15 k€ |
| 10 | Politique mot de passe Firebase durcie (10 car. min, complexité) | T2 2026 | 0.5 j |
| 11 | Anonymisation des `audit_logs` après 24 mois | T3 2026 | 1 j |
| 12 | SOC 2 Type I (si demande mairies > 50k habitants) | 2027 | budget ~40 k€ |
| 13 | ~~`pnpm.overrides` pour patcher fast-jwt (3 critical), fast-uri (high), @xmldom/xmldom (high) → passer `audit-node` en hard~~ | ✅ **done** — voir `package.json#pnpm.overrides`. Passe de 58 vulns (3 critical, 22 high) à 25 vulns (0 critical, 2 high). Toutes les GHSAs ≥ high sont désormais résolues (overrides + upgrades `tmp`/`vitest`/`astro`/`fastify`) — `audit-node` retiré du mode soft. _(Maj 2026-06-15 : `IGNORED_GHSAS` n'est plus vide — une exception tracée, cf. item #17.)_ | — |
| 14 | ~~**Migration `astro` 4 → 5+ pour résoudre `GHSA-wrwg-2hg8-v723` (XSS reflected via server islands, high)**~~ | ✅ **done** — `astro` 4.16 → 5.18.2 (+ `@astrojs/react` 4, `@astrojs/tailwind` 6, `@astrojs/check` 0.9.9) sur `apps/web`. Cible Astro **5** (et non 6, qui exige Node ≥ 22.12 alors que la CI tourne en Node 20) : 5.15.8+ corrige déjà le XSS. GHSA retirée d'`IGNORED_GHSAS`. `astro check` + build vitrine OK. | — |
| 15 | ~~**Migration `fastify` 4 → 5+ pour résoudre `GHSA-jx2c-rxcm-jvmq` (Content-Type bypass, high)**~~ | ✅ **done** — `fastify` 4.26 → 5.8.5 + plugins majeurs (`@fastify/cors` 11, `helmet` 13, `jwt` 10, `sensible` 6, `swagger` 9, `swagger-ui` 5, `websocket` 11, `fastify-plugin` 5) + `fastify-type-provider-zod` 4 (compatible Fastify 5 **sans** bump zod 4). Breaking changes corrigés : `setErrorHandler` (err typé `FastifyError`), `reply.send(null)` sur 204, codes de réponse déclarés dans le schéma. Tests api **524/524**, typecheck OK. | — |
| 16 | ~~**Migration `vitest` 1.6 → 4.1+ pour résoudre `GHSA-5xrq-8626-4rwp` (lecture/exécution de fichier arbitraire via le serveur Vitest UI, critical)**~~ | ✅ **done** (PR #239) — `vitest` + `@vitest/coverage-v8` bumpés en `4.1.8`, `vite ^7` ajouté (peer requis), `poolOptions.forks.singleFork` → `maxWorkers` (pool rework v4). GHSA retirée d'`IGNORED_GHSAS` : la vuln est réellement corrigée, plus seulement ignorée. Tests verts : api 485, dashboard 135, citizen 54. | — |
| 17 | **Bump `esbuild` ≥ 0.28.1 (via Astro/Vite) pour résoudre `GHSA-gv7w-rqvm-qjhr`** (high — intégrité binaire manquante du module Deno, RCE via `NPM_CONFIG_REGISTRY`). **Tracée dans `IGNORED_GHSAS` depuis le 2026-06-15.** `esbuild` est transitif (Vite/Astro, `apps/web`) ; la seule version patchée (0.28.1) casse `astro check`/build sur la cible navigateurs actuelle (« Transforming destructuring … not supported »), donc un override `pnpm` standalone n'est pas viable — le correctif réel passe par une montée Astro/Vite compatibles esbuild 0.28.x (à coordonner avec le triage Dependabot). Risque réel faible : advisory **dev-tooling**, non exploitable au runtime de l'app. À retirer d'`IGNORED_GHSAS` une fois le bump fait. | T3 2026 | 1-2 j |
| 18 | **Migration `astro` 5 → 6 (+ CI Node ≥ 22.12) pour résoudre `GHSA-8hv8-536x-4wqp` (XSS reflected via slot non échappé) et `GHSA-2pvr-wf23-7pc7` (SSRF Host header sur error page prerender), high.** **Tracées dans `IGNORED_GHSAS` depuis le 2026-06-16.** Patch disponible UNIQUEMENT en Astro 6.x (≥6.3.3 / ≥6.4.6) ; on est resté en Astro 5 (cf. #14) car Astro 6 exige Node ≥ 22.12 alors que la CI tourne en Node 20 — bumper Node en CI est un prérequis. Risque réel faible : `apps/web` est `output: static` (HTML prérendu, pas de SSR ni de slot dynamique piloté par la requête), donc XSS reflected et SSRF runtime non exploitables en prod. À retirer d'`IGNORED_GHSAS` une fois la migration Astro 6 + Node 22 faite. **Blocage identifié 2026-06-22 (tentative reportée) :** le vrai prérequis n'est pas seulement Node 22 — `@astrojs/react` n'a PAS de release stable pour Astro 6 (uniquement `6.0.0-alpha/beta` ; stable = 5.0.7, peer Astro ≤5), or toute la vitrine repose sur des îlots React → migrer mettrait une intégration React **beta en production**. De plus `@astrojs/tailwind` (peer `astro ^3‖^4‖^5`, Tailwind 3 only) ne supporte pas Astro 6 → il faudra recâbler **Tailwind 3 via PostCSS** (éviter une cascade Tailwind 3→4). **Reprendre quand `@astrojs/react` v6 stable est publié**, pas avant : l'écosystème n'est pas mûr et le risque de casser la vitrine dépasse celui des 2 advisories (faible, site statique). L'item #17 (esbuild) sera résolu par la même montée Astro/Vite. | T4 2026 | 2-3 j |

**Politique de transparence** : tout item listé ici sera marqué `done` dans ce document
au moment du merge de la PR correspondante, avec lien vers le commit. Aucun item ne sera
silencieusement retiré.

---

## 10. Responsabilités partagées avec la mairie

| Domaine | SportLocker | Mairie cliente |
|---|---|---|
| Sécurité de l'infrastructure cloud | ✅ | — |
| Sécurité du code applicatif | ✅ | — |
| Politique de mots de passe | ✅ (Firebase) | Sensibilisation des agents |
| Compromission d'un compte admin | ✅ Procédure §8 | ✅ Signalement immédiat |
| Sécurité physique des distributeurs (boîtier, environnement) | Conseil installation | ✅ Choix d'emplacement, surveillance |
| Sauvegardes des données | ✅ Supabase PITR 7j | (export CSV via dashboard à la demande) |
| Notification CNIL en cas de breach | ✅ < 72h | ✅ Co-signataire si nécessaire |

---

## 11. Contact

| Sujet | Adresse |
|---|---|
| Sécurité applicative, vulnérabilités | security@sportlocker.fr |
| Demande d'audit (RSSI mairie) | dpo@sportlocker.fr |
| Astreinte 24/7 (incident en cours) | +33 X XX XX XX XX (numéro communiqué au signing) |

**Politique de divulgation responsable** : un chercheur signalant une vulnérabilité à
security@sportlocker.fr reçoit un accusé sous 48h, un correctif sous 30j pour les
vulnérabilités critiques (CVSS ≥ 7.0), et une mention dans le hall of fame public (sauf
opposition).

---

*Document maintenu par l'équipe SportLocker. Toute mise à jour matérielle (changement de
fournisseur cloud, ajout d'une mesure de sécurité, incident de sécurité significatif)
donne lieu à une nouvelle version datée et à notification des DPO/RSSI clients.*
