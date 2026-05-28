<!-- refreshed: 2026-05-20 -->
# Architecture

**Analysis Date:** 2026-05-20

## System Overview

```text
┌───────────────────────────────────────────────────────────────────────┐
│                    Frontend (Module Federation MFE)                    │
│                      ai-platform-fe/ (Nx monorepo)                    │
│                                                                        │
│  shell (host)   ─────── lazy loads ──────►  auth (remote)             │
│  port 3000               TanStack Router      port 3001               │
│                                           ►  chat (remote)            │
│                                               port 3002               │
└───────────────────────────────┬───────────────────────────────────────┘
                                │  HTTP/SSE  (axios + EventSource)
                                │  API_URL → http://localhost:4000/api
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│                         API Gateway (NestJS)                           │
│              ai-platform/apps/api-gateway/   port 4000                │
│                                                                        │
│  POST /api/auth/*      ──── HTTP proxy ────►  auth-service :4002      │
│  POST /api/ai/chat     ──── Kafka publish ──► ai.request topic        │
│  GET  /api/ai/chat/stream ─ SSE, Kafka sub ◄─ ai.response topic      │
│  GET  /api/conversations/* ─ Prisma direct                            │
│  POST /api/documents/upload ─ HTTP proxy ──►  ai-service :4001        │
└──────────────┬───────────────────────────────────────┬────────────────┘
               │                                       │
      Kafka (ai.request)                     HTTP (localhost)
               │                                       │
               ▼                                       ▼
┌──────────────────────────┐         ┌─────────────────────────────────┐
│  AI Service (NestJS)     │         │  Auth Service (NestJS)          │
│  ai-platform/apps/       │         │  ai-platform/apps/              │
│  ai-service/  port 4001  │         │  auth-service/  port 4002       │
│                          │         │                                  │
│  Kafka consumer:         │         │  POST /api/auth/login           │
│    ai.request ───────►   │         │  POST /api/auth/register        │
│    RAG pipeline          │         │  GET  /api/auth/google          │
│    LLM provider          │         │  POST /api/auth/refresh         │
│    Kafka publish ──────► │         │  POST /api/auth/logout          │
│    ai.response           │         │  GET  /api/auth/me              │
│                          │         │                                  │
│  HTTP server:            │         │  Strategies:                    │
│    POST /api/documents/  │         │    JWT (cookie-based)           │
│    upload (internal)     │         │    Google OAuth2                │
│    GET  /api/health      │         └─────────────┬───────────────────┘
└──────────────┬───────────┘                       │
               │                                   │
               ▼                                   ▼
┌───────────────────────────────────────────────────────────────────────┐
│             Shared Infrastructure Libs  (@ai-platform/*)               │
│  @ai-platform/database  — PrismaService, schema (PostgreSQL + pgvector)│
│  @ai-platform/kafka     — KafkaProducerService, KafkaConsumerService  │
│  @ai-platform/shared    — LoggerService (pino), types, constants      │
└───────────────────────────────────────────────────────────────────────┘
               │
               ▼
┌───────────────────────────────────────────────────────────────────────┐
│  Data Stores                                                           │
│  PostgreSQL + pgvector  — users, sessions, conversations,             │
│                           messages, documents, chunks (vector(768))   │
│  Apache Kafka           — ai.request, ai.response, auth.event topics  │
└───────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | Key Files |
|-----------|----------------|-----------|
| api-gateway | Single external entry point; proxies auth, proxies doc uploads, handles chat over Kafka+SSE, owns conversation CRUD directly via Prisma | `ai-platform/apps/api-gateway/src/` |
| auth-service | JWT issuance (access 15 min / refresh 7 days), email/password auth, Google OAuth2, refresh token rotation, revocation | `ai-platform/apps/auth-service/src/` |
| ai-service | Kafka consumer of `ai.request`; RAG pipeline (embed → vector search → prompt build → LLM stream); Kafka producer of `ai.response`; document ingestion HTTP endpoint | `ai-platform/apps/ai-service/src/` |
| shell (FE) | Module Federation host, TanStack Router, global QueryClientProvider, lazy-loads auth and chat remotes | `ai-platform-fe/apps/shell/src/` |
| auth (FE remote) | Login, register, Google OAuth redirect, GuestRoute guard | `ai-platform-fe/apps/auth/src/` |
| chat (FE remote) | Chat page, `useChat` hook, `useStreamConnection` SSE client, conversation sidebar | `ai-platform-fe/apps/chat/src/` |
| @ai-platform/database | PrismaService singleton, Prisma schema, migrations | `ai-platform/libs/database/` |
| @ai-platform/kafka | KafkaProducerService, KafkaConsumerService (topic fan-out, dynamic subscriptions) | `ai-platform/libs/kafka/` |
| @ai-platform/shared | LoggerService (pino/nestjs-pino), shared types (IAIProvider, AiResponsePayload, KAFKA_TOPICS, etc.), constants | `ai-platform/libs/shared/` |
| @libs/api (FE) | Axios client, all API endpoint functions, SSE `streamMessage`, shared types | `ai-platform-fe/libs/api/src/` |
| @libs/store (FE) | TanStack Query hooks for conversations, `useActiveConversation` (localStorage + useSyncExternalStore) | `ai-platform-fe/libs/store/src/` |
| @libs/ui (FE) | Shared React components (ChatMessageList, ChatInput, LoginForm, etc.), Storybook | `ai-platform-fe/libs/ui/src/` |

## Pattern Overview

**Overall:** Asynchronous microservices with event-driven AI pipeline + Module Federation frontend

**Key Characteristics:**
- API Gateway acts as the only public-facing NestJS service; downstream services are never called directly by the browser
- AI request/response cycle is fully asynchronous: HTTP POST queues a Kafka message, a Server-Sent Events endpoint streams the response back to the browser as the AI service publishes chunks to `ai.response`
- Frontend uses Webpack Module Federation: the `shell` app is the host and lazily loads `auth` and `chat` micro-frontends at runtime
- RAG (Retrieval-Augmented Generation) pipeline: user query → embedding (Ollama) → cosine similarity search against pgvector chunks → context injected into LLM prompt
- AI provider is swappable at startup via `AI_PROVIDER` env var: `ollama` (default) or `claude`

## Layers

**Frontend Shared Libs Layer:**
- Purpose: Cross-app utilities shared across all MFE remotes
- Location: `ai-platform-fe/libs/`
- Contains: API client + endpoint functions (`@libs/api`), TanStack Query hooks (`@libs/store`), UI components (`@libs/ui`)
- Depends on: axios, @tanstack/react-query, Ant Design
- Used by: all FE apps (auth, chat, shell, docs)

**Frontend Application Layer:**
- Purpose: Route-level pages and feature hooks
- Location: `ai-platform-fe/apps/`
- Contains: `shell` (host + router), `auth` (login/register routes), `chat` (chat page + hooks), `docs` (placeholder)
- Depends on: `@libs/api`, `@libs/store`, `@libs/ui`
- Used by: end users via browser

**API Gateway Layer:**
- Purpose: Edge gateway — authenticates requests (JWT cookie), routes to backend services
- Location: `ai-platform/apps/api-gateway/src/`
- Contains: controllers for auth (proxy), ai (Kafka), conversations (Prisma direct), documents (HTTP proxy), health
- Depends on: `@ai-platform/database`, `@ai-platform/kafka`, `@ai-platform/shared`
- Used by: frontend (all HTTP/SSE requests)

**Auth Service Layer:**
- Purpose: Identity and session management
- Location: `ai-platform/apps/auth-service/src/`
- Contains: AuthController, AuthService, JWT/Google Passport strategies, DTOs
- Depends on: `@ai-platform/database`, `@ai-platform/shared`
- Used by: api-gateway (HTTP proxy)

**AI Service Layer:**
- Purpose: AI processing — document ingestion, RAG search, LLM orchestration
- Location: `ai-platform/apps/ai-service/src/`
- Contains: AiModule (Kafka consumer), AiService (RAG pipeline), provider factory, SearchService, EmbeddingsService, DocumentService, KnowledgeService, ConversationService
- Depends on: `@ai-platform/database`, `@ai-platform/kafka`, `@ai-platform/shared`
- Used by: api-gateway (Kafka, HTTP for doc uploads)

**Shared Infrastructure Layer:**
- Purpose: Common NestJS modules injected into all services
- Location: `ai-platform/libs/`
- Contains: `@ai-platform/database` (PrismaService), `@ai-platform/kafka` (producer/consumer), `@ai-platform/shared` (logger, types, constants)
- Depends on: Prisma, kafkajs, nestjs-pino, pino
- Used by: all backend services

## Data Flow

### AI Chat Request (Async Kafka + SSE)

1. User types message → `useChat.sendMessage()` (`ai-platform-fe/apps/chat/src/hooks/useChat.ts`)
2. `useStreamConnection.connect()` opens SSE to `GET /api/ai/chat/stream?conversationId=X` (`ai-platform-fe/libs/api/src/endpoints/chat.api.ts`)
3. `POST /api/ai/chat` with `{message, conversationId}` sent to api-gateway (`ai-platform-fe/libs/api/src/endpoints/chat.api.ts`)
4. `AiController.chat()` in api-gateway creates/resolves `conversationId`, publishes to Kafka topic `ai.request` (`ai-platform/apps/api-gateway/src/ai/ai.controller.ts`)
5. `AiModule.onModuleInit` Kafka consumer in ai-service receives `ai.request` message (`ai-platform/apps/ai-service/src/ai/ai.module.ts`)
6. `AiService.processMessage()` determines if query is capability-type or standard RAG (`ai-platform/apps/ai-service/src/ai/ai.service.ts`)
7. RAG flow: `SearchService.similaritySearch()` generates embedding via Ollama, runs pgvector cosine similarity query (`ai-platform/apps/ai-service/src/search/search.service.ts`)
8. System prompt built from context chunks; conversation history loaded from DB
9. `AiProviderFactory.getProvider()` returns `ClaudeProvider` or `OllamaProvider` based on `AI_PROVIDER` env (`ai-platform/apps/ai-service/src/ai/providers/ai-provider.factory.ts`)
10. LLM streams tokens; each status update and chunk published to Kafka `ai.response` topic
11. api-gateway `AiController.stream()` SSE handler is subscribed to `ai.response` via `KafkaConsumerService`; forwards filtered events to browser SSE connection (`ai-platform/apps/api-gateway/src/ai/ai.controller.ts`)
12. `useStreamConnection.onmessage` in browser receives `status`, `chunk`, `complete`, `error` events; `useChat` updates message state progressively

### Document Upload

1. User uploads `.txt` or `.md` file from FE docs interface
2. `POST /api/documents/upload` to api-gateway (authenticated by `JwtAuthGuard`)
3. `DocumentsController.proxyUploadDocument()` in api-gateway re-posts file to ai-service HTTP endpoint (`ai-platform/apps/api-gateway/src/documents/documents.controller.ts`)
4. `DocumentController.uploadDocument()` in ai-service writes temp file, calls `DocumentService.uploadDocument()` (`ai-platform/apps/ai-service/src/document/document.controller.ts`)
5. If document type is `DOCUMENTATION`, `KnowledgeService.generateDocNotes()` and `refreshGuideSummary()` called async

### Authentication Flow

1. User submits login form → `POST /api/auth/login` to api-gateway
2. `AuthController.proxyToAuthService()` in api-gateway forwards full request to auth-service (`ai-platform/apps/api-gateway/src/auth/auth.controller.ts`)
3. auth-service `AuthService.login()` validates credentials, generates JWT access (15 min) + refresh (7 days) tokens, stores refresh token in DB (`ai-platform/apps/auth-service/src/auth/auth.service.ts`)
4. auth-service sets `accessToken` and `refreshToken` httpOnly cookies on response
5. api-gateway forwards the full response (including Set-Cookie headers) back to browser
6. Subsequent requests carry `accessToken` cookie; `JwtAuthGuard` in api-gateway verifies it in-process (no round-trip to auth-service)

**State Management (Frontend):**
- Server state: TanStack Query via `@libs/store` conversation hooks (`ai-platform-fe/libs/store/src/conversation-hooks.ts`)
- Active conversation: module-level singleton + `useSyncExternalStore` + localStorage persistence (`ai-platform-fe/libs/store/src/active-conversation-store.ts`)
- In-flight stream state: `useRef` (inFlightRef) + component `useState` inside `useChat`

## Key Abstractions

**IAIProvider:**
- Purpose: Common interface for LLM providers; `chat(message)` returns `Observable<string>` (streaming tokens)
- Examples: `ai-platform/apps/ai-service/src/ai/providers/claude.provider.ts`, `ai-platform/apps/ai-service/src/ai/providers/ollama.provider.ts`
- Pattern: Factory (`AiProviderFactory`) selects implementation at runtime from `AI_PROVIDER` env var

**AiResponsePayload:**
- Purpose: Typed Kafka message payload for streaming AI responses; carries `event` type (`status`/`chunk`/`complete`/`error`), `stage`, `result`, `conversationId`, `userId`
- Definition: `ai-platform/libs/shared/src/lib/types/ai.types.ts`
- Used by: ai-service (producer), api-gateway (consumer/SSE forwarder), frontend (`useStreamConnection`)

**KafkaConsumerService topic fan-out:**
- Purpose: Multiple handlers can subscribe to the same Kafka topic; `unsubscribe` used for SSE cleanup
- Location: `ai-platform/libs/kafka/src/lib/kafka-consumer.service.ts`
- Pattern: `Map<topic, Set<handler>>` with dynamic topic re-subscription

**NestJS Feature Module pattern:**
- Every feature is a self-contained module: `<feature>.module.ts` + `<feature>.controller.ts` + `<feature>.service.ts` + `dto/`
- Examples: `ai-platform/apps/api-gateway/src/conversations/`, `ai-platform/apps/auth-service/src/auth/`

## Entry Points

**API Gateway HTTP server:**
- Location: `ai-platform/apps/api-gateway/src/main.ts`
- Triggers: `nx serve api-gateway` or `npm start`
- Responsibilities: Starts NestJS HTTP server on `API_GATEWAY_PORT` (default 4000), sets global prefix `/api`, enables CORS, applies ValidationPipe, cookie-parser

**AI Service (dual bootstrap):**
- Location: `ai-platform/apps/ai-service/src/main.ts`
- Triggers: `nx serve ai-service` or `npm start`
- Responsibilities: Starts both HTTP server (port `AI_SERVICE_PORT` default 4001) for document upload endpoint AND Kafka microservice consumer simultaneously via `Promise.all`

**Auth Service HTTP server:**
- Location: `ai-platform/apps/auth-service/src/main.ts`
- Triggers: `nx serve auth-service` or `npm start`
- Responsibilities: Starts NestJS on `AUTH_SERVICE_PORT` (default 4002), configures Passport, sets cookies

**Shell (FE host):**
- Location: `ai-platform-fe/apps/shell/src/main.tsx` + `bootstrap.tsx`
- Triggers: Webpack Module Federation host bundle served in browser
- Responsibilities: Mounts `QueryClientProvider`, `RouterProvider`; TanStack Router lazy-loads `auth/Module` and `chat/Module` remotes

## Architectural Constraints

- **Threading:** Node.js single-threaded event loop for all three backend services. Long-running LLM responses are handled via RxJS Observables streaming chunks — they do not block the event loop, but the KafkaConsumerService processes messages sequentially per topic.
- **Global state:** `activeConversationId` module-level singleton in `ai-platform-fe/libs/store/src/active-conversation-store.ts` — shared across all components that import the hook.
- **Kafka session timeout:** Set to 5 minutes (`SESSION_TIMEOUT_MS`) to accommodate slow local LLM models; a shorter timeout would cause consumer group rebalances during long AI responses (`ai-platform/libs/kafka/src/lib/kafka-consumer.service.ts`).
- **Auth proxy pattern:** api-gateway does NOT validate auth internally for `/api/auth/*` routes — it blind-proxies to auth-service. JWT validation for AI/conversations routes is done in-process via `JwtAuthGuard` in api-gateway only (no auth-service round-trip for protected routes).
- **Conversation creation split:** The api-gateway `AiController` creates conversations in Prisma directly (not through ai-service); ai-service also has a `ConversationService` that creates conversations if `conversationId` is absent from the Kafka payload. Both services share the same Prisma database.

## Anti-Patterns

### Duplicate conversation creation logic

**What happens:** `AiController` in api-gateway creates conversations directly via Prisma (`ai-platform/apps/api-gateway/src/ai/ai.controller.ts` line 33–36), AND `AiModule` in ai-service has a fallback to create conversations if `conversationId` is absent from Kafka payload (`ai-platform/apps/ai-service/src/ai/ai.module.ts` line 44–48).
**Why it's wrong:** Two separate services writing to the same `conversations` table with different code paths creates inconsistency risk and makes it hard to reason about who owns conversation creation.
**Do this instead:** api-gateway should always create the conversation before publishing to Kafka (already done when `dto.conversationId` is absent); ai-service fallback should only be a safety net with a clear warning.

### `DocumentsController` in api-gateway using `fetch` + `Logger` instead of `HttpService` + `LoggerService`

**What happens:** `ai-platform/apps/api-gateway/src/documents/documents.controller.ts` uses native `fetch` and `new Logger()` directly instead of the injected `HttpService` and `LoggerService` used everywhere else.
**Why it's wrong:** Inconsistent with the HTTP proxy approach used for auth, and bypasses the structured pino logger used by all other controllers.
**Do this instead:** Inject `HttpService` (already imported via `@nestjs/axios` in the project) and `LoggerService` from `@ai-platform/shared`.

### SSE user-ID filtering in api-gateway

**What happens:** `AiController.stream()` subscribes to the `ai.response` Kafka topic for every connected SSE client and filters messages in-process by `userId` and `conversationId` (`ai-platform/apps/api-gateway/src/ai/ai.controller.ts` line 70–78).
**Why it's wrong:** Every SSE connection adds a handler to the shared Kafka consumer. Under load, all handlers receive all messages and must filter independently, causing unnecessary processing.
**Do this instead:** Partition Kafka by `userId`, or use a dedicated pub/sub layer (Redis pub/sub) keyed by `conversationId` for SSE fan-out.

## Error Handling

**Strategy:** Exceptions thrown in NestJS controllers are caught by NestJS's built-in exception filter and converted to HTTP error responses. Observable errors in the AI streaming pipeline are published as `event: 'error'` Kafka messages and forwarded to the browser via SSE.

**Patterns:**
- NestJS built-in exceptions (`BadRequestException`, `UnauthorizedException`, `NotFoundException`, `ConflictException`) used throughout controllers and services
- Kafka message handler errors in `KafkaConsumerService` cause the offending handler to be removed from the set and processing continues (`ai-platform/libs/kafka/src/lib/kafka-consumer.service.ts` line 103)
- Frontend `useChat` shows inline system error messages on send/receive failure; never rethrows

## Cross-Cutting Concerns

**Logging:** pino via `nestjs-pino`; `LoggerService` from `@ai-platform/shared` injected into all services. Structured JSON logs with context string (class name) as third argument: `this.logger.log('message', ClassName, { metadata })`.
**Validation:** `class-validator` + `class-transformer` DTOs; `ValidationPipe({ whitelist: true, transform: true })` applied globally in all three services.
**Authentication:** JWT cookies (`accessToken` 15 min, `refreshToken` 7 days, httpOnly, SameSite=strict). `JwtAuthGuard` in api-gateway verifies `accessToken` cookie in-process. Refresh token rotation: old token deleted on use, new pair issued.

---

*Architecture analysis: 2026-05-20*
