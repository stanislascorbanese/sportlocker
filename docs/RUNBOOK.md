# SportLocker — Runbook

Guide opérationnel pour développer, déployer et exploiter SportLocker au quotidien.
À garder à portée de main. Complète `ARCHITECTURE.md` (qui décrit le pourquoi) en
expliquant le **comment**.

---

## 1. Stack en bref

| Composant | Techno | Hébergement | Région |
|---|---|---|---|
| API backend | Fastify 4 + Drizzle + TS | Railway (Dockerfile) | US West |
| Dashboard ops | Next.js 15 App Router | Railway (Nixpacks) | US West |
| App citoyenne | Next.js 15 PWA | Railway (Dockerfile) | EU West |
| Site vitrine | Astro statique | Railway (Dockerfile) | US West |
| Firmware IoT | Python 3.11 (paho, OpenCV, jose) | Balena (Raspberry Pi CM4) | sur site |
| Base de données | PostgreSQL 16 managé | **Supabase** | EU Central (Frankfurt) |
| Cache & queues | Redis 7 + BullMQ | Railway service | US West |
| Broker MQTT | EMQX Cloud Serverless | EMQX SaaS | EU Central (Frankfurt) |
| Auth | Firebase Auth | Firebase SaaS | - |
| CI | GitHub Actions (Node + Python) | GitHub | - |

---

## 2. URLs publiques (production)

| Service | URL |
|---|---|
| API | `https://sportlockerapi-production.up.railway.app` |
| Dashboard | `https://sportlockerdashboard-production.up.railway.app` |
| Site web | Railway → `@sportlocker/web` → Settings → Networking |
| App citoyenne | `https://app.sportlocker.fr` |

### Endpoints API utiles
- `GET /health/` — healthcheck (utilisé par Railway probe)
- `GET /v1/distributors/` — liste complète
- `GET /v1/distributors/:id` — détail + lockers
- `GET /v1/distributors/nearby?lat=&lng=&radius_km=` — géo search
- `GET /v1/item-types` — catalogue
- `POST /v1/auth/register` — échange Firebase idToken → JWT session
- `POST /v1/reservations` — créer une réservation (auth requise)
- `POST /v1/distributors` / `PUT /v1/distributors/:id` — admin (role=admin requis)

---

## 3. Consoles d'administration

| Service | URL | Pour quoi |
|---|---|---|
| Railway | https://railway.com | Deploys, logs, variables, scale |
| Supabase | https://supabase.com/dashboard | DB browser, SQL editor, password reset, backups |
| EMQX Cloud | https://cloud-intl.emqx.com | Broker MQTT, users, ACLs, monitoring |
| GitHub | https://github.com/stanislascorbanese/sportlocker | Code, PRs, Actions CI |
| Firebase | https://console.firebase.google.com | Auth providers, users, settings |
| Sentry | https://sentry.io | Erreurs prod (à activer) |
| Balena | https://www.balena.io | OTA firmware Pi (à activer) |
| Stripe | https://dashboard.stripe.com | Paiements / cautions (à activer) |

---

## 4. Dev local — comment démarrer

### Prérequis machine
- Node 20 + pnpm 9 (via `corepack enable && corepack prepare pnpm@9.0.0 --activate`)
- Docker Desktop (pour Postgres + Redis locaux + testcontainers)
- Python 3.11 (pour le firmware)
- Une clé SSH GitHub déjà ajoutée (sinon : `ssh-keygen -t ed25519 -C "<email>"`)

### Premier setup
```bash
git clone git@github.com:stanislascorbanese/sportlocker.git
cd sportlocker
pnpm install
docker compose -f infra/docker/docker-compose.dev.yml up -d  # Postgres + Redis
cp .env.example .env  # remplir les secrets locaux
```

### Lancer un service en dev
| Service | Commande | Port |
|---|---|---|
| API | `pnpm --filter @sportlocker/api dev` | 3000 |
| Dashboard | `pnpm --filter @sportlocker/dashboard dev` | 3001 |
| Citizen PWA | `pnpm --filter @sportlocker/citizen dev` | 3002 |
| Web | `pnpm --filter @sportlocker/web dev` | 4000 |
| Tous en parallèle | `pnpm dev` | (turbo) |

### Tests
```bash
pnpm test                            # tous les workspaces
pnpm --filter @sportlocker/api test  # API seule
cd services/firmware && pytest       # firmware Python
```

---

## 5. Workflow Git

**Convention** : aucun push direct sur `main`. Toujours passer par une feature
branch + PR + CI verte + squash merge.

```bash
# Démarrer une feature
git checkout main && git pull
git checkout -b feat/<sujet-court>

# Coder, committer (conventional commits FR)
git commit -m "feat(api): ajout endpoint /xxx"

# Pousser
git push origin feat/<sujet-court>

# Ouvrir la PR (gh CLI installé)
gh pr create --title "feat(api): ajout endpoint /xxx" --body "..."

# Attendre la CI verte (gh pr checks <num>)
# Merger
gh pr merge <num> --squash --delete-branch
```

**Branche protégée** : `main` (ruleset GitHub configurée mais non enforced sur
plan free privé — on respecte la convention par discipline).

---

## 6. Recettes opérationnelles

### Voir les logs d'un service Railway
1. Railway → projet `sportlocker` → service → onglet **Deploy Logs** (runtime)
2. ou **Build Logs** (image build)
3. ou **HTTP Logs** (requêtes entrantes)

### Redéployer un service
- **Auto** : tout push sur `main` redéploie les services concernés (Railway watch repo)
- **Manuel** : Railway → service → Deployments → bouton **Deploy** en haut

### Ajouter / modifier une variable d'environnement
1. Railway → service → onglet **Variables**
2. `+ New Variable` ou cliquer la var existante pour éditer
3. **Save** → bandeau **Apply changes** apparaît en haut → **Deploy**
4. Le service redémarre (~1 min)

### Coller un secret sans le leaker dans le terminal
```bash
# Génère le secret dans un fichier (jamais affiché en terminal)
openssl rand -hex 32 > /tmp/secret.txt
# Ouvre dans VS Code pour le visualiser
code /tmp/secret.txt
# Copie depuis l'onglet VS Code → colle dans Railway
# Une fois posé sur Railway, supprime le fichier
rm /tmp/secret.txt
```

### Lancer le seed DB (Supabase prod)
1. Récupère `DATABASE_URL` depuis Railway → `@sportlocker/api` → Variables → Show value
2. ```bash
   cd services/api
   DATABASE_URL='postgresql://postgres.kxjtusuecgyejdttskyc:PWD@aws-1-eu-central-1.pooler.supabase.com:5432/postgres' pnpm db:seed
   ```
   (utiliser **quotes simples** autour de l'URL)
3. Le script est idempotent : safe à relancer

### Rotation d'un secret (ex : JWT_SESSION_SECRET)
1. Générer un nouveau secret dans un fichier (cf. recette ci-dessus)
2. Poser sur Railway → `@sportlocker/api` → Variables → édit `JWT_SESSION_SECRET`
3. Apply → l'API redémarre
4. ⚠️ Tous les JWT déjà émis deviennent invalides — les utilisateurs doivent se reconnecter
5. ⚠️ Tous les `sessionToken` admin déjà émis deviennent invalides — les admins
   devront se reconnecter via `dashboard.sportlocker.com/login` (échange
   Firebase ID token → sessionToken).

### Tester l'API depuis le terminal
```bash
curl -sS https://sportlockerapi-production.up.railway.app/health/
curl -sS https://sportlockerapi-production.up.railway.app/v1/distributors/ | jq .
curl -sS 'https://sportlockerapi-production.up.railway.app/v1/distributors/nearby?lat=48.86&lng=2.35&radius_km=10' | jq .
```

### Voir l'état de la CI sur une PR
```bash
gh pr checks <num>           # checks de la PR
gh pr view <num>             # vue d'ensemble
gh run view <run-id> --log   # logs détaillés d'un run échoué
```

### Reset password Supabase
1. Supabase dashboard → projet `sportlocker` → ⌘+K → tape "password"
2. Reset database password → Generate → **noter immédiatement**
3. Mettre à jour `DATABASE_URL` sur Railway → `@sportlocker/api` → Variables

---

## 7. Plans d'urgence

### L'API est down
1. Vérifier `https://sportlockerapi-production.up.railway.app/health/` → si timeout/500
2. Railway → `@sportlocker/api` → Deployments → voir l'état du dernier deploy
3. Si "Failed" → cliquer pour voir Deploy Logs → diagnostiquer
4. Rollback rapide : Railway → Deployments → ancien deploy vert → bouton ⋮ → **Redeploy**

### La DB Supabase est inaccessible
1. Vérifier https://status.supabase.com
2. Si OK côté Supabase : tester depuis Railway si erreur réseau (latence US ↔ EU)
3. Fallback temporaire : remettre `${{Postgres.DATABASE_URL}}` (ancien Postgres Railway) le temps de débloquer — **note** : sera vide, perte de données récentes

### CI bloque tous les merges
1. Vérifier https://github.com/stanislascorbanese/sportlocker/actions
2. Lire les logs du run rouge
3. Si bug dans le workflow → PR de fix sur `.github/workflows/ci.yml`
4. En vraie urgence : settings GitHub → Rules → désactiver temporairement la ruleset (à réactiver après)

---

## 8. Liens utiles à bookmarker

1. https://railway.com — toutes les ops infra
2. https://supabase.com/dashboard — la DB
3. https://github.com/stanislascorbanese/sportlocker — code + PRs + CI
4. https://cloud-intl.emqx.com — broker MQTT
5. https://sportlockerapi-production.up.railway.app/health/ — ping API

---

## 9. Variables d'environnement critiques

À ne jamais committer. Tous présents sur Railway → service correspondant.

| Variable | Service | Description |
|---|---|---|
| `DATABASE_URL` | api | URL Supabase Session pooler (port 5432) |
| `REDIS_URL` | api | URL Redis Railway |
| `MQTT_URL` | api, firmware | URL broker EMQX (`mqtts://user:pwd@host:8883`) |
| `JWT_SESSION_SECRET` | api | Signature JWT session utilisateur (min 32 chars) |
| `JWT_DEVICE_SECRET` | api, firmware | Signature JWT offline QR (min 32 chars) |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | api | JSON credentials Firebase Admin SDK |
| `FIREBASE_PROJECT_ID` | api | ID projet Firebase |
| `INTERNAL_API_URL` | dashboard | URL API (server-side fetch) |
| `NEXT_PUBLIC_FIREBASE_*` | dashboard | Config Firebase Auth web (API_KEY, AUTH_DOMAIN, PROJECT_ID, APP_ID) |
| `SENTRY_DSN` | api, firmware | DSN Sentry côté Node (server-only) |
| `NEXT_PUBLIC_SENTRY_DSN` | dashboard, citizen | DSN Sentry côté Next.js (client + server, write-only) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | api | Clés Web Push pour le cron `slot-reminders` (`npx web-push generate-vapid-keys`) |
| `VAPID_SUBJECT` | api | Contact RFC 8292, default `mailto:contact@sportlocker.fr` |

---

## 10. Activer Sentry (observabilité)

Sans Sentry, les erreurs prod sont invisibles tant qu'un user ne râle pas.
Le code est déjà câblé sur **api / dashboard / citizen** ; il suffit de
fournir les DSN. Plan free : 5 000 erreurs + 10 000 events perf / mois,
amplement suffisant pour un MVP.

### Création d'un projet Sentry

1. [sentry.io](https://sentry.io) → connexion → **Create project**
2. Crée **3 projets séparés** (un par surface — permet de voir les erreurs filtrées) :
   - `sportlocker-api` (platform : **Node.js / Express**)
   - `sportlocker-dashboard` (platform : **Next.js**)
   - `sportlocker-citizen` (platform : **Next.js**)
3. Pour chacun, Sentry te donne un **DSN** type `https://<key>@o<orgid>.ingest.sentry.io/<projid>`

### Variables Railway à poser

| Service | Variable | Valeur |
|---|---|---|
| `@sportlocker/api` | `SENTRY_DSN` | DSN du projet `sportlocker-api` |
| `@sportlocker/dashboard` | `NEXT_PUBLIC_SENTRY_DSN` | DSN du projet `sportlocker-dashboard` |
| `citizen` | `NEXT_PUBLIC_SENTRY_DSN` | DSN du projet `sportlocker-citizen` |

Au prochain redéploiement, les 3 services émettent vers Sentry. Aucun
code à toucher — le SDK est no-op tant que le DSN est absent.

### Vérifier que ça remonte

Test rapide une fois set :

```bash
# API : déclenche une 500
curl https://api.sportlocker.fr/v1/admin/audit  # 401 attendu, pas 500 → ok
# Trigger volontaire : ajoute un throw temporaire dans une route, déploie, hit la route.
# Tu dois voir l'erreur dans sentry.io dans la minute.
```

Côté browser, ouvre la console PWA citizen et tape `throw new Error('test')` —
ça doit apparaître dans le projet `sportlocker-citizen` côté Sentry.

### Bonus : source maps déminifiées

Pour avoir des stack traces lisibles (pas du `chunks/720-b6f5c1.js:1:42`),
génère un auth token Sentry (Settings → Account → API → User Auth Tokens,
scope `project:releases`) et set `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` +
`SENTRY_PROJECT` côté build Railway. Le `withSentryConfig` upload les
source maps au build et Sentry les utilise au runtime.

---

## 11. Pour aller plus loin

- Architecture détaillée : voir `docs/ARCHITECTURE.md`
- Schéma DB : voir `database/schema.sql` (1165 lignes commentées)
- Règles métier (state machine locker, RGPD, etc.) : voir `CLAUDE.md`
- Conventions de code, commits, tests : voir `CLAUDE.md`
