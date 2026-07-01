# SPEC: RAG Tag-Content Retrieval Quality

**Epic:** `rag-tag-content-retrieval-quality`
**Created:** 2026-07-01
**Status:** Ready for Planning
**Repo:** `be`

---

## Problem

Chat responses are fast but wrong or empty for tag-content questions. Live
examples from the deployed chat: `"tag faq"` returned only the document title
containing `<faq>` (not its content); `"description tag faq"` and
`"Дай тег faq"` (Ukrainian) both returned the generic
`"The model did not produce a usable answer. Please rephrase your question and
try again."` fallback.

Tracing the pipeline (`ai-platform/apps/ai-service/src/`) surfaced four
independent root causes:

- **R1 — Routing gap.** `QueryRouterService.isStructuredQuery`
  (`ai/query-router.service.ts`) and `QueryNormalizer.isTagQuery`
  (`search/query-normalizer.ts`) only match a bare `<faq>` token or English
  `count`/`list` keywords. Natural-language tag phrasings ("description tag
  faq", "Дай тег faq") miss the structured lane and fall into the `complex`
  agent loop, which is the fragile, LLM-dependent path.
- **R2 — No tag-content tool.** `tagQuery` (`ai/tools/tag-query.tool.ts`)
  returns only the **titles** of documents containing a tag. `fetchDocument`
  (`ai/tools/fetch-document.tool.ts`) returns the **whole document body**
  (truncated at 6000 chars). Nothing extracts just the inner content of one
  `<tag>...</tag>` block — `TAG_EXTRACTION_PATTERN` only matches the
  opening/self-closing marker, not a full block with its content.
- **R3 — Chunking splits tags apart.** `DocumentService.splitIntoChunks`
  (`document/document.service.ts`) blocks by markdown heading / numbered-list
  line / paragraph, packs to `MAX_CHUNK_SIZE=1200` chars with 100-char
  overlap, and coalesces adjacent undersized blocks — with no awareness that a
  `<tag>...</tag>` should stay atomic. In the source documents, every tag is
  preceded by a numbered marker (`1.`, `2.`, `3.` at line start) — one numbered
  item is one tag. The existing `NUMBERED_RE` boundary already fires on these
  lines, but the current oversized-split and undersized-coalesce logic can
  still cut a numbered item's content mid-tag or merge it into its neighbor,
  so a tag's open and close markers can land in different chunks and break
  `similaritySearch` recall.
- **R4 — Empty FINAL fallback.** In the `complex` agent loop
  (`ai/ai.service.ts`), a reasoning model can burn its token budget on a
  `<think>` block and emit no `FINAL:` text, surfacing the generic
  `EMPTY_FINAL_ANSWER_FALLBACK` notice instead of falling back to whatever the
  last tool observation already retrieved.

## Goal

Tag-content questions (in English or Ukrainian) return the actual content of
the requested tag directly, deterministically, and without the "did not
produce a usable answer" fallback — while keeping the existing fast, cheap
structured-lane response time.

## User Stories / Requirements

### US-01: Ask for a tag's content in natural language
> As a chat user, I want to ask for a tag's content ("give me the faq tag",
> "опис тегу faq", "Дай тег faq") so that I get the tag's actual content, not
> just a list of documents that mention it.

### US-02: Deterministic tag-content answer
> As a chat user, I want a tag-content question to be answered directly from
> the database (no LLM round-trip) so that the answer is fast and never falls
> back to a generic "no usable answer" error.

### US-03: Tag content is never split across chunks
> As the retrieval pipeline, I want each numbered tag item to remain a single,
> intact chunk so that similarity search never returns a half tag and the new
> tag-content tool always has one clean unit to extract from.

### US-04: Graceful degradation in the complex lane
> As a chat user asking something the structured/technical lanes don't
> recognize, I want the agent loop to fall back to the last retrieved evidence
> instead of a generic failure message when the model's final answer is empty.

## Acceptance Criteria

- [ ] AC-01: A bare or NL tag-content query in English (e.g. "tag faq",
      "content of tag faq", "give me the faq tag") is classified into the
      structured lane and answered by a new deterministic tool that returns
      the tag's inner content — not just the containing document title(s).
- [ ] AC-02: The same class of query phrased in Ukrainian Cyrillic (e.g. "Дай
      тег faq", "опис тегу faq", "покажи вміст тегу faq") is classified into
      the structured lane and answered identically to AC-01 (no
      transliteration — Cyrillic input in, Cyrillic-safe handling).
- [ ] AC-02b: A tag that does not exist in any document returns a clear
      "not found" observation (matching the existing not-found pattern in
      `tag-query.tool.ts` / `fetch-document.tool.ts|)`) rather than an error or
      the generic fallback.
- [ ] AC-03: `DocumentService.splitIntoChunks` treats each numbered-item
      block (`NUMBERED_RE`) as atomic: the oversized-split path never cuts
      inside a numbered item's content, and the undersized-coalesce path
      never merges two different numbered items into one chunk.
- [ ] AC-04: A full reindex (`DocumentService.reindexAll`) of the existing
      corpus with the updated chunking produces exactly one chunk per
      numbered tag item (verified against the FAQ-tag document used in the
      failing example).
- [ ] AC-05: When the `complex` agent loop's planner emits an empty/whitespace
      `FINAL:` answer AND at least one tool observation was collected during
      the run, the loop returns the last tool observation instead of
      `EMPTY_FINAL_ANSWER_FALLBACK`. The generic fallback is used only when no
      observation exists either.
- [ ] AC-06: Existing structured-lane behavior (bare `<faq>` lookup, `count`,
      `list all`) is unchanged — new routing rules only ADD coverage, they
      don't alter classification of currently-passing inputs.
- [ ] AC-07: tests pass (`nx test ai-service`, and `nx e2e ai-service` for any
      touched endpoint/observable behavior).

## Technical Design

### Files touched

```
ai-platform/apps/ai-service/src/ai/tools/tag-query.tool.ts       (extend or add sibling tool)
ai-platform/apps/ai-service/src/ai/tools/fetch-document.tool.ts  (reuse TAG_EXTRACTION_PATTERN helpers)
ai-platform/apps/ai-service/src/ai/tools/tool-registry.ts        (no change expected; registration call site changes in ai.module.ts)
ai-platform/apps/ai-service/src/ai/ai.module.ts                  (register new tool if added as a sibling)
ai-platform/apps/ai-service/src/ai/query-router.service.ts       (extend isStructuredQuery / add NL tag-content detection)
ai-platform/apps/ai-service/src/search/query-normalizer.ts       (extend isTagQuery or add a new NL-aware predicate)
ai-platform/apps/ai-service/src/document/document.service.ts     (splitIntoChunks / normalizeBlocks: numbered-item atomicity)
ai-platform/apps/ai-service/src/ai/ai.service.ts                  (EMPTY_FINAL_ANSWER_FALLBACK → last-observation fallback)
ai-platform/apps/ai-service/src/ai/tools/*.spec.ts                (new/updated unit tests)
ai-platform/apps/ai-service/src/ai/query-router.service.spec.ts   (new routing cases, EN + UK)
ai-platform/apps/ai-service/src/document/document.service.spec.ts (numbered-item chunk atomicity tests)
```

### Tag-content extraction

Add a tag-content capability (new tool, e.g. `fetchTagContent`, or a `content`
intent on the existing `tagQuery` tool — the planning task should pick one
based on which keeps `parseTagQueryIntent`/`TagQueryIntent` simplest) that:

- Reuses `extractTagName` and `TAG_EXTRACTION_PATTERN` from
  `tag-query.tool.ts` to recognize the tag token.
- Runs a parameterized Prisma raw query against `documents`/`chunks` that
  captures the content **between** the tag's opening and closing marker (or
  the self-closing marker's own line, when self-closing), not just whether the
  marker exists.
- Returns a bounded, non-throwing observation: found → tag content (title +
  body, mirroring `formatFetchObservation`'s shape); not found → the existing
  "not found" phrasing; multiple matches → list titles/instances for the
  caller to disambiguate (mirroring `fetch-document.tool.ts`'s multi-match
  pattern).

### Multilingual structured-lane routing

Extend `isStructuredQuery` (`query-router.service.ts`) and/or `isTagQuery`
(`query-normalizer.ts`) with an NL tag-content detector that recognizes a tag
token (`<name>` or a bare `name` adjacent to a tag keyword) combined with
English keywords (`tag`, `content`, `description`, `give me`, `show`) OR
Ukrainian Cyrillic keywords (`тег`, `дай`, `покажи`, `опис`, `вміст`) — per the
project's no-transliteration rule (Cyrillic Ukrainian only, never
Latin-script). New intent value(s) on `TagQueryIntent` (or a parallel intent
type) route to the new tag-content tool instead of the `lookup` (titles-only)
path. Existing `list`/`count`/bare-tag `lookup` classification must not
regress (AC-06).

### Numbered-item-atomic chunking

In `DocumentService.normalizeBlocks` (called from `splitIntoChunks`):

- **Oversized-split phase:** when a block's `section` came from a
  `NUMBERED_RE` line, do not apply the paragraph/sentence/word boundary split
  if it would break the block — instead only apply the existing `MAX`-based
  hard split as a last resort for a single numbered item that is itself larger
  than `MAX_CHUNK_SIZE` (retain overlap for that fallback only).
- **Coalesce phase:** never merge a numbered-item block with a neighboring
  block into one chunk — treat a numbered-item boundary as a hard chunk
  boundary regardless of `sameSection`/size, so `<tag>...</tag>` content
  bounded by its numbered marker always lands in exactly one chunk.
- This requires a **reindex** (`DocumentService.reindexAll` /
  `VaultSyncService` re-sync) of already-indexed documents after the change
  ships, so existing chunks in the DB reflect the new boundaries (AC-04).

### Empty-FINAL fallback to last observation

In `runChatFlow`'s `final` branch (`ai.service.ts`, near
`EMPTY_FINAL_ANSWER_FALLBACK`): track the most recent tool `observation` string
across loop iterations (a new local variable alongside `accumulatedAnswer`).
When `decision.answer.trim().length === 0`:
- If a prior observation exists, use it as `finalAnswer` instead of the
  generic fallback string.
- Otherwise (no observation was ever collected this run), keep today's
  `EMPTY_FINAL_ANSWER_FALLBACK` behavior unchanged.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Frontend changes | This is a backend answer-quality/routing/chunking fix; no new client-facing surface. Repo is `be`-only per this spec. |
| General multilingual query routing beyond tag-content | Only the tag-content NL phrasings (EN + UK) called out here are in scope; broader intent-detection generalization is a separate concern. |
| Redis streaming-chunk buffering / persistence | Tracked separately in `.planning/work/research-redis-streaming-chunk-buffering-persistence/`; unrelated to this epic's build-blocker-free scope. |
| Fixing the pre-existing ai-service build break (missing `AiChatOptions` export, `IAIProvider.chat` arity, `runId`/`saveMessage` mismatch) | Discovered during a separate Redis re-investigation; if still present when this epic starts, planning should flag it as a prerequisite blocker rather than silently folding the fix into this epic's tasks. |

## Open Questions

- [ ] Should tag-content extraction be a new tool (`fetchTagContent`) or a new
      intent (`content`) on the existing `tagQuery` tool? Either satisfies the
      ACs; the planning task should pick based on keeping `TagQueryIntent` and
      the planner's tool-description prompt simplest.
- [ ] Full list of Ukrainian trigger keywords for AC-02 (`тег`, `дай`,
      `покажи`, `опис`, `вміст` were suggested in discussion) — confirm
      against real user phrasings before finalizing the regex/keyword set.
- [ ] Whether the reindex in AC-04 should be triggered automatically as part
      of the migration/deploy step for this epic, or left as a manual
      operational step documented in the task.
- [ ] Confirm whether the pre-existing ai-service build break (noted in Out of
      Scope) is still present when this epic starts; if so, planning must
      sequence a build-fix task first since nothing else can ship otherwise.

## Constraints

- Single repo (`be`) — no cross-service work in one task; `ai-platform-fe/` is
  untouched by this epic.
- All new routing/matching logic must handle Ukrainian input as native
  Cyrillic text — never transliterate to Latin script (project convention).
- No new infrastructure (no Redis, no new external dependency) — this epic is
  scoped to existing DB-backed tools, routing rules, and the in-process agent
  loop.
- Existing structured-lane, technical-lane, and meta-lane classification for
  currently-passing inputs must not regress (AC-06).
