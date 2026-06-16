---
name: team-lead:research
description: Lightweight architecture/refactor investigation — a token-frugal alternative to /deep-research. Creates a RESEARCH.md epic (repo: inv), runs one research-investigator (the sole web-search point) plus optional read-only be-developer/fe-developer in separate terminal tabs, and drives the single kanban card to Done WITHOUT team-lead:test.
argument-hint: "\"<research topic>\" [--name <slug>] [--agent claude|cursor]   |   --run <epic> <inv|be|fe> [--agent claude|cursor]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
---

## Purpose

A cheap counterpart to `/deep-research` for investigating an **architectural
decision or refactoring strategy** (not a normal feature task). It spends
**radically fewer tokens** by spawning the bare minimum: exactly one
`research-investigator` (the only agent allowed to web-search) plus, only when the
topic warrants it, a read-only `be-developer` and/or `fe-developer`. No searcher
swarm, no fan-out, no adversarial verification rounds.

The artifact is an epic directory with a single **`RESEARCH.md`** (the analog of
SPEC.md / TASK files for this flow). The kanban board shows it as **one card**
with `repo: inv`; the card starts **In Progress** and advances to **Done** the same
way TeamLead Check → Done works in the normal pipeline — i.e. the investigator
self-approves and the card is flipped to `done`. **`team-lead:test` is skipped
entirely** for investigations.

Each agent runs in its **own terminal tab** (a fresh `claude` or `cursor`
instance). Each agent leaves its own block in `RESEARCH.md`:
`research-investigator` → `## Investigator — Plan` + `## Web Findings` +
`## Synthesis` + `## Investigator — Summary`; `be-developer` → `## BE Findings`;
`fe-developer` → `## FE Findings`. Every stage is appended to `RESEARCH.md` as it
happens.

---

## STEP 0 — Mode dispatch

Inspect `$ARGUMENTS`.

- If it contains `--run`, this is a **RUN** invocation (a worker tab launched the
  command). Jump to **RUN MODE**.
- Otherwise this is the user-facing **INIT** invocation. Continue with INIT MODE.

Parse a shared optional flag `--agent <claude|cursor>` wherever it appears
(default `claude`). It selects which CLI is spawned for the worker tabs.

---

# INIT MODE — create the epic + launch the investigation

## I1 — Parse arguments

- The quoted / free-text portion of `$ARGUMENTS` is the **research topic**.
- `--name <slug>` forces the epic slug (kebab-cased); else derive it (I2).
- If there is neither a topic argument nor a clear research question in the chat,
  print and stop:
  `Error: no topic. Usage: /team-lead:research "<what to investigate>" [--name <slug>] [--agent claude|cursor]`

## I2 — Derive epic slug

If `--name` given, use it (kebab-cased). Otherwise from the topic: take the first
5–8 meaningful words, lowercase, strip punctuation, hyphenate. Prefix is fine
(e.g. `research-chat-provider-split`). The slug is the directory
`.planning/work/<slug>/`.

## I3 — Compose RESEARCH.md

Get today's date / ISO timestamp via Bash (`date -u +%Y-%m-%dT%H:%M:%SZ` and
`date +%Y-%m-%d`). Build the file content from this skeleton, filling the topic and
scope from `$ARGUMENTS` + the chat. Leave the analysis sections as empty stubs —
the agents fill them.

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

<the research question — what decision or refactor are we investigating, and why>

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

Use Glob/Read to check `.planning/work/<slug>/RESEARCH.md`. If it exists, print
`RESEARCH already exists at .planning/work/<slug>/RESEARCH.md — overwrite? [y/N]`
and wait. Anything other than `y`/`Y` → stop (suggest a different `--name`).

## I5 — Preview & confirm

Print the target path and the full proposed `RESEARCH.md` in a fenced block, then
ask exactly:

```
Write this RESEARCH.md and launch the investigation? [y/N]
```

Wait for the reply. Anything other than `y`/`Y` → `Aborted. No file written.` and
stop.

**This is the ONLY confirmation in INIT mode.** A `y` here authorizes the entire
rest of the flow. Do NOT prompt again — run all of I6 (write → status flip → launch
the investigator tab) straight through, automatically, with no further questions.
Never pause to ask "launch the investigator?" / "run the next step?" / "proceed?".

## I6 — Write, start the card, launch the investigator tab

On `y`, perform every step below in sequence without any further prompts:

1. **Write** `.planning/work/<slug>/RESEARCH.md` with the Write tool (status
   `readyForDevelop` — the state guard requires new files start there).
2. **Edit** the frontmatter `status: readyForDevelop` → `status: inProgress` (one
   transition; the guard's RESEARCH lifecycle allows it and the timestamps hook
   stamps `started-at`). The kanban card is now **In Progress** with `repo: inv`.
3. **Launch the investigator in its own tab:**
   ```bash
   bash kanban-server/open-research-tab.sh <agent> <slug> inv
   ```
   If that command fails (e.g. iTerm not running), print the manual fallback so the
   user can run it themselves:
   `Run in a new tab:  bash kanban-server/run-research.sh <agent> <slug> inv`
4. Print:
   ```
   Written: .planning/work/<slug>/RESEARCH.md  (card → In Progress, repo: inv)
   Investigator launched in a new tab. Watch the kanban board — the card advances
   to Done on its own (no team-lead:test for investigations).
   ```

Then STOP. (The rest happens in the worker tabs via RUN MODE.)

---

# RUN MODE — worker tab entry point

Triggered by `--run <epic> <role>` where `role ∈ {inv, be, fe}`. Resolve
`research_file = .planning/work/<epic>/RESEARCH.md`; if it does not exist, print an
error and stop. Read `--agent` (default `claude`).

## role = inv — host the investigator, then close out the card

1. Spawn the investigator and wait for its receipt:
   `Agent(subagent_type="research-investigator")` with this prompt:
   ```
   You are investigating epic "<epic>". File: .planning/work/<epic>/RESEARCH.md
   agent: <agent>   (pass this to open-research-tab.sh when launching developer tabs)

   Read the topic from the file, then run your full protocol: read-only code scan →
   append ## Investigator — Plan → for each repo you choose, SEQUENTIALLY open its
   tab with `bash kanban-server/open-research-tab.sh <agent> <epic> <be|fe>` and
   poll RESEARCH.md for its `[<be|fe>-developer] RESEARCH DONE` sentinel (cap ~10
   min) → ONE WebSearch round → append ## Web Findings, ## Synthesis,
   ## Investigator — Summary. You are the only agent allowed to web-search.
   Return [research-investigator] DONE.
   ```
2. On receipt containing `DONE` (not `ERROR`): **Edit** the frontmatter
   `status: inProgress` → `status: done` (the guard's RESEARCH lifecycle allows
   `inProgress → done`; the timestamps hook stamps `completed-at`). Print:
   `[team-lead:research] DONE — <epic> investigation complete (card → Done).`
3. On `ERROR` (or no receipt): leave the card at `inProgress`, print
   `[team-lead:research] investigator did not finish — card left In Progress. See RESEARCH.md.`

## role = be — read-only backend research

Spawn `Agent(subagent_type="be-developer")` with this prompt and wait:
```
RESEARCH MODE (read-only — do not modify code, do not web-search).
Epic: <epic>   File: .planning/work/<epic>/RESEARCH.md
Read the ## Topic / Question and the backend questions under ## Investigator — Plan,
investigate ai-platform/ read-only, then APPEND a ## BE Findings block answering
them (patterns, where/how to refactor, options, trade-offs, real file paths).
End the block with the sentinel line: [be-developer] RESEARCH DONE
Return [be-developer] RESEARCH DONE.
```
Print the agent's receipt and stop (the tab can be left open or closed).

## role = fe — read-only frontend research

Same as `be`, but `Agent(subagent_type="fe-developer")`, repo `ai-platform-fe/`,
block `## FE Findings`, sentinel `[fe-developer] RESEARCH DONE`.

---

## Constraints

- **Single web-search point.** Only `research-investigator` may web-search, exactly
  once. `be-developer`/`fe-developer` run in RESEARCH MODE with web search
  disabled. This is the headline token-saving rule.
- **Minimum agents.** At most three agent contexts total (investigator + be + fe),
  and the investigator opens a developer tab only when its repo is genuinely
  involved. No swarm, no fan-out.
- **One card.** The whole investigation is a single `repo: inv` kanban card; it is
  never split into sub-tasks and `team-lead:test` never runs against it.
- **Separate tabs.** Each agent runs in its own terminal tab (a fresh `claude` or
  `cursor` instance), launched via `kanban-server/open-research-tab.sh`.
- **Append-only RESEARCH.md.** Agents append their own blocks and never rewrite
  each other's; only the frontmatter `status` transitions are edited (by the
  command, not the agents).
