#!/usr/bin/env bash
# scripts/preflight.sh — vérifications anti-régression à passer AVANT chaque git push.
#
# Usage :   ./scripts/preflight.sh           # check complet
#           ./scripts/preflight.sh --fast    # skip tests (juste secrets + typecheck)
#           ./scripts/preflight.sh --secrets # uniquement le scan secrets
#
# Référencé par CONTRIBUTING.md §4. Non-bloquant en CI (la CI a ses propres checks),
# bloquant en local pour attraper les erreurs avant qu'elles polluent une PR.

set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "${REPO_ROOT}"

# Couleurs (désactivées hors TTY)
if [ -t 1 ]; then
  RED=$'\033[0;31m' ; GREEN=$'\033[0;32m' ; YELLOW=$'\033[0;33m' ; BLUE=$'\033[0;34m' ; RESET=$'\033[0m'
else
  RED='' ; GREEN='' ; YELLOW='' ; BLUE='' ; RESET=''
fi

MODE="full"
case "${1:-}" in
  --fast)    MODE="fast" ;;
  --secrets) MODE="secrets" ;;
  -h|--help)
    sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
esac

FAILED=0
step() { printf "\n${BLUE}▸ %s${RESET}\n" "$1"; }
ok()   { printf "${GREEN}  ✓ %s${RESET}\n" "$1"; }
warn() { printf "${YELLOW}  ⚠ %s${RESET}\n" "$1"; }
fail() { printf "${RED}  ✗ %s${RESET}\n" "$1"; FAILED=1; }

# ---------------------------------------------------------------------------
# 1. Scan secrets — toujours exécuté
# ---------------------------------------------------------------------------
step "Scan secrets dans les fichiers stagés et le diff vs main"

# Patterns connus (extensibles). Format : "label|regex"
SECRET_PATTERNS=(
  "AWS access key|AKIA[0-9A-Z]{16}"
  "GitHub PAT|ghp_[A-Za-z0-9]{36}"
  "GitHub OAuth|gho_[A-Za-z0-9]{36}"
  "GitHub fine-grained|github_pat_[A-Za-z0-9_]{82}"
  "Stripe live key|sk_live_[A-Za-z0-9]{20,}"
  "Stripe restricted|rk_live_[A-Za-z0-9]{20,}"
  "Slack bot token|xoxb-[A-Za-z0-9-]{20,}"
  "Slack user token|xoxp-[A-Za-z0-9-]{20,}"
  "Firebase service acct|-----BEGIN PRIVATE KEY-----"
  "Generic JWT secret assignment|JWT_(DEVICE|SESSION)_SECRET=[A-Za-z0-9+/=]{20,}"
  "Postgres URL with password|postgres(ql)?://[^:]+:[^@/]{8,}@"
)

# Diff à analyser : staged + non-staged + untracked (sauf node_modules, dist, .git)
DIFF_CONTENT=$(
  {
    git diff --cached
    git diff
    git ls-files --others --exclude-standard \
      | xargs -I{} sh -c 'test -f "{}" && cat "{}" 2>/dev/null' 2>/dev/null
  } 2>/dev/null || true
)

SECRET_HITS=0
for pattern in "${SECRET_PATTERNS[@]}"; do
  label="${pattern%%|*}"
  regex="${pattern#*|}"
  if printf '%s' "${DIFF_CONTENT}" | grep -E -q "${regex}" 2>/dev/null; then
    fail "Pattern détecté : ${label}"
    SECRET_HITS=$((SECRET_HITS + 1))
  fi
done

if [ "${SECRET_HITS}" -eq 0 ]; then
  ok "Aucun pattern de secret connu détecté"
fi

# Détection de .env tracké par erreur
if git ls-files | grep -E '^\.env$|^\.env\.[a-z]+$' | grep -v '\.example$' > /dev/null; then
  fail ".env tracké par git (devrait être dans .gitignore)"
fi

if [ "${MODE}" = "secrets" ]; then
  echo
  [ "${FAILED}" -eq 0 ] && { echo "${GREEN}preflight (secrets only) OK${RESET}"; exit 0; }
  echo "${RED}preflight FAILED${RESET}" ; exit 1
fi

# ---------------------------------------------------------------------------
# 2. console.log oubliés
# ---------------------------------------------------------------------------
step "console.log oubliés dans apps/ et services/"
LEFTOVER_LOGS=$(
  git ls-files 'apps/*.ts' 'apps/*.tsx' 'services/*.ts' 2>/dev/null \
    | xargs grep -nE 'console\.(log|debug)' 2>/dev/null \
    | grep -vE '//\s*(allow-console|debug)' \
    | grep -vE '\.test\.|\.spec\.|/test/' \
    || true
)
if [ -n "${LEFTOVER_LOGS}" ]; then
  warn "console.log/debug trouvés (allow-console pour ignorer) :"
  echo "${LEFTOVER_LOGS}" | head -5 | sed 's/^/    /'
  COUNT=$(echo "${LEFTOVER_LOGS}" | wc -l | tr -d ' ')
  if [ "${COUNT}" -gt 5 ]; then
    warn "(${COUNT} total — premiers 5 ci-dessus)"
  fi
else
  ok "Pas de console.log oublié"
fi

# ---------------------------------------------------------------------------
# 3. Typecheck
# ---------------------------------------------------------------------------
step "pnpm typecheck (tout le monorepo)"
if pnpm typecheck > /tmp/preflight-typecheck.log 2>&1; then
  ok "typecheck OK"
else
  fail "typecheck KO (détails dans /tmp/preflight-typecheck.log)"
  tail -20 /tmp/preflight-typecheck.log | sed 's/^/    /'
fi

# ---------------------------------------------------------------------------
# 4. Tests (sauf en --fast)
# ---------------------------------------------------------------------------
if [ "${MODE}" != "fast" ]; then
  step "pnpm test (tout le monorepo)"
  if pnpm test > /tmp/preflight-test.log 2>&1; then
    ok "tests OK"
  else
    fail "tests KO (détails dans /tmp/preflight-test.log)"
    tail -20 /tmp/preflight-test.log | sed 's/^/    /'
  fi
else
  warn "tests skip (--fast)"
fi

# ---------------------------------------------------------------------------
# 5. Audit deps (non bloquant si moderate, bloquant si high)
# ---------------------------------------------------------------------------
step "pnpm audit (level=high bloquant)"
if pnpm audit --audit-level=high > /tmp/preflight-audit.log 2>&1; then
  ok "Pas de vulnérabilité high+"
else
  fail "Vulnérabilités high+ détectées :"
  tail -30 /tmp/preflight-audit.log | sed 's/^/    /'
fi

# ---------------------------------------------------------------------------
# Verdict
# ---------------------------------------------------------------------------
echo
if [ "${FAILED}" -eq 0 ]; then
  echo "${GREEN}━━━ preflight OK — go push ━━━${RESET}"
  exit 0
else
  echo "${RED}━━━ preflight FAILED — fixe avant de push ━━━${RESET}"
  exit 1
fi
