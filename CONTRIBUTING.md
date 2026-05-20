# Contribuer à SportLocker

> Guide à destination des **développeurs humains** et des **agents Claude** qui travaillent
> sur le monorepo. Si tu rejoins le projet, lis ce doc avant ton premier commit.

---

## 1. Environnement de développement

### Prérequis
- Node.js **20+** (LTS, idéalement via `nvm`)
- pnpm **9+** (`corepack enable && corepack prepare pnpm@9 --activate`)
- Docker Desktop (pour Postgres + Redis + EMQX locaux)
- Git **2.35+** (le pattern worktree ci-dessous nécessite une version récente)

### Premier lancement
```bash
git clone https://github.com/stanislascorbanese/sportlocker.git
cd sportlocker
cp .env.example .env                                                # remplir les secrets
docker compose -f infra/docker/docker-compose.dev.yml up -d         # infra locale
pnpm install
pnpm dev                                                            # tout en parallèle
```

URLs : voir [README.md §URLs](./README.md).

---

## 2. Pattern de travail : git worktree (obligatoire)

Plusieurs développeurs (humains **et** agents Claude) travaillent en parallèle sur ce
monorepo. Pour éviter les conflits de merge et les commits perdus, on impose le pattern
suivant :

### 2.1 Une voie = un worktree
Chaque chantier vit dans son propre worktree, sur sa propre branche `claude/<sujet>` ou
`feat/<sujet>`. Le **repo principal** (`/Users/.../sportlocker`) reste idéalement sur
`main` et sert de référence.

```bash
# Créer un worktree pour un nouveau chantier
git worktree add ../sportlocker-feat-xyz -b claude/feat-xyz origin/main
cd ../sportlocker-feat-xyz
# … travailler ici, commit, push depuis ici …
```

### 2.2 Toujours commit/push depuis le worktree
**Ne jamais** faire `cd /chemin/principal && git commit` quand on travaille sur une voie :
le repo principal peut être checkout sur la branche d'un autre dev (ou d'un autre Claude),
et le commit landera au mauvais endroit. C'est le problème #1 qu'on rencontre.

> Si ça arrive quand même : `git cherry-pick <sha>` depuis le bon worktree puis
> `git reset --hard origin/<branche>` sur la branche polluée pour la remettre droite,
> et `git push --force-with-lease`.

### 2.3 Nettoyer après merge
```bash
git worktree remove ../sportlocker-feat-xyz
git push origin --delete claude/feat-xyz                            # ou laisser GitHub auto-delete
```

---

## 3. Coordination des agents Claude (jusqu'à 14+ en parallèle)

Ce projet utilise massivement Claude Code en sessions parallèles. Pour que ça scale sans
conflit :

### 3.1 Une session = un sujet ciblé
Chaque session Claude est cantonnée à un périmètre clair (ex. "ajoute tests admin
communes", "fixe le switch de langue dashboard"). Le préfixe de branche `claude/` signale
qu'un agent y travaille.

### 3.2 Voies à respecter (zones de fichiers)
Avant de toucher un fichier, vérifier que **personne d'autre n'y bosse** :
```bash
git branch -a | grep claude/
gh pr list --state open
```

Si tu vois `claude/page-items` ouvert et que tu allais toucher
`apps/dashboard/src/app/items/` → **rebascule sur autre chose**. Les conflits de merge
sur du code TS strict coûtent cher.

### 3.3 Zones safe (rarement touchées)
- `docs/*.md` — souvent dispo (sauf si une voie `claude/docs-*` est ouverte)
- `scripts/*` — outils ponctuels
- `.github/workflows/` — touche CI uniquement
- `CONTRIBUTING.md`, `CHANGELOG.md` — méta-docs

### 3.4 Zones sensibles (accord humain requis)
Conformément à [`CLAUDE.md`](./CLAUDE.md) :
- `database/schema.sql` — migrations versionnées uniquement, jamais d'édition directe
- `services/firmware/jwt/*` — logique JWT offline critique (sécurité)
- `packages/types/` — impact cross-app, ne pas modifier sans accord

---

## 4. Avant de pousser : pré-flight

Avant **chaque** `git push`, faire passer le script de pré-flight :

```bash
./scripts/preflight.sh
```

Il vérifie séquentiellement :
1. Pas de secret committé (regex sur tokens GitHub, AWS, Stripe, Firebase…)
2. `pnpm typecheck` passe sur tout le monorepo
3. `pnpm test` passe sur tout le monorepo
4. `pnpm audit --audit-level=high` ne trouve rien de critique
5. Pas de `console.log` oublié dans `apps/` ou `services/`

Si un check échoue → on fixe avant de pousser, pas l'inverse.

---

## 5. Conventions de code

### 5.1 TypeScript strict
- Pas de `any` explicite — utiliser `unknown` + narrowing.
- Pas de `// @ts-ignore` — préférer `// @ts-expect-error <raison>` (et résoudre vite).
- Imports relatifs avec extension `.js` (Node ESM strict).

### 5.2 Validation
- **Zod** sur toutes les entrées (body, query, params, formulaires).
- `fastify-type-provider-zod` côté API → schémas typés.

### 5.3 SQL
- **Drizzle ORM uniquement** — jamais de string concat (anti SQLi).
- Migrations dans `database/migrations/NNNN_description.sql`, numérotation séquentielle.

### 5.4 Style
- Prettier appliqué (config dans `packages/config/`).
- Pas d'emoji dans le code source. OK en commit messages si pertinent (rare).
- Commentaires en français, mais variables/fonctions en anglais.

---

## 6. Conventional commits (en français)

Format : `<type>(<scope>): <description>`

| Type | Quand l'utiliser |
|---|---|
| `feat` | Nouvelle fonctionnalité utilisateur visible |
| `fix` | Bug fix |
| `refactor` | Réorganisation sans changement de comportement |
| `chore` | Tâches techniques (deps, config) |
| `docs` | Documentation pure |
| `test` | Ajout/modif de tests |
| `perf` | Optimisation perf mesurée |

Exemples :
- `feat(dashboard): autocomplétion adresse pour distributeurs (BAN)`
- `fix(api): scope commune sur GET /reservations`
- `docs(security): politique de sécurité pour RSSI mairie`

Body multi-lignes encouragé pour les commits non-triviaux. Cible : **un commit = une idée**.

---

## 7. Pull requests

### 7.1 Format du titre
Même format que les commits. Une PR = idéalement un seul commit (squash sinon).

### 7.2 Description type
```markdown
## Summary
- Quoi en 2-3 bullets

## Pourquoi maintenant
- Contexte business / technique

## Test plan
- [ ] Étape 1
- [ ] Étape 2
```

### 7.3 Checks CI
GitHub Actions lance automatiquement :
- `pnpm install --frozen-lockfile`
- `pnpm typecheck`
- `pnpm test`

Si rouge → on fixe, on ne merge pas.

### 7.4 Review
- 1 review humaine minimum pour `services/api/src/`, `apps/dashboard/src/`, `database/`.
- Les PRs de doc (`docs/*.md`, `CONTRIBUTING.md`) peuvent être mergées par l'auteur après self-review.
- Pas de force-push après ouverture de review (sauf rebase autorisé sur la branche).

---

## 8. Tests

| Stack | Outil | Localisation |
|---|---|---|
| API (Fastify) | vitest + testcontainers Postgres | `services/api/test/` |
| Dashboard (Next.js) | (à venir — playwright e2e prévu) | — |
| Mobile (Expo) | Jest + React Testing Library | `apps/mobile/__tests__/` |
| Firmware (Python) | pytest | `services/firmware/tests/` |

Couverture minimale visée : **80% sur les routes critiques** (auth, reservations, distributors).

Lancer en local :
```bash
pnpm test                                                           # tout le monorepo
pnpm --filter @sportlocker/api test                                 # API seule
pnpm --filter @sportlocker/api test:watch                           # mode watch
pnpm --filter @sportlocker/api test:coverage                        # avec couverture
```

---

## 9. Variables d'environnement & secrets

- `.env.example` documente les noms de variables (commité).
- `.env` contient les vraies valeurs (**jamais commité**, gitignored).
- Secrets prod : configurés dans Railway (cf. `docs/SECURITY.md` §3.3 pour la liste).
- Si tu ajoutes une variable, met à jour `.env.example` ET `services/api/src/config/env.ts` (zod schema).
- Avant push : `./scripts/preflight.sh` détecte un secret oublié.

---

## 10. Quand demander de l'aide

- **Tu changes le schéma SQL** → confirme avec un humain avant.
- **Tu touches la logique JWT firmware** → confirme avec un humain.
- **Tu touches `packages/types/`** → impact cross-app, vérifie les usages.
- **Tu vois 4+ branches `claude/*` ouvertes sur ton fichier** → repère-toi sur les
  worktrees actifs (`git worktree list`) pour comprendre qui fait quoi.
- **Tu hésites sur une décision business** (tarif, fonctionnalité, périmètre mairie) →
  pas une décision tech, demande au product owner.

---

## 11. Ressources internes

- [`README.md`](./README.md) — vue d'ensemble du repo
- [`CLAUDE.md`](./CLAUDE.md) — contexte projet pour Claude (mis à jour régulièrement)
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — choix techniques
- [`docs/CDC.md`](./docs/CDC.md) — cahier des charges fonctionnel
- [`docs/RUNBOOK.md`](./docs/RUNBOOK.md) — procédures opérationnelles
- [`docs/SECURITY.md`](./docs/SECURITY.md) — politique sécurité
- [`docs/RGPD.md`](./docs/RGPD.md) — conformité RGPD

---

*Doc maintenue par l'équipe. Si tu identifies un manque, ajoute-le via PR — c'est le
genre de contribution la plus utile à un nouveau dev.*
