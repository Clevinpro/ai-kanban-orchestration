---
id: TASK-006
title: Update .env.example with EMBEDDING_PROVIDER, OPENAI_API_KEY, OPENAI_EMBEDDING_MODEL vars
status: done
priority: medium
repo: be
epic: fast-embeddings
complexity: 2
created-at: 2026-05-28T12:00:00.000Z
updated-at: 2026-05-28T12:00:00.000Z
started-at: 2026-05-28T21:45:31+03:00
completed-at: 2026-05-28T21:45:51+03:00
spec: .planning/work/fast-embeddings/SPEC.md
---

## Description

Add the three new embedding-related environment variables to `ai-platform/.env.example` with inline comments explaining each option. Also add a comment warning that switching `EMBEDDING_PROVIDER` truncates all chunks and vault documents, and that manually uploaded documents must be re-uploaded after a switch. No code changes — documentation only.

## Acceptance Criteria

- [ ] `EMBEDDING_PROVIDER=ollama` present in `.env.example` with comment explaining `ollama` (default, local) vs `openai` (cloud, ~5× faster)
- [ ] `OPENAI_API_KEY=` present with comment: required when `EMBEDDING_PROVIDER=openai`
- [ ] `OPENAI_EMBEDDING_MODEL=text-embedding-3-small` present with comment
- [ ] Warning comment added: switching provider truncates chunks + vault docs; manually uploaded docs must be re-uploaded
- [ ] Variables placed in a logical group (near other AI/embedding config, not scattered)

## Technical Notes

- File: `ai-platform/.env.example`
- Group with existing Ollama vars (`OLLAMA_URL`, `OLLAMA_EMBEDDING_MODEL`) for discoverability
- Exact format per SPEC:
  ```bash
  # Embedding provider — 'ollama' (default, local) or 'openai' (cloud, ~5× faster query)
  EMBEDDING_PROVIDER=ollama

  # OpenAI provider config — required when EMBEDDING_PROVIDER=openai
  # WARNING: switching provider truncates all chunks and vault documents.
  # Manually uploaded documents must be re-uploaded after a provider switch.
  OPENAI_API_KEY=
  OPENAI_EMBEDDING_MODEL=text-embedding-3-small
  ```

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed `/Users/tarasbannyi/TestAI/ai-agent-microservices/ai-platform/.env.example` against all five acceptance criteria.

All criteria are satisfied:
- `EMBEDDING_PROVIDER=ollama` is present at line 27 with the correct comment at line 26 (`'ollama' (default, local) or 'openai' (cloud, ~5× faster query)`).
- `OPENAI_API_KEY=` is present at line 32 under the comment "required when EMBEDDING_PROVIDER=openai".
- `OPENAI_EMBEDDING_MODEL=text-embedding-3-small` is present at line 33.
- The warning comment (lines 30-31) matches the spec text exactly: truncation of chunks and vault docs, and the re-upload requirement.
- The three variables are grouped immediately after the existing `OLLAMA_URL`/`OLLAMA_EMBEDDING_MODEL` lines (lines 22-24), satisfying the discoverability/grouping requirement.

The exact format matches the spec template in Technical Notes. This is a documentation-only task and the pre-existing content fully satisfies all acceptance criteria.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

No affected tests found — no test coverage for this task. This is a documentation-only change (additions to `ai-platform/.env.example`); no source files were modified, so `nx affected --target=test` reported "No tasks were run" with exit code 0.

## TeamLead Check

Status: APPROVED

All acceptance criteria verified:
- AC-1 PASS: `EMBEDDING_PROVIDER=ollama` at line 27 with comment at line 26 covering 'ollama' (default, local) vs 'openai' (cloud, ~5× faster query).
- AC-2 PASS: `OPENAI_API_KEY=` at line 32 under comment "required when EMBEDDING_PROVIDER=openai" at line 29.
- AC-3 PASS: `OPENAI_EMBEDDING_MODEL=text-embedding-3-small` at line 33.
- AC-4 PASS: Warning comment at lines 30-31 covers truncation of chunks + vault docs, and requirement to re-upload manually uploaded documents.
- AC-5 PASS: All three vars grouped immediately after `OLLAMA_URL`/`OLLAMA_EMBEDDING_MODEL` (lines 22-24), before the PostgreSQL section — logical, discoverable placement.

SPEC.md AC-06 is fully satisfied. Exact format matches the spec template in Technical Notes and the Env Vars section of SPEC.md Technical Design.
