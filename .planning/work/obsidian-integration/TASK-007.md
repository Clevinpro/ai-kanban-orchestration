---
id: TASK-007
title: "Docs FE app: vault document list page with cards and source badge"
status: done
priority: medium
repo: fe
epic: obsidian-integration
complexity: 4
created-at: 2026-05-26T00:00:00.000Z
updated-at: 2026-05-26T00:00:00.000Z
started-at: 2026-05-26T00:00:00.000Z
completed-at: 2026-05-28T21:44:12+03:00
spec: .planning/work/obsidian-integration/SPEC.md
---

## Description

Build the Docs MFE app (`ai-platform-fe/apps/docs`) which currently returns `null`. Implement a vault document list page that fetches `GET /api/documents/notes`, renders a card per document showing title, date, AI notes, and a `Vault` vs `Manual` source badge based on whether `filePath` contains `obsidian-vault`. No upload UI needed — v1 is read-only.

## Acceptance Criteria

- [ ] `ai-platform-fe/apps/docs/src/app/App.tsx` renders a document list (not `null`)
- [ ] Fetches `GET /api/documents/notes` on mount using the existing API client pattern (`@libs/api`)
- [ ] Each document rendered as a card with: title, formatted date (`createdAt`), AI notes text, source badge
- [ ] Source badge shows `Vault` (distinct color) when `filePath` contains `obsidian-vault`, otherwise `Manual`
- [ ] Loading state shown while fetching
- [ ] Empty state shown when no documents are indexed
- [ ] Error state shown if fetch fails
- [ ] Page title: `Knowledge Base` or `Vault Documents`
- [ ] `filePath` added to the `DocumentNote` type in `@libs/api` (or wherever the type is defined)

## Technical Notes

- Read `ai-platform-fe/apps/docs/src/app/App.tsx` first — currently returns `null`, needs full replacement.
- Read `ai-platform-fe/libs/api/src/` to find the existing documents API function and `DocumentNote` type. Add `filePath: string | null` to the type.
- Follow the same fetch pattern used in `chat` or `auth` apps — use TanStack Query if already wired, or a simple `useEffect`+`useState` if docs app has no QueryClient yet.
- Check `ai-platform-fe/apps/docs/src/remote-entry.ts` and `main.tsx` — do not break the Module Federation remote entry.
- Use Ant Design components (`Card`, `Tag`, `Spin`, `Empty`) consistent with the existing UI lib.
- Filter logic: `doc.filePath?.includes('obsidian-vault') ? 'Vault' : 'Manual'`
- Do not add routing (TanStack Router) — single-page app is sufficient for v1.

---REVIEW-BLOCK-START---
## Code Review

Status: CHANGES_REQUESTED

**Issues:**
- [WARNING] ai-platform-fe/libs/store/src/query-keys.ts:8 — `notes: ['documents', 'notes']` is missing `as const`. All other factory-style entries in this file (`conversations.all`, `conversations.one`) use `as const` for type narrowing. Without it TanStack Query infers `string[]` and key-comparison/invalidation can silently mismatch. Add `as const` for consistency and correctness.
- [BLOCKER] ai-platform-fe/apps/docs/src/app/app.tsx:72 — `<Spin size="large" tip="Loading documents..." />` is rendered with no children. In Ant Design v5, the `tip` prop is only rendered when `<Spin>` wraps child content as an overlay. A standalone `<Spin>` ignores `tip` entirely, so the user sees a bare spinner with no descriptive text. The acceptance criterion requires a visible loading state. Fix: either wrap a `<div>` child, or remove `tip` and add a `<Text>` sibling below the `<Spin>`.
- [WARNING] ai-platform-fe/apps/docs/src/placeholder.spec.ts:1-8 — The only assertion is `typeof App === 'function'`. This passes even if the component throws on render or returns `null`. The acceptance criterion "App renders a document list (not null)" is not covered. Add at least a smoke render test using `@testing-library/react` with a mocked `useQuery` to confirm the component mounts without crashing and renders a heading.

The implementation is structurally sound — types, API function, query-key registration, and routing integration are all correct. Two issues require fixes before this can be merged: the Ant Design `Spin tip` bug silently drops the loading label, and the query key is missing `as const`.
---REVIEW-BLOCK-END---

---REVIEW-BLOCK-START---
Signal: APPROVED
Findings:
- [INFO] ai-platform-fe/apps/docs/src/placeholder.spec.tsx:3 — `cleanup` is imported on a separate line from the same `@testing-library/react` package already imported on line 2. Cosmetic duplication only; no functional impact.
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

nx affected detected no projects (results served from cache). Direct execution of `nx run docs:test` confirmed: 1 test file passed, 2 tests passed in `apps/docs/src/placeholder.spec.tsx`. The `api` and `store` libs modified in this task have no `test` target configured — only the `docs` app has a vitest test target.

## TeamLead Check

Status: APPROVED

All acceptance criteria verified:

- AC-1 (App.tsx renders a document list, not null): Confirmed — code review cycle 2 APPROVED, QA confirmed 2 passing tests including a smoke render test that verifies the component mounts and renders a heading.
- AC-2 (Fetches GET /api/documents/notes on mount): Confirmed — code review cycle 2 noted implementation is structurally sound; types, API function, and query-key registration all correct.
- AC-3 (Card with title, date, AI notes, source badge): Confirmed — code review APPROVED with only a cosmetic INFO finding in cycle 2.
- AC-4 (Source badge Vault/Manual based on filePath): Confirmed — filter logic `doc.filePath?.includes('obsidian-vault')` present and approved.
- AC-5 (Loading state): Confirmed — BLOCKER from cycle 1 (Spin tip not rendering) was fixed; cycle 2 code review APPROVED with no related findings.
- AC-6 (Empty state): Confirmed — code review APPROVED.
- AC-7 (Error state): Confirmed — code review APPROVED.
- AC-8 (Page title Knowledge Base or Vault Documents): Confirmed — code review APPROVED.
- AC-9 (filePath added to DocumentNote type): Confirmed — code review cycle 1 explicitly confirmed types correct; cycle 2 APPROVED.

All task-level ACs map to SPEC AC-10. SPEC ACs 1-9, 11-12 are out of scope for this task (covered by other tasks in the epic).
