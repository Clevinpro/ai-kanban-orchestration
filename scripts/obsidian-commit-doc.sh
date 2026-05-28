#!/usr/bin/env bash
set -euo pipefail

VAULT_DIR="docs/obsidian-vault/commits"
HASH=$(git rev-parse --short HEAD)
DATE=$(date +%Y-%m-%d)
NOTE_FILE="${VAULT_DIR}/${DATE}-${HASH}.md"
SYNC_URL="${VAULT_SYNC_URL:-http://localhost:4001/vault/sync}"

# Safety: ensure vault commits dir exists (created in TASK-001; guard for safety)
mkdir -p "${VAULT_DIR}"

# 1 — Generate note via Claude (fail-safe: skip if claude absent)
if command -v claude &>/dev/null; then
  DIFF=$(git show HEAD --stat --patch | head -300)
  REPO_TAG=""
  echo "$DIFF" | grep -q "ai-platform-fe/" && REPO_TAG="$REPO_TAG fe"
  echo "$DIFF" | grep -q "ai-platform/"    && REPO_TAG="$REPO_TAG be"
  echo "$DIFF" | grep -q "\.planning/"     && REPO_TAG="$REPO_TAG planning"

  # Fix (1): trim leading whitespace before sed to prevent leading comma in YAML tags
  REPO_TAGS=$(echo "${REPO_TAG# }" | sed 's/ /, /g')

  # Fix (2): pre-assign AUTHOR so no inline command substitution occurs inside the prompt;
  # write prompt to a temp file so DIFF content is never re-evaluated as shell code.
  AUTHOR=$(git log -1 --pretty=%an HEAD)
  PROMPT_FILE=$(mktemp)
  trap 'rm -f "${PROMPT_FILE}"' EXIT

  cat > "${PROMPT_FILE}" <<EOF
You are a technical documentation agent.
Write a concise Markdown note for an Obsidian knowledge base vault.

Output exactly this format (no extra commentary):
---
tags: [commit${REPO_TAGS:+, ${REPO_TAGS}}]
date: ${DATE}
hash: ${HASH}
author: ${AUTHOR}
---

## Summary
<2-4 sentence plain-language description of what changed and why>

## Changed Files
<bulleted list: filename — one-line description of change>

## Impact
<note if change affects architecture, APIs, DB schema, or agent behaviour — omit section if not applicable>

Git diff:
${DIFF}
EOF

  claude --print "$(cat "${PROMPT_FILE}")" > "${NOTE_FILE}" || true
fi

# 2 — Update _MOC.md
COMMIT_MSG=$(git log -1 --pretty=%s HEAD)
echo "- [[${DATE}-${HASH}]] — ${COMMIT_MSG}" >> "${VAULT_DIR}/_MOC.md"

# 3 — Index new note into RAG pipeline (fail-safe)
if command -v curl &>/dev/null && [ -f "${NOTE_FILE}" ]; then
  curl -sf -X POST "${SYNC_URL}" \
    -H "Content-Type: application/json" \
    -d "{\"filePath\": \"${NOTE_FILE}\"}" \
    > /dev/null || true
fi

exit 0
