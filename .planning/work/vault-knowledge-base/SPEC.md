# SPEC: Vault as Sole Knowledge Base

**Epic:** `vault-knowledge-base`
**Created:** 2026-05-28
**Status:** Ready for Planning

---

## Goal

Remove the `GUIDE` document type and all associated stale-summary logic. Capability
questions (e.g. "що я можу тут зробити?") are answered via RAG scoped to the Obsidian
vault `project/` folder. All other questions use full RAG across all indexed documents.
The Obsidian vault is the single source of truth for all AI responses.

---

## User Stories / Requirements

### US-01: Single Document Type
> As a developer, I want all documents treated uniformly so there is no special-case
> code path for guide files.

### US-02: Capability Questions Answer from Vault Project Docs
> As a user, when I ask "what can I do here?" I want the answer to come from the
> Obsidian vault `project/` notes (Overview, Architecture) — not a stale guide summary.

### US-03: Context Questions Answer via Full RAG
> As a user, when I ask about a specific feature or commit, I want similarity search
> across all indexed documents (vault commits, epics, uploaded docs).

### US-04: Clean Schema
> As a developer, I want the `DocumentType` enum and `type` column removed from the
> database so the data model reflects reality.

---

## Acceptance Criteria

- [ ] AC-01: `DocumentType` enum removed from `schema.prisma`; `type` column dropped via migration
- [ ] AC-02: Existing GUIDE document rows deleted before migration runs
- [ ] AC-03: `DocumentService` has no `DOCUMENT_TYPE`, `getDocumentType`, or `upsertDocument` GUIDE branch
- [ ] AC-04: `DocumentService.uploadDocument` no longer accepts `filename` param or returns `type`; always indexes as documentation
- [ ] AC-05: `KnowledgeService.refreshGuideSummary` removed entirely
- [ ] AC-06: `DocumentController.uploadDocument` always fires `generateDocNotes` (no `if type === DOCUMENTATION` guard)
- [ ] AC-07: `SearchService.similaritySearch` accepts optional `filePathPrefix` param; when set, filters chunks by `file_path LIKE '<prefix>%'`
- [ ] AC-08: `AiService.answerCapabilityQuery` uses `searchService.similaritySearch(query, 6, 'docs/obsidian-vault/project/')` instead of fetching guide summary; streams response normally via AI provider
- [ ] AC-09: `GET /documents/notes` query works without `WHERE type =` filter
- [ ] AC-10: `nx test ai-service` passes — 0 TypeScript errors, 0 test failures
- [ ] AC-11: Chat query "що я можу тут зробити?" returns answer from vault `project/Overview.md` or `Architecture.md`
- [ ] AC-12: Chat query about a specific commit returns answer from vault `commits/` chunks

---

## Technical Design

### Query Routing (Variant C)

```
User message
     │
     ▼
AiService: is this a capability question?
     │
     ├── YES → SearchService.similaritySearch(query, 6, 'docs/obsidian-vault/project/')
     │              → chunks only from vault project/ docs
     │              → build system prompt from those chunks
     │              → stream AI response
     │
     └── NO  → SearchService.similaritySearch(query, 6)   ← no filter
                   → chunks from ALL documents (vault + uploaded)
                   → build system prompt → stream AI response
```

The capability detector logic already exists in `AiService` — only the data source changes.
`GuideAnswerSource` type and direct `guide.summary` return are removed.

---

### What Gets Removed

| File | Remove |
|------|--------|
| `schema.prisma` | `enum DocumentType`, `type` field on `Document` model |
| `document.service.ts` | `DOCUMENT_TYPE` const, `DocumentTypeValue` type, `getDocumentType()`, GUIDE branch in `upsertDocument`, `type` param in `insertDocument` and `upsertDocument`, `type` in `uploadDocument` return |
| `knowledge.service.ts` | `refreshGuideSummary()` + `buildGuideSummaryPrompt()` |
| `document.controller.ts` | `if (result.type === DOCUMENTATION)` guard |
| `ai.service.ts` | `GuideAnswerSource` type, `$queryRaw` for guide, direct `answer` return from guide content |

### What Changes

| File | Change |
|------|--------|
| `search.service.ts` | Add optional `filePathPrefix?: string` to `similaritySearch` |
| `ai.service.ts` | `answerCapabilityQuery` calls `similaritySearch` with vault project prefix, then streams response via AI provider like any other query |

---

### Migration

**File:** `prisma/migrations/<timestamp>_remove_document_type/migration.sql`

```sql
-- Step 1: delete GUIDE documents (FK cascade removes their chunks)
DELETE FROM "documents" WHERE "type" = 'GUIDE'::"DocumentType";

-- Step 2: drop the type column
ALTER TABLE "documents" DROP COLUMN "type";

-- Step 3: drop the enum
DROP TYPE "DocumentType";
```

---

### SearchService After Change

```typescript
async similaritySearch(
  query: string,
  limit = 6,
  filePathPrefix?: string,   // NEW — optional vault subfolder filter
): Promise<SimilaritySearchResult[]> {
  const embedding = await this.embeddingsService.generateEmbedding(query);
  const queryVector = `[${embedding.join(',')}]`;

  if (filePathPrefix) {
    return this.prismaService.$queryRaw`
      WITH params AS (SELECT ${queryVector}::vector AS query_vector)
      SELECT c.id, c.content, d.title,
             1 - (c.embedding <=> params.query_vector::vector) AS similarity
      FROM chunks c
      JOIN documents d ON c.document_id = d.id
      CROSS JOIN params
      WHERE d.file_path LIKE ${filePathPrefix + '%'}
      ORDER BY c.embedding <=> params.query_vector::vector
      LIMIT ${limit}
    `;
  }

  // existing unfiltered query unchanged
  ...
}
```

---

### AiService.answerCapabilityQuery After Change

```typescript
// Before: fetched guide.summary from DB, returned it directly (bypassed AI)
// After: RAG scoped to vault project/, streamed through AI like any other query

private async answerCapabilityQuery(
  payload: AiRequestPayload,
  emitStatus: ...,
): Promise<Observable<string>> {
  const chunks = await this.searchService.similaritySearch(
    payload.message,
    6,
    'docs/obsidian-vault/project/',
  );
  const systemPrompt = await this.loadSystemPrompt(chunks);
  // ... same streaming pipeline as regular queries
}
```

---

### DocumentService After Change

```typescript
// Before
async uploadDocument(filePath, title, filename = title)
  → { documentId, chunksCount, type }

// After
async uploadDocument(filePath, title)
  → { documentId, chunksCount }
```

`upsertDocument` collapses — no GUIDE branch, no type arg:

```typescript
private async upsertDocument(filePath, title, text): Promise<string> {
  const documentId = randomUUID();
  await this.insertDocument(documentId, filePath, title, text);
  return documentId;
}
```

`insertDocument` SQL loses `"type"` column:

```sql
INSERT INTO "documents" ("id", "title", "content", "file_path", "created_at", "updated_at")
VALUES (${documentId}, ${title}, ${text}, ${filePath}, NOW(), NOW())
```

---

### DocumentController After Change

```typescript
// Before
if (result.type === DOCUMENT_TYPE.DOCUMENTATION) {
  void this.knowledgeService.generateDocNotes(...)
    .then(() => this.knowledgeService.refreshGuideSummary(...))
}

// After — always generate notes, no guide refresh
void this.knowledgeService.generateDocNotes(result.documentId).catch(...)
```

---

## Task Breakdown (for `/team-lead:plan`)

| # | Title | Repo | Complexity |
|---|-------|------|------------|
| 1 | Prisma migration: delete GUIDE docs + drop type column + drop enum | be | 3 |
| 2 | `DocumentService`: remove DOCUMENT_TYPE, getDocumentType, GUIDE branch; simplify uploadDocument/upsertDocument/insertDocument signatures | be | 5 |
| 3 | `KnowledgeService`: remove refreshGuideSummary; `DocumentController`: remove type guard, always generateDocNotes | be | 2 |
| 4 | `SearchService`: add optional filePathPrefix to similaritySearch; `AiService`: replace guide DB fetch with scoped RAG in answerCapabilityQuery | be | 4 |

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| FE changes | Chat FE and docs app unchanged — routing is BE-only |
| VaultSyncService changes | Already passes `(filePath, title)` — matches new 2-arg signature |
| guide.md content migration | `project/Overview.md` already covers it |
| Capability query detector logic | Detection already works; only data source changes |

---

## Constraints

- Migration must DELETE GUIDE docs BEFORE dropping the column — FK cascades chunks automatically
- `VaultSyncService` calls `uploadDocument(filePath, title)` — matches new 2-arg signature after TASK-002
- `api-gateway` `DocumentsController` proxies upload — removing `type` from response requires no change there
- `answerCapabilityQuery` must remain a streaming `Observable<string>` — not a direct string return — to stay consistent with the rest of the AI pipeline

---

## Success Criteria

1. `nx test ai-service` passes — 0 TypeScript errors, 0 test failures
2. `GET /api/vault/status` returns `indexed > 0` — vault docs still queryable after migration
3. Chat query "що я можу тут зробити?" returns answer sourced from vault `project/` chunks
4. Chat query "що змінилось в auth модулі?" returns answer sourced from vault `commits/` chunks
5. `docker exec ai-platform-postgres-1 psql -U postgres -d ai_platform -c "\d documents"` shows no `type` column
6. `grep -r "GUIDE" ai-platform/apps/` returns 0 results
