#!/usr/bin/env bash
# Auto-apply committed Prisma migrations after incoming changes (pull / branch switch).
# Wired from .husky/post-merge and .husky/post-checkout.
#
# SAFE BY DESIGN:
#   - Uses `prisma migrate deploy` ONLY (applies committed migrations, idempotent).
#     Never `migrate dev`, which can regenerate migrations and silently DROP the raw
#     trgm/hnsw hybrid-search indexes (see migration 20260609182000_restore_hybrid_search_indexes).
#   - Runs only when files under ai-platform/libs/database/prisma/migrations/ changed.
#   - Skips quietly when the DB is unreachable (offline dev should not be punished).
#   - Never blocks the git operation: these are post-* hooks, the op already completed.

set -uo pipefail

HOOK="${1:-unknown}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "${REPO_ROOT}"

# Resolve the ref range to diff, per hook.
case "${HOOK}" in
  post-merge)
    # post-merge has no positional refs; ORIG_HEAD = pre-merge tip.
    OLD_REF="ORIG_HEAD"
    NEW_REF="HEAD"
    ;;
  post-checkout)
    # post-checkout args: $2=prev_head $3=new_head $4=branch_flag (1=branch, 0=file)
    PREV="${2:-}"; NEW="${3:-}"; FLAG="${4:-0}"
    [ "${FLAG}" = "1" ] || { exit 0; }          # ignore file checkouts
    OLD_REF="${PREV}"
    NEW_REF="${NEW}"
    ;;
  *)
    OLD_REF="HEAD@{1}"
    NEW_REF="HEAD"
    ;;
esac

MIG_DIR="ai-platform/libs/database/prisma/migrations"

CHANGED=$(git diff --name-only "${OLD_REF}" "${NEW_REF}" -- "${MIG_DIR}" 2>/dev/null || true)
if [ -z "${CHANGED}" ]; then
  exit 0   # no migration files touched — nothing to do
fi

echo "[auto-migrate] migration changes detected (${HOOK}) — applying with 'prisma migrate deploy'"

(
  cd ai-platform

  # Reachability probe: if the DB is down, skip without failing the git op.
  STATUS=$(npx --no-install prisma migrate status 2>&1 || true)
  if printf '%s' "${STATUS}" | grep -qiE "can't reach|P1001|connection refused"; then
    echo "[auto-migrate] database unreachable — skipping (run 'npm run db:migrate' once it is up)"
    exit 0
  fi

  if npx --no-install prisma migrate deploy; then
    npx --no-install prisma generate >/dev/null 2>&1 || true
    echo "[auto-migrate] migrations applied + client regenerated ✓"
  else
    echo "[auto-migrate] ⚠ 'prisma migrate deploy' FAILED — resolve manually before running the app"
  fi
)

exit 0
