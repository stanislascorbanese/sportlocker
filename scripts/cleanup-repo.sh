#!/usr/bin/env bash
# Nettoyage du dépôt après le pivot campings (septembre 2026).
#
# À LIRE AVANT DE LANCER. Ce script supprime des branches et des répertoires.
# Il ne fait rien tant que CONFIRM=1 n'est pas passé en variable d'environnement.
#
#   bash scripts/cleanup-repo.sh          # affiche ce qui serait fait
#   CONFIRM=1 bash scripts/cleanup-repo.sh
#
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

DRY=1
[[ "${CONFIRM:-0}" == "1" ]] && DRY=0
run() { if [[ $DRY == 1 ]]; then echo "  [simulation] $*"; else echo "  $*"; "$@"; fi; }

echo "=== 1. Verrou d'index resté en place ==="
if [[ -f .git/index.lock ]]; then
  echo "  .git/index.lock présent — il bloque tout commit."
  run rm -f .git/index.lock
fi

echo
echo "=== 2. Worktrees orphelins ==="
git worktree list
echo "  Les worktrees ci-dessous portent des branches déjà fusionnées ou abandonnées."
echo "  Chacun pèse ~1,4 Go avec ses node_modules."
for w in sportlocker-balena sportlocker-citizen-flows sportlocker-deps \
         sportlocker-docs-ops sportlocker-finance sportlocker-firmware-hw \
         sportlocker-locker-monitor sportlocker-mqtt-bridge; do
  d="$HOME/$w"
  [[ -d "$d" ]] || continue
  echo "  --> $d"
  run git worktree remove --force "$d"
done
run git worktree prune

echo
echo "=== 3. Branches locales déjà fusionnées dans origin/main ==="
git branch --merged origin/main | grep -vE '^\*| main$' | while read -r b; do
  run git branch -d "$b"
done

echo
echo "=== 4. Branches distantes claude/* non fusionnées ==="
echo "  Ce sont des branches de travail générées automatiquement en mai-juin 2026."
echo "  Elles ne sont référencées par aucune PR ouverte."
git branch -r --no-merged origin/main | sed 's/^ *//' \
  | grep '^origin/claude/' | sed 's#^origin/##' | while read -r b; do
  run git push origin --delete "$b"
done

echo
echo "=== 5. Branches distantes dependabot/* ==="
git branch -r | sed 's/^ *//' | grep '^origin/dependabot/' | sed 's#^origin/##' | while read -r b; do
  run git push origin --delete "$b"
done

echo
echo "=== 6. Fichier temporaire de vérification de build ==="
if [[ -f apps/web/_webcheck.tgz ]]; then
  echo "  Archive créée en septembre 2026 pour vérifier le build de la vitrine hors machine."
  run rm -f apps/web/_webcheck.tgz
fi

echo
echo "=== 7. Migration en doublon ==="
if [[ -f database/migrations/0005_reservations_unique_active.sql ]]; then
  echo "  Doublon de 0018_reservations_unique_active.sql (renommage du 10/06/2026 non terminé)."
  run git rm database/migrations/0005_reservations_unique_active.sql
fi

echo
if [[ $DRY == 1 ]]; then
  echo "Rien n'a été fait. Relance avec CONFIRM=1 pour appliquer."
else
  echo "Terminé. Pense à committer la suppression de la migration."
fi
