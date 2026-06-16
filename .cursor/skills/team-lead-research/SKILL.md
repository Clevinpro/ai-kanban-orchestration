---
name: team-lead-research
description: "Lightweight architecture/refactor investigation — a token-frugal alternative to deep research. Creates a RESEARCH.md epic (repo: inv), runs one research-investigator (the sole web-search point) plus optional read-only be-developer/fe-developer in separate terminal tabs, and drives the single kanban card to Done WITHOUT team-lead-test."
---

<cursor_skill_adapter>
## A. Skill Invocation
- Invoked when the user mentions `team-lead-research` or asks to investigate an architecture/refactor decision cheaply.
- Treat all user text after the skill mention as `{{ARGS}}`:
  - INIT form: `"<research topic>" [--name <slug>] [--agent claude|cursor]`
  - RUN form (worker tabs): `--run <epic> <inv|be|fe> [--agent claude|cursor]`
- If `{{ARGS}}` has no topic and no `--run` and the chat has no clear question, ask the user for the topic.

## B. User Prompting
When confirmation is needed (INIT preview, overwrite), prompt conversationally in your response text and wait — never block on raw stdin. Treat any reply other than `y`/`Y`/`yes` as "no".

## C. Tool Usage
- `Read`, `Glob`, `Grep` for file work; `Shell` for `date` and for launching tabs (`bash kanban-server/open-research-tab.sh ...`).
- Use `Write` to create RESEARCH.md and `StrReplace` for each single `status` transition (one per call — the preToolUse hook validates it).

## D. Subagent Spawning
- RUN mode spawns exactly one agent per call with the `Task` tool, `run_in_background: false`:
  - `--run <epic> inv` → `Task(subagent_type="research-investigator", ...)`
  - `--run <epic> be`  → `Task(subagent_type="be-developer", ...)`
  - `--run <epic> fe`  → `Task(subagent_type="fe-developer", ...)`
- INIT mode spawns nothing — it writes the file and opens the investigator tab via `Shell`.
</cursor_skill_adapter>

## Purpose

A cheap counterpart to deep research for investigating an **architectural decision
or refactoring strategy** (not a normal feature task). It spends **radically fewer
tokens** by spawning the bare minimum: one `research-investigator` (the only agent
allowed to web-search) plus, only when the topic warrants it, a read-only
`be-developer` and/or `fe-developer`. No searcher swarm, no fan-out.

The artifact is an epic directory with a single **`RESEARCH.md`**. The kanban board
shows it as **one card** with `repo: inv`; the card starts **In Progress** and
advances to **Done** the same way TeamLead Check → Done works in the normal
pipeline (the investigator self-approves, the skill flips the card to `done`).
**`team-lead-test` is skipped entirely.** Each agent runs in its **own terminal
tab** and leaves its own block in `RESEARCH.md`.

---

## STEP 0 — Mode dispatch

Inspect `{{ARGS}}`. If it contains `--run`, this is a **RUN** invocation → jump to
RUN MODE. Otherwise it is the user-facing **INIT** invocation. Parse the shared
optional `--agent <claude|cursor>` flag wherever it appears (default `claude`).

---

# INIT MODE — create the epic + launch the investigation

## I1 — Parse arguments
- The quoted / free-text portion of `{{ARGS}}` is the **research topic**.
- `--name <slug>` forces the epic slug; else derive it (I2).
- No topic and no clear chat question → print and stop:
  `Error: no topic. Usage: team-lead-research "<what to investigate>" [--name <slug>] [--agent claude|cursor]`

## I2 — Derive epic slug
If `--name` given, kebab-case it. Otherwise from the topic: first 5–8 meaningful
words, lowercase, strip punctuation, hyphenate. Directory: `.planning/work/<slug>/`.

## I3 — Compose RESEARCH.md
Get timestamps via `Shell` (`date -u +%Y-%m-%dT%H:%M:%SZ`, `date +%Y-%m-%d`). Build
from this skeleton, filling topic + scope; leave analysis sections as stubs:

```markdown
---
id: RESEARCH
title: <concise title of the investigation>
status: readyForDevelop
priority: medium
repo: inv
epic: <slug>
complexity: 0
created-at: <ISO8601>
updated-at: <ISO8601>
started-at: null
completed-at: null
---

# RESEARCH: <Title>

**Epic:** `<slug>`
**Type:** Investigation — architecture / refactor strategy
**Created:** <YYYY-MM-DD>
**Agents:** research-investigator (sole web-search) + read-only be-developer/fe-developer per repo

---

## Topic / Question

<the research question — what decision or refactor, and why>

## Scope

- In scope: <...>
- Out of scope: <...>

---

## Research Log
<!-- each stage is appended here as it happens -->

## Investigator — Plan
<!-- research-investigator: repos to consult + specific questions -->

## BE Findings
<!-- be-developer (RESEARCH MODE, read-only) — only if backend is consulted -->

## FE Findings
<!-- fe-developer (RESEARCH MODE, read-only) — only if frontend is consulted -->

## Web Findings
<!-- research-investigator: the single web-search pass -->

## Synthesis
<!-- research-investigator: options table, recommendation, refactor strategy -->

## Investigator — Summary
<!-- research-investigator: confidence, risks, next actions -->
```

## I4 — Collision check
If `.planning/work/<slug>/RESEARCH.md` exists, ask to overwrite `[y/N]`; anything
but `y`/`Y` → stop.

## I5 — Preview & confirm
Show the target path and full proposed RESEARCH.md, then ask exactly:
`Write this RESEARCH.md and launch the investigation? [y/N]`. Anything but `y`/`Y` →
`Aborted. No file written.` and stop.

**This is the ONLY confirmation in INIT mode.** A `y` here authorizes the entire
rest of the flow. Do NOT prompt again — run all of I6 (write → status flip → launch
the investigator tab) straight through, automatically. Never pause to ask "launch
the investigator?" / "run the next step?" / "proceed?".

## I6 — Write, start the card, launch the investigator tab
On `y`, perform every step below in sequence without any further prompts:
1. `Write` `.planning/work/<slug>/RESEARCH.md` (status `readyForDevelop`).
2. `StrReplace` the frontmatter `status: readyForDevelop` → `status: inProgress`
   (the hook allows it; timestamps hook stamps `started-at`). Card is now **In
   Progress**, `repo: inv`.
3. Launch the investigator tab via `Shell`:
   `bash kanban-server/open-research-tab.sh <agent> <slug> inv`
   If it fails, tell the user to run manually:
   `bash kanban-server/run-research.sh <agent> <slug> inv`
4. Print the written path + "Investigator launched in a new tab; the card advances
   to Done on its own (no team-lead-test)." Then STOP.

---

# RUN MODE — worker tab entry point

`--run <epic> <role>`, `role ∈ {inv, be, fe}`. Resolve
`research_file = .planning/work/<epic>/RESEARCH.md`; missing → error + stop. Read
`--agent` (default `claude`).

## role = inv
1. `Task(subagent_type="research-investigator", run_in_background: false)` with:
   ```
   You are investigating epic "<epic>". File: .planning/work/<epic>/RESEARCH.md
   agent: <agent>   (pass to open-research-tab.sh when launching developer tabs)
   Run your full protocol: read-only code scan → append ## Investigator — Plan →
   for each repo you choose, SEQUENTIALLY open its tab with
   `bash kanban-server/open-research-tab.sh <agent> <epic> <be|fe>` and poll
   RESEARCH.md for its `[<be|fe>-developer] RESEARCH DONE` sentinel (cap ~10 min) →
   ONE WebSearch round → append ## Web Findings, ## Synthesis,
   ## Investigator — Summary. You are the only agent allowed to web-search.
   Return [research-investigator] DONE.
   ```
2. On `DONE`: `StrReplace` frontmatter `status: inProgress` → `status: done`
   (timestamps hook stamps `completed-at`). Print
   `[team-lead-research] DONE — <epic> investigation complete (card → Done).`
3. On `ERROR`/no receipt: leave at `inProgress`, print that the investigator did
   not finish.

## role = be
`Task(subagent_type="be-developer", run_in_background: false)` with:
```
RESEARCH MODE (read-only — do not modify code, do not web-search).
Epic: <epic>   File: .planning/work/<epic>/RESEARCH.md
Read ## Topic / Question and the backend questions under ## Investigator — Plan,
investigate ai-platform/ read-only, APPEND a ## BE Findings block answering them,
end it with the sentinel: [be-developer] RESEARCH DONE
Return [be-developer] RESEARCH DONE.
```
Print the receipt and stop.

## role = fe
Same as `be` but `Task(subagent_type="fe-developer")`, repo `ai-platform-fe/`,
block `## FE Findings`, sentinel `[fe-developer] RESEARCH DONE`.

---

## Constraints
- **Single web-search point** — only `research-investigator`, once. Developers run
  RESEARCH MODE with web search disabled.
- **Minimum agents** — at most three contexts (investigator + be + fe); a developer
  tab opens only when its repo is genuinely involved.
- **One card** — a single `repo: inv` card, never split, never `team-lead-test`ed.
- **Separate tabs** — each agent in its own `claude`/`cursor` tab via
  `kanban-server/open-research-tab.sh`.
- **Append-only RESEARCH.md** — agents append their own blocks; only the skill edits
  the frontmatter `status`.
