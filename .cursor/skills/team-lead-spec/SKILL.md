---
name: team-lead-spec
description: "Turn a free-text idea (plus the current chat context) into a full SPEC.md at .planning/work/<epic-name>/SPEC.md. Pauses for human review before writing."
---

<cursor_skill_adapter>
## A. Skill Invocation
- This skill is invoked when the user mentions `team-lead-spec` or asks to draft a SPEC for an epic.
- Treat all user text after the skill mention as `{{ARGS}}` (the free-text epic description, plus an optional `--name <epic-name>` flag).
- If no arguments are present, treat `{{ARGS}}` as empty and fall back to the chat context (STEP 0).

## B. User Prompting
When the workflow needs confirmation, prompt conversationally in your response text and wait for the user's reply — never block on raw stdin. Treat any reply other than `y`/`Y`/`yes` as "no".

## C. Tool Usage
- `Read`, `Write`, `Glob`, `Grep` for file work; `Shell` for `date` and other commands.
- Use `StrReplace` to edit existing files.

## D. Subagent Spawning
- Not needed for this skill — it runs inline.
</cursor_skill_adapter>

## Purpose

`team-lead-plan` consumes an existing `SPEC.md`. This skill **creates** that
`SPEC.md` from a plain-language description plus everything already discussed in
the current chat — so the natural flow is:

```
team-lead-spec "build X ..."   →  .planning/work/<slug>/SPEC.md
team-lead-plan .planning/work/<slug>/SPEC.md   →  TASK-XXX.md files
```

The SPEC.md this skill writes **must** be directly consumable by
`team-lead-plan` — i.e. it must contain all four headers that the plan skill's
STEP 1 validation requires (see STEP 4 below).

---

## Constraints

- **Input is the idea + the chat.** Use `{{ARGS}}` as the primary description,
  and fold in any relevant requirements, decisions, file paths, or constraints
  already established earlier in this conversation. Do not invent requirements
  the user never implied — when something material is unknown, list it under
  `## Open Questions`, do not fabricate an answer.
- **Single repo per epic.** A SPEC.md targets `be`, `fe`, or `kanban` — never a
  mix. Full-stack ideas split into separate epics. State the chosen repo in the
  header block. If the idea is genuinely full-stack, say so and recommend
  splitting into two specs.
- **Four required headers are mandatory.** `## Goal`,
  `## User Stories / Requirements`, `## Acceptance Criteria`,
  `## Technical Design` must all be present, so `team-lead-plan` accepts the
  file. The richer sections below are additive.
- **Acceptance criteria are verifiable and IDed.** Use `AC-01`, `AC-02`, … —
  each independently checkable, the same style `team-lead-test` later verifies.
- **No files written before confirmation.** Always preview, then ask, then write
  (STEP 6–7).
- **Never overwrite an existing SPEC.md silently** (STEP 5).

---

## STEP 0 — Parse Arguments

Inspect `{{ARGS}}`.

- The quoted / free-text portion is the **epic description** — the seed for the
  whole spec.
- An optional `--name <epic-name>` flag forces the epic slug. If present, use it
  (kebab-cased) verbatim and skip slug derivation in STEP 3.
- If `{{ARGS}}` is empty **and** the chat contains a clear, discussed feature,
  proceed using the conversation as the description. If there is neither an
  argument nor a discernible idea in the chat, print:
  `Error: no description given. Usage: team-lead-spec "<what to build>" [--name <epic-name>]`
  and **stop**.

---

## STEP 1 — Gather Context

Assemble the raw material for the spec from two sources, in priority order:

1. **`{{ARGS}}`** — the explicit description.
2. **This conversation** — requirements, design decisions, constraints, file
   paths, repo (`be`/`fe`/`kanban`), and acceptance ideas already discussed.

Read `.planning/codebase/STRUCTURE.md` and `.planning/codebase/ARCHITECTURE.md`
if they exist, and skim any files the user referenced, to ground the Technical
Design in the real codebase (correct paths, existing patterns, the right repo).

Decide the target **repo** (`be` / `fe` / `kanban`) from the discussion and the
files involved. If it cannot be determined, ask in `## Open Questions` rather
than guessing.

---

## STEP 2 — Reason About Scope

Before writing, think through:

- The single **Goal** — one or two sentences of outcome, not implementation.
- The **user stories** that justify it.
- The **acceptance criteria** that would prove it done — concrete, testable.
- The **technical design** — files touched (real paths), data/schema/API shape,
  key decisions, and what is explicitly **out of scope**.
- **Open questions** — anything material the description and chat left ambiguous.

Keep it proportional to the idea: a small change gets a short spec; a large epic
gets the full set of sections.

---

## STEP 3 — Derive Epic Slug

If `--name` was given (STEP 0), use it (kebab-cased) and skip the rest of this
step.

Otherwise derive the slug from the **Goal**:

1. Take the first sentence (or first 5–8 meaningful words).
2. Lowercase it.
3. Remove all punctuation.
4. Replace spaces with hyphens.

**Example:** `"Add an Obsidian sync integration"` → `obsidian-sync-integration`

The slug is the directory name: `.planning/work/<slug>/`.

---

## STEP 4 — Compose the SPEC.md

Produce the full file content. The four **required** headers (`## Goal`,
`## User Stories / Requirements`, `## Acceptance Criteria`,
`## Technical Design`) must appear exactly so, so `team-lead-plan` validates the
file. Use this skeleton (drop optional sections only when truly irrelevant):

```markdown
# SPEC: <Title Case Epic Name>

**Epic:** `<slug>`
**Created:** <YYYY-MM-DD>
**Status:** Ready for Planning
**Repo:** `<be | fe | kanban>`

---

## Problem

<What's wrong / missing today and why it matters. Omit if the idea is purely
additive with no existing pain point.>

## Goal

<1–2 sentences: the outcome this epic delivers. Outcome, not implementation.>

## User Stories / Requirements

### US-01: <short name>
> As a <user>, I want <capability> so that <benefit>.

### US-02: <short name>
> As a <user>, I want <capability> so that <benefit>.

## Acceptance Criteria

- [ ] AC-01: <verifiable, independently checkable statement>
- [ ] AC-02: <verifiable, independently checkable statement>
- [ ] AC-03: tests pass (`nx test <project>` for be/fe; `npm test` for kanban)

## Technical Design

### Files touched

\`\`\`
<real paths under the chosen repo>
\`\`\`

### <Design subsections as needed: API Contracts / Data Schema / Flow / Architecture Notes>

<Concrete design grounded in the actual codebase.>

## Out of Scope

| Feature | Reason |
|---------|--------|
| <thing> | <why deferred> |

## Open Questions

- [ ] <anything the description + chat left ambiguous — do NOT fabricate answers>

## Constraints

- Single repo (`<be|fe|kanban>`) — no cross-service work in one task.
- <Other hard constraints from the chat / CLAUDE.md.>
```

Rules:
- Fill every `<...>` from STEP 1–2 material. Leave **no** literal placeholder
  text in the output.
- `created-at` date: use today's date (`date +%Y-%m-%d` via Shell if needed).
- If `## Open Questions` ends up empty, drop the section rather than leaving it
  blank.

---

## STEP 5 — Collision Check

Use Glob / Read to check whether `.planning/work/<slug>/SPEC.md` already exists.

- **If it exists:** ask
  `SPEC already exists at .planning/work/<slug>/SPEC.md — overwrite? [y/N]`
  and wait. Treat anything other than `y`/`Y` as: ask for a different `--name`,
  and **stop** without writing.
- **If it does not exist:** proceed to STEP 6.

---

## STEP 6 — Preview & Confirm

**Before writing anything to disk**, print:

1. The target path: `.planning/work/<slug>/SPEC.md`
2. The full proposed SPEC.md content (in a fenced block).
3. A one-line self-check confirming all four required headers are present:
   `Required headers present: Goal ✓ | User Stories / Requirements ✓ | Acceptance Criteria ✓ | Technical Design ✓`

Then ask exactly:

```
Write this SPEC.md? [y/N]
```

Wait for the user's response before proceeding.

---

## STEP 7 — Write on Confirmation

**If the user replies `y` or `Y`:**

Write the file to `.planning/work/<slug>/SPEC.md` using the Write tool (creating
the directory if needed).

Print:

```
Written: .planning/work/<slug>/SPEC.md

Next: team-lead-plan .planning/work/<slug>/SPEC.md
```

**If the user replies with anything else:**

Print: `Aborted. No file written.` and stop without writing.
