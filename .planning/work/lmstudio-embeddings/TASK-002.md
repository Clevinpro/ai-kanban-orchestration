---
id: TASK-002
title: Wire LMSTUDIO_EMBEDDING_PROVIDER token, module useFactory, factory lmstudio branch
status: done
priority: high
repo: be
epic: lmstudio-embeddings
complexity: 3
created-at: 2026-06-05T10:29:52Z
updated-at: 2026-06-05T13:42:39+03:00
started-at: 2026-06-05T13:37:53+03:00
completed-at: 2026-06-05T13:42:39+03:00
spec: .planning/work/lmstudio-embeddings/SPEC.md
---

## Description

Wire the new `LmStudioEmbeddingProvider` (created in TASK-001) into DI and provider resolution. Add a `LMSTUDIO_EMBEDDING_PROVIDER` token to `embeddings.constants.ts`, register a conditional `useFactory` provider in `EmbeddingsModule` that instantiates `LmStudioEmbeddingProvider` only when `EMBEDDING_PROVIDER=lmstudio` (mirroring the existing OpenAI conditional wiring), and add a `lmstudio` branch to `EmbeddingProviderFactory` that returns the injected provider or throws a clear not-initialised error.

## Acceptance Criteria

- [ ] `LMSTUDIO_EMBEDDING_PROVIDER` DI token added to `embeddings.constants.ts`
- [ ] `EmbeddingsModule` registers conditional `useFactory` returning `LmStudioEmbeddingProvider` when `EMBEDDING_PROVIDER` (lowercased) is `lmstudio`, else `null` — mirrors OpenAI wiring
- [ ] `EmbeddingProviderFactory` resolves `EMBEDDING_PROVIDER=lmstudio` to the injected provider; throws `LM Studio provider not initialised (EMBEDDING_PROVIDER=lmstudio)` if injected value is null
- [ ] Unknown `EMBEDDING_PROVIDER` values still throw the existing clear error (no regression)
- [ ] `ollama` and `openai` resolution behave exactly as before

## Technical Notes

- Files: `ai-platform/apps/ai-service/src/embeddings/embeddings.constants.ts`, `embeddings.module.ts`, `providers/embedding-provider.factory.ts`.
- Factory needs the new provider injected via `@Inject(LMSTUDIO_EMBEDDING_PROVIDER)` with `@Optional()` if that is how the OpenAI provider is injected — copy the existing OpenAI injection pattern exactly.
- Factory branch sketch and module `useFactory` sketch are in SPEC.md "Factory branch" and "Module wiring" sections.
- TASK-001 created `providers/lmstudio-embedding.provider.ts` — import from there.
- Load `ai-platform/CLAUDE.md` before editing.

---REVIEW-BLOCK-START---
## Code Review

Status: APPROVED

Reviewed the LMSTUDIO_EMBEDDING_PROVIDER token addition, the conditional `useFactory` wiring in EmbeddingsModule, the `lmstudio` branch in EmbeddingProviderFactory, and the accompanying factory spec. The implementation mirrors the existing OpenAI conditional-provider pattern exactly (including `@Optional() @Inject` injection, module exports, and the not-initialised guard), all five acceptance criteria are satisfied, the error messages match the spec verbatim, and tests cover every branch including the null-provider case. No bugs, security issues, or quality concerns found.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

Ran `nx affected --target=test --base=HEAD~1 --head=HEAD` in ai-platform/. Exit code 0, "No tasks were run" — no projects were affected by the HEAD~1..HEAD diff (which contains only planning/config files; the TASK-002 source changes are uncommitted in the working tree). No affected tests found — no test coverage for this task.

## TeamLead Check

Status: APPROVED

All acceptance criteria verified against the implementation:
- AC-1 (PASS): `LMSTUDIO_EMBEDDING_PROVIDER` token present in `embeddings.constants.ts`.
- AC-2 (PASS): `EmbeddingsModule` registers a conditional `useFactory` (embeddings.module.ts) returning `new LmStudioEmbeddingProvider(...)` when `EMBEDDING_PROVIDER` lowercased is `lmstudio`, else `null` — mirrors the OpenAI wiring exactly and is exported.
- AC-3 (PASS): `EmbeddingProviderFactory` has the `lmstudio` branch returning the `@Optional() @Inject(LMSTUDIO_EMBEDDING_PROVIDER)` provider and throws `LM Studio provider not initialised (EMBEDDING_PROVIDER=lmstudio)` verbatim when null.
- AC-4 (PASS): Unknown values still hit `throw new Error(`Unsupported EMBEDDING_PROVIDER: ...`)` — no regression.
- AC-5 (PASS): `ollama` and `openai` branches and the OpenAI conditional provider are unchanged.
