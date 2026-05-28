#!/usr/bin/env bash
# install-hooks.sh — Install git hooks for this repository.
#
# Usage:
#   bash scripts/install-hooks.sh
#
# Idempotent: safe to run multiple times. If the post-commit hook already exists
# and is the expected symlink, nothing changes. If it exists but points elsewhere
# (or is a regular file), a warning is printed and no overwrite occurs.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="${REPO_ROOT}/.git/hooks"
HOOK_FILE="${HOOKS_DIR}/post-commit"
# Relative path from .git/hooks/ to the script — works in any clone location.
TARGET="../../scripts/obsidian-commit-doc.sh"

# Verify the target script actually exists before installing the hook.
if [ ! -f "${REPO_ROOT}/scripts/obsidian-commit-doc.sh" ]; then
  echo "ERROR: scripts/obsidian-commit-doc.sh not found in repository root." >&2
  echo "       Run this installer only after TASK-002 has been completed." >&2
  exit 1
fi

if [ -L "${HOOK_FILE}" ]; then
  existing_target="$(readlink "${HOOK_FILE}")"
  if [ "${existing_target}" = "${TARGET}" ]; then
    echo "INFO: post-commit hook is already installed — nothing to do."
    exit 0
  else
    echo "WARN: ${HOOK_FILE} is already a symlink pointing to '${existing_target}'." >&2
    echo "      Remove it manually if you want to replace it with this hook." >&2
    exit 1
  fi
fi

if [ -e "${HOOK_FILE}" ]; then
  echo "WARN: ${HOOK_FILE} already exists and is not a symlink." >&2
  echo "      Remove it manually if you want to install the obsidian-commit-doc hook." >&2
  exit 1
fi

ln -s "${TARGET}" "${HOOK_FILE}"
echo "OK: post-commit hook installed at ${HOOK_FILE}"
echo "    -> ${TARGET}"
