---
id: TASK-002
title: Add QueryNormalizer class (normalize + isTagQuery) with unit tests
status: done
priority: high
repo: be
epic: hybrid-rag-search
complexity: 3
created-at: 2026-05-28T00:00:00Z
updated-at: 2026-05-28T00:00:00Z
spec: .planning/work/hybrid-rag-search/SPEC.md
---

## Description

Add a new `QueryNormalizer` helper to the `search` module of `ai-service`. Two static methods: `normalize(raw)` returns `{ semantic, lexical }` (semantic = lowercased, NFC-normalized, angle brackets stripped, whitespace collapsed; lexical = NFC-normalized + trimmed only), and `isTagQuery(raw)` detects single self-contained tag-shaped queries via regex. Include a unit test spec covering the canonical inputs from SPEC AC-13.

## Acceptance Criteria

- [ ] New file `ai-platform/apps/ai-service/src/search/query-normalizer.ts` exporting class `QueryNormalizer` with static methods `normalize` and `isTagQuery`
- [ ] `normalize('<FAQ>')` returns `{ semantic: 'faq', lexical: '<FAQ>' }`
- [ ] `normalize('  тег FAQ  ')` returns `{ semantic: 'тег faq', lexical: 'тег FAQ' }`
- [ ] `isTagQuery('<faq>')` returns `true`; `isTagQuery('<FAQ>')` returns `true`; `isTagQuery('<faq-item>')` returns `true`
- [ ] `isTagQuery('</faq>')` returns `false` (closing tags excluded)
- [ ] `isTagQuery('тег <faq>')` returns `false` (must be the entire trimmed query)
- [ ] `isTagQuery('<faq>extra')` returns `false`
- [ ] New file `ai-platform/apps/ai-service/src/search/query-normalizer.spec.ts` covering the eight cases above plus an empty-string input
- [ ] `nx test ai-service` passes for the new spec

## Technical Notes

- Regex per SPEC: `/^<[a-z][a-z0-9-]*\/?>$/i` — must NOT match `</…>` (closing tag)
- Use `raw.normalize('NFC')` before any other processing
- Class is pure — no DI, no NestJS decorators; it is a static utility, not an `@Injectable`
- Reference SPEC § QueryNormalizer code skeleton and AC-06, AC-07
- Tests follow existing pattern of `*.spec.ts` files in `apps/ai-service/src/**` (see `vault-sync.service.spec.ts`)

---REVIEW-BLOCK-START---
## Code Review

**Signal:** APPROVED

### Findings
None — implementation is a verbatim match of the SPEC § QueryNormalizer code skeleton. All acceptance criteria verified:
- `normalize('<FAQ>')` → `{ semantic: 'faq', lexical: '<FAQ>' }` is correct: angle-bracket replacement inserts spaces, final `.trim()` cleans them, lowercase converts `F`→`f`.
- `normalize('  тег FAQ  ')` → `{ semantic: 'тег faq', lexical: 'тег FAQ' }` is correct.
- `isTagQuery` regex `/^<[a-z][a-z0-9-]*\/?>$/i` correctly rejects `</faq>` because `/` does not satisfy `[a-z]` as the first character after `<`.
- Test file covers all eight AC-13 cases plus an extra case for plain words without angle brackets; empty-string is covered in both `normalize` and `isTagQuery` suites.
- Class is pure static with no DI/decorators as required.
- No security issues (no user input is eval'd or interpolated; this is pure string transformation).
---REVIEW-BLOCK-END---

## QA Results

Status: PASS

`nx affected` found no affected projects (changes are unstaged working tree files, not yet committed). Direct run of `nx test ai-service` passed: 3 test suites, 29 tests all green. The new `query-normalizer.spec.ts` is included in the passing suites alongside the existing specs.

## TeamLead Check

Status: APPROVED

All acceptance criteria verified:
- AC (file exists): `query-normalizer.ts` present at `apps/ai-service/src/search/query-normalizer.ts`, exports `QueryNormalizer` as a pure static class with no DI/decorators — PASS
- AC (normalize '<FAQ>'): implementation produces `{ semantic: 'faq', lexical: '<FAQ>' }` per SPEC code skeleton; confirmed by test at line 8-11 of spec file — PASS
- AC (normalize '  тег FAQ  '): implementation produces `{ semantic: 'тег faq', lexical: 'тег FAQ' }`; confirmed by test at line 13-16 — PASS
- AC (isTagQuery true cases): regex `/^<[a-z][a-z0-9-]*\/?>$/i` correctly matches `<faq>`, `<FAQ>`, `<faq-item>`; all three confirmed by tests — PASS
- AC (isTagQuery '</faq>' false): closing tag rejected because `/` does not satisfy `[a-z]` after `<`; confirmed by test — PASS
- AC (isTagQuery 'тег <faq>' false): `^` anchor rejects leading text; confirmed by test — PASS
- AC (isTagQuery '<faq>extra' false): `$` anchor rejects trailing text; confirmed by test — PASS
- AC (spec file covers all eight cases + empty string): `query-normalizer.spec.ts` exists and covers all eight required cases plus extra cases (plain word, empty string in both suites) — PASS
- AC (nx test ai-service passes): QA confirmed 3 suites, 29 tests all green including the new spec — PASS
