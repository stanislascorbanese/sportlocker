#!/usr/bin/env bash
# Nettoyage du dépôt après le pivot campings (septembre 2026).
#
# À LIRE AVANT DE LANCER. Ce script supprime des branches et des répertoires.
# Il ne fait rien tant que CONFIRM=1 n'est pas passé en variable d'environnement.
#
#   bash scripts/cleanup-repo.sh          # affiche ce qui serait fait
#   CONFIRM=1 bash scripts/cleanup-repo.sh
#
# Deux garde-fous, chacun pour une bonne raison :
#
#   - les worktrees ne sont touchés que si leur répertoire est réellement
#     visible. Lancé depuis un environnement qui ne monte pas tout le disque
#     (l'espace de travail Cowork, un conteneur, une CI), `git worktree list`
#     les annonce tous « prunable » alors qu'ils existent : un prune les
#     orphelinerait en bloc, avec le travail non committé qu'ils contiennent ;
#
#   - les suppressions de branches distantes demandent DELETE_REMOTE=1 en plus
#     de CONFIRM=1. Un `push --delete` est irréversible côté GitHub et ne se
#     décide pas au passage d'un script de ménage.
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
else
  echo "  aucun."
fi

echo
echo "=== 2. Worktrees abandonnés ==="
git worktree list
echo
SEEN_ANY=0
for w in sportlocker-balena sportlocker-citizen-flows sportlocker-deps \
         sportlocker-docs-ops sportlocker-finance sportlocker-firmware-hw \
         sportlocker-locker-monitor sportlocker-mqtt-bridge; do
  d="$HOME/$w"
  if [[ ! -d "$d" ]]; then
    echo "  $w : répertoire invisible d'ici — ignoré."
    continue
  fi
  SEEN_ANY=1
  # Un worktree qui porte du travail non committé n'est pas « abandonné ».
  dirty=$(git -C "$d" status --porcelain 2>/dev/null | head -1)
  if [[ -n "$dirty" ]]; then
    echo "  $w : modifications non committées — NON supprimé."
    continue
  fi
  echo "  $w : propre, ~1,4 Go avec ses node_modules."
  run git worktree remove --force "$d"
done
if [[ $SEEN_ANY == 1 ]]; then
  run git worktree prune
else
  echo
  echo "  Aucun worktree visible : on ne prune pas. Un prune lancé d'ici"
  echo "  déréférencerait des worktrees qui existent bel et bien sur la machine."
fi

echo
echo "=== 3. Branches locales fusionnées dans origin/main ==="
for b in $(git branch --merged origin/main --format='%(refname:short)' | grep -v '^main$'); do
  if git worktree list --porcelain | grep -qx "branch refs/heads/$b"; then
    echo "  $b : occupée par un worktree — laissée en place."
  else
    run git branch -d "$b"
  fi
done

echo
echo "=== 4. Branches distantes claude/* et dependabot/* ==="
mapfile -t REMOTE_DEAD < <(git branch -r --format='%(refname:short)' \
  | sed 's#^origin/##' | grep -E '^(claude|dependabot)/' | sort)
echo "  ${#REMOTE_DEAD[@]} branches de travail générées automatiquement en mai-juin 2026."
if [[ "${DELETE_REMOTE:-0}" != "1" ]]; then
  echo "  Non supprimées : il faut DELETE_REMOTE=1 en plus de CONFIRM=1."
  echo "  Un push --delete ne se rejoue pas. Exemple des dix premières :"
  printf '    %s\n' "${REMOTE_DEAD[@]:0:10}"
else
  for b in "${REMOTE_DEAD[@]}"; do run git push origin --delete "$b"; done
fi

echo
echo "=== 5. Fichier temporaire de vérification de build ==="
if [[ -f apps/web/_webcheck.tgz ]]; then
  run rm -f apps/web/_webcheck.tgz
else
  echo "  aucun."
fi

echo
echo "=== 6. Migration en doublon ==="
if [[ -f database/migrations/0005_reservations_unique_active.sql ]]; then
  echo "  Même SQL que 0018_reservations_unique_active.sql, à un renommage"
  echo "  inachevé du 10/06/2026 près. L'index est créé IF NOT EXISTS et le"
  echo "  runner suit les fichiers déjà appliqués : la retirer ne rejoue rien."
  run git rm database/migrations/0005_reservations_unique_active.sql
else
  echo "  déjà retirée."
fi

echo
if [[ $DRY == 1 ]]; then
  echo "Rien n'a été fait. Relance avec CONFIRM=1 pour appliquer."
else
  echo "Terminé. Pense à committer les suppressions de fichiers."
fi
