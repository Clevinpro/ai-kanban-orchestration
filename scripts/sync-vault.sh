#!/usr/bin/env bash
# Read .planning/ → write docs/obsidian-vault/
# Usage: ./scripts/sync-vault.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLANNING="$REPO_ROOT/.planning"
VAULT="$REPO_ROOT/docs/obsidian-vault"

status_icon() {
  case "$1" in
    done)             echo "✅" ;;
    inProgress)       echo "🔄" ;;
    inReview)         echo "👀" ;;
    inTesting)        echo "🧪" ;;
    forTeamLeadCheck) echo "🔍" ;;
    readyForDevelop)  echo "📋" ;;
    stopped)          echo "🛑" ;;
    *)                echo "❓" ;;
  esac
}

# ── codebase/ → vault/codebase/ (copy as-is) ──────────────────────────────
mkdir -p "$VAULT/codebase"
for f in "$PLANNING/codebase/"*.md; do
  [[ -f "$f" ]] || continue
  cp "$f" "$VAULT/codebase/$(basename "$f")"
  echo "  codebase/$(basename "$f")"
done

# ── research/ → vault/research/ (copy as-is) ──────────────────────────────
if [[ -d "$PLANNING/research" ]]; then
  mkdir -p "$VAULT/research"
  for f in "$PLANNING/research/"*.md; do
    [[ -f "$f" ]] || continue
    cp "$f" "$VAULT/research/$(basename "$f")"
    echo "  research/$(basename "$f")"
  done
fi

# ── phases/ → vault/phases/ (copy summaries + plans) ─────────────────────
mkdir -p "$VAULT/phases"
for phase_dir in "$PLANNING/phases/"/*/; do
  [[ -d "$phase_dir" ]] || continue
  phase=$(basename "$phase_dir")
  mkdir -p "$VAULT/phases/$phase"
  for f in "$phase_dir"*.md; do
    [[ -f "$f" ]] || continue
    cp "$f" "$VAULT/phases/$phase/$(basename "$f")"
    echo "  phases/$phase/$(basename "$f")"
  done
done

# ── work/<epic>/ → vault/epics/<epic>.md (task table) ────────────────────
mkdir -p "$VAULT/epics"
epic_links=()

for epic_dir in "$PLANNING/work/"/*/; do
  [[ -d "$epic_dir" ]] || continue
  epic=$(basename "$epic_dir")

  task_files=("$epic_dir"TASK-*.md)
  [[ -f "${task_files[0]}" ]] || continue

  done_count=0
  total_count=0
  rows=""

  for task_file in "${task_files[@]}"; do
    [[ -f "$task_file" ]] || continue
    id=$(grep -m1 "^id:" "$task_file" | sed 's/^id: *//' || echo "?")
    title=$(grep -m1 "^title:" "$task_file" | sed 's/^title: *//' | tr -d '"' || echo "?")
    status=$(grep -m1 "^status:" "$task_file" | sed 's/^status: *//' || echo "?")
    repo=$(grep -m1 "^repo:" "$task_file" | sed 's/^repo: *//' || echo "?")
    complexity=$(grep -m1 "^complexity:" "$task_file" | sed 's/^complexity: *//' || echo "?")
    icon=$(status_icon "$status")
    rows+="| $id | $title | $icon $status | $repo | $complexity |"$'\n'
    [[ "$status" == "done" ]] && ((done_count++)) || true
    ((total_count++))
  done

  [[ $total_count -gt 0 ]] && pct=$(( done_count * 100 / total_count )) || pct=0
  bar_filled=$(( pct / 5 ))
  bar_empty=$(( 20 - bar_filled ))
  bar="$(printf '█%.0s' $(seq 1 $bar_filled 2>/dev/null) 2>/dev/null)$(printf '░%.0s' $(seq 1 $bar_empty 2>/dev/null) 2>/dev/null)"

  {
    echo "---"
    echo "tags: [epic, planning]"
    echo "epic: $epic"
    echo "updated: $(date +%Y-%m-%d)"
    echo "---"
    echo ""
    echo "# Epic: $epic"
    echo ""
    echo "## Progress"
    echo ""
    echo "\`\`\`"
    echo "$bar  $done_count / $total_count ($pct%)"
    echo "\`\`\`"
    echo ""
    echo "## Tasks"
    echo ""
    echo "| ID | Title | Status | Repo | Complexity |"
    echo "|----|-------|--------|------|------------|"
    echo -n "$rows"
  } > "$VAULT/epics/${epic}.md"

  echo "  epics/${epic}.md ($done_count/$total_count done)"
  epic_links+=("- [[epics/$epic]] — $done_count/$total_count tasks done")
done

# ── epics/_MOC.md ──────────────────────────────────────────────────────────
{
  echo "# Epics"
  echo ""
  echo "_Updated: $(date '+%Y-%m-%d %H:%M')_"
  echo ""
  for link in "${epic_links[@]}"; do echo "$link"; done
} > "$VAULT/epics/_MOC.md"

# ── Update Index.md epics block ────────────────────────────────────────────
python3 - <<PYEOF
import re, pathlib

index = pathlib.Path("$VAULT/Index.md")
content = index.read_text()

block = "## Epics\n\n- [[epics/_MOC]]\n"
content = re.sub(r'## Epics\n.*', block, content, flags=re.DOTALL)
index.write_text(content)
PYEOF

echo ""
echo "sync done."
