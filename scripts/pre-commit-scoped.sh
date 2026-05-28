#!/usr/bin/env bash
# Root pre-commit dispatcher.
# Runs lint + tests scoped to whichever of the three services has staged changes.
# Services: ai-platform (Nx BE), ai-platform-fe (Nx FE), kanban-server (plain Node).

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "${REPO_ROOT}"

STAGED=$(git diff --cached --name-only --diff-filter=ACMR || true)
if [ -z "${STAGED}" ]; then
  echo "[pre-commit] no staged files — skipping"
  exit 0
fi

touched_be=0
touched_fe=0
touched_kanban=0

while IFS= read -r f; do
  case "${f}" in
    ai-platform/*)    touched_be=1 ;;
    ai-platform-fe/*) touched_fe=1 ;;
    kanban-server/*)  touched_kanban=1 ;;
  esac
done <<< "${STAGED}"

fail=0

run() {
  local label="$1"; shift
  echo "[pre-commit] ${label}: $*"
  if ! "$@"; then
    echo "[pre-commit] ${label} FAILED"
    fail=1
  fi
}

if [ "${touched_be}" = "1" ]; then
  (
    cd ai-platform
    run "be lint-staged"  npx --no-install lint-staged
    run "be affected lint" npx --no-install nx affected --target=lint --base=HEAD
    run "be affected test" npx --no-install nx affected --target=test --base=HEAD --passWithNoTests
  ) || fail=1
fi

if [ "${touched_fe}" = "1" ]; then
  (
    cd ai-platform-fe
    run "fe lint-staged"  npx --no-install lint-staged
    run "fe affected lint" npx --no-install nx affected --target=lint --base=HEAD
    run "fe affected test" npx --no-install nx affected --target=test --base=HEAD --passWithNoTests
  ) || fail=1
fi

if [ "${touched_kanban}" = "1" ]; then
  (
    cd kanban-server
    run "kanban lint" npm run --silent lint
    run "kanban test" npm test --silent
  ) || fail=1
fi

if [ "${fail}" != "0" ]; then
  echo "[pre-commit] one or more service checks failed — aborting commit"
  exit 1
fi

echo "[pre-commit] all scoped checks passed"
exit 0
