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
- `@fastify/cors` configuré avec `origin: true` + `credentials: true`.
- **À durcir en prod** : whitelist explicite des origines (dashboard, app mobile via custom scheme).

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
- GitHub Actions : `pnpm install --frozen-lockfile` + `pnpm typecheck` + `pnpm test`
  sur chaque PR.
- **À ajouter (§9)** : `pnpm audit --audit-level=high` bloquant + Dependabot hebdo + secret-scanning.

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
| 4 | CORS whitelist explicite (vs `origin: true`) | T2 2026 | 0.5 j |
| 5 | Postgres Row-Level Security (défense en profondeur multi-tenant) | T3 2026 | 5 j |
| 6 | Backups manuels hebdo hors Supabase (S3 chiffré) | T2 2026 | 1 j |
| 7 | `pnpm audit` bloquant en CI + Dependabot | T2 2026 | 0.5 j |
| 8 | Secret-scanning GitHub Actions (gitleaks) | T2 2026 | 0.5 j |
| 9 | Pentest externe (ANSSI-qualifié si possible) | T4 2026 | budget ~15 k€ |
| 10 | Politique mot de passe Firebase durcie (10 car. min, complexité) | T2 2026 | 0.5 j |
| 11 | Anonymisation des `audit_logs` après 24 mois | T3 2026 | 1 j |
| 12 | SOC 2 Type I (si demande mairies > 50k habitants) | 2027 | budget ~40 k€ |

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
