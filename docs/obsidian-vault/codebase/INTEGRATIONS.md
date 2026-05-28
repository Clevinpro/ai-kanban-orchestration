# External Integrations

**Analysis Date:** 2026-05-20

## APIs & External Services

**AI / LLM Providers (pluggable via `AI_PROVIDER` env var):**

- **Anthropic Claude** — Streaming LLM chat responses
  - SDK/Client: `@anthropic-ai/sdk` ^0.92.0
  - Implementation: `ai-platform/apps/ai-service/src/ai/providers/claude.provider.ts`
  - Auth: `CLAUDE_API_KEY` or `ANTHROPIC_API_KEY` env var (CLAUDE_API_KEY takes precedence)
  - Model: `CLAUDE_MODEL` env var (default: `claude-sonnet-4-6`)
  - Max tokens: 4096 per request; uses `messages.stream()` for streaming

- **Ollama** — Local/self-hosted LLM (default provider)
  - SDK/Client: `axios` HTTP calls to Ollama REST API
  - Implementation: `ai-platform/apps/ai-service/src/ai/providers/ollama.provider.ts`
  - Auth: None (local service)
  - Config: `OLLAMA_URL` env var (default: `http://localhost:11434`)
  - Model: `OLLAMA_MODEL` / `OLLAMA_CHAT_MODEL` env var; auto-selects from `/api/ps` then `/api/tags` if not set

- **Ollama Embeddings** — Vector embeddings for RAG
  - Implementation: `ai-platform/apps/ai-service/src/embeddings/embeddings.service.ts`
  - Endpoint: `POST {OLLAMA_URL}/api/embeddings`
  - Model: `OLLAMA_EMBEDDING_MODEL` env var (default: `nomic-embed-text`, 768 dimensions)
  - Required: dimensions must match Prisma schema `vector(768)` in `Chunk` model

**Provider Selection Pattern:**
- Factory: `ai-platform/apps/ai-service/src/ai/providers/ai-provider.factory.ts`
- `AI_PROVIDER=claude` → `ClaudeProvider`; `AI_PROVIDER=ollama` → `OllamaProvider`

## Data Storage

**Databases:**
- **PostgreSQL 16 with pgvector extension**
  - Docker image: `pgvector/pgvector:pg16`
  - Connection: `DATABASE_URL` env var (e.g. `postgresql://postgres:postgres@localhost:5432/ai_platform?schema=public`)
  - Client: Prisma ORM via `@prisma/client` + `@prisma/adapter-pg`
  - PrismaService: `ai-platform/libs/database/src/lib/prisma.service.ts`
  - Schema: `ai-platform/libs/database/prisma/schema.prisma`
  - Raw SQL used for: vector similarity search (`<=>` cosine operator), capability query (`$queryRaw`)
  - Models: `User`, `RefreshToken`, `Document`, `Chunk` (vector embedding), `Conversation`, `Message`
  - Migrations: managed by Prisma (`npm run db:migrate`)

**File Storage:**
- Documents are stored as text in the PostgreSQL `documents` table; file path recorded in `Document.filePath`
- No external object storage (S3, GCS) detected

**Caching:**
- No dedicated cache layer (Redis, Memcached) detected
- TanStack Query on frontend uses in-memory cache with `staleTime: 5 minutes` (configured in `ai-platform-fe/libs/store/src/query-client.ts`)

## Authentication & Identity

**Auth Provider: Custom (self-hosted)**
- Implementation: `ai-platform/apps/auth-service/`
- Strategy: Dual auth — email/password + Google OAuth2
- Tokens: JWT access token (15m) + JWT refresh token (7d), both stored as `httpOnly` cookies
- Refresh rotation: old refresh token deleted and new pair issued on every refresh
- Password hashing: `bcrypt` with 10 rounds

**JWT:**
- Access token secret: `JWT_ACCESS_SECRET` env var
- Refresh token secret: `JWT_REFRESH_SECRET` env var
- Signing: `@nestjs/jwt` with `jwtService.signAsync()`
- Verification in API gateway: `ai-platform/apps/api-gateway/src/auth/auth.guard.ts` (JwtAuthGuard)
- Verification in auth service: `ai-platform/apps/auth-service/src/auth/strategies/jwt.strategy.ts`

**Google OAuth2:**
- Library: `passport-google-oauth20` ^2.0.0
- Strategy: `ai-platform/apps/auth-service/src/auth/strategies/google.strategy.ts`
- Required env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- Flow: `GET /api/auth/google` → Google → `GET /api/auth/google/callback` → redirect to `CLIENT_URL`
- Frontend OAuth start URL helper: `ai-platform-fe/libs/api/src/client.ts` → `getGoogleOAuthStartURL()`

## Messaging / Event Bus

**Apache Kafka:**
- Library: `kafkajs` ^2.2.4
- Docker image: `confluentinc/cp-kafka:7.5.0` + Zookeeper `confluentinc/cp-zookeeper:7.5.0`
- Broker config: `KAFKA_BROKER` / `KAFKA_BROKERS` env var (default: `localhost:9092`)
- Producer: `ai-platform/libs/kafka/src/lib/kafka-producer.service.ts` — publishes `AI_REQUEST` topic
- Consumer: `ai-platform/libs/kafka/src/lib/kafka-consumer.service.ts` — subscribes to `AI_RESPONSE` topic
- Topics defined in: `@ai-platform/shared` (`KAFKA_TOPICS` constants)
- Flow: `api-gateway` publishes AI chat request → `ai-service` Kafka consumer processes → `ai-service` publishes response → `api-gateway` SSE stream to browser

**NestJS Microservice Transport:**
- `ai-platform/apps/ai-service/src/main.ts` registers a Kafka microservice consumer with `Transport.KAFKA`
- Client ID: `KAFKA_CLIENT_ID` env var (default: `ai-service`)
- Consumer group: `KAFKA_GROUP_ID` env var (default: `ai-service`)

## Real-Time Communication

**Server-Sent Events (SSE):**
- Backend: `@Sse('chat/stream')` endpoint in `ai-platform/apps/api-gateway/src/ai/ai.controller.ts`
- Frontend: native browser `EventSource` via `ai-platform-fe/libs/api/src/endpoints/chat.api.ts` → `streamMessage()`
- Connection hook: `ai-platform-fe/apps/chat/src/hooks/useStreamConnection.ts`
- Idle timeout: 45 seconds; auto-reconnects on timeout
- SSE stream URL: `GET /api/ai/chat/stream?conversationId=<id>`
- Event types: `status`, `chunk`, `complete`, `error`

## Monitoring & Observability

**Error Tracking:**
- Not detected (no Sentry, Datadog, etc.)

**Logs:**
- Backend: structured JSON logging via `pino` + `nestjs-pino` (configured in `@ai-platform/shared` `LoggerModule`)
- Pretty-printed in development via `pino-pretty`
- Log level: `LOG_LEVEL` env var (default: `debug`)

## CI/CD & Deployment

**Hosting:**
- Not defined; no deployment manifests (Kubernetes, Terraform, etc.) or CI workflow files detected

**CI Pipeline:**
- Not detected (no `.github/workflows/`, `.gitlab-ci.yml`, etc.)

**Docker Compose (local dev infrastructure only):**
- File: `ai-platform/docker-compose.yml`
- Services: `postgres` (pgvector/pg16), `zookeeper`, `kafka`
- Application services (NestJS apps) run directly via Node, NOT containerized

## Webhooks & Callbacks

**Incoming:**
- Google OAuth2 callback: `GET /api/auth/google/callback` (auth-service) — receives Google's OAuth redirect

**Outgoing:**
- None detected

## Frontend API Client

**Base URL Configuration:**
- File: `ai-platform-fe/libs/api/src/client.ts`
- Default base URL: `http://localhost:4000/api`
- Override: `NX_PUBLIC_API_URL` env var (frontend) or `API_URL` import.meta.env

**Interceptors:**
- Request: sets `Content-Type: application/json` when data is not FormData
- Response: redirects to `/auth` on 401 (except when already on auth path)
- `withCredentials: true` - sends cookies on all requests

## Environment Configuration

**Required Backend Env Vars (from `ai-platform/.env.example`):**
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` - JWT signing
- `AI_PROVIDER` - `claude` or `ollama`
- `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY` - required when `AI_PROVIDER=claude`
- `KAFKA_BROKER` - Kafka broker address
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` - required for Google OAuth

**Required Frontend Env Vars (from `ai-platform-fe/.env.example`):**
- `NX_PUBLIC_API_URL` - Full API gateway URL including `/api` prefix

**Secrets location:**
- `.env` files in `ai-platform/` and `ai-platform-fe/` (not committed)
- `.env.example` files define all required variables

---

*Integration audit: 2026-05-20*
