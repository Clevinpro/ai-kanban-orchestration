<!-- GSD:project-start source:PROJECT.md -->
## Project

**AI Agent Dev Workflow**

A Claude Code multi-agent development automation system built on top of an existing Nx monorepo (`ai-platform` BE + `ai-platform-fe` FE). A TeamLead agent reads a SPEC.md (epic/feature), breaks it into task files, then an automated pipeline (Developer → CodeReview → QA → TeamLeadCheck → Done) executes each task. Progress is tracked in a local Kanban web UI.

**Core Value:** Automated development lifecycle per task: one command triggers the full dev→review→test→approve chain, with a human-readable Kanban board showing real-time progress.

### Constraints

- **Tech stack**: Nx monorepo — agents must respect workspace structure
- **Isolation**: FE agents operate only on `ai-platform-fe/`, BE agents only on `ai-platform/`
- **Local-only**: Kanban UI runs locally, no cloud hosting required
- **Claude Code runtime**: Agents are Claude Code slash commands / CLAUDE.md agent definitions
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript ~5.9.2 (backend) / ~5.7.2 (frontend) - All source code in both `ai-platform/` and `ai-platform-fe/`
- JavaScript - Config files, Nx hooks (`*.config.js`, `.claude/hooks/`)
## Runtime
- Node.js v22 (`.nvmrc` in backend specifies `22`; `.node-version` in frontend specifies `20`)
- `@types/node` 20.19.9 pinned in both workspaces
- npm (lockfile: `package-lock.json` present in root, `ai-platform/`, and `ai-platform-fe/`)
## Frameworks
### Backend (`ai-platform/`)
- NestJS ^11.0.0 - HTTP server framework, DI container, microservice transport
- `@nestjs/microservices` ^11.0.0 - Kafka microservice transport layer
- `@nestjs/platform-express` ^11.0.0 - Express HTTP adapter
- `@nestjs/passport` ^11.0.5 - Auth strategy integration
- `@nestjs/jwt` ^11.0.2 - JWT signing and verification
- `@nestjs/config` ^4.0.4 - Environment config via `ConfigService`
- `@nestjs/axios` ^4.0.1 - HTTP client module (used for Ollama)
- `rxjs` ^7.8.2 - Observable streams for AI response streaming
- Prisma ^7.8.0 - ORM; schema at `ai-platform/libs/database/prisma/schema.prisma`
- `@prisma/adapter-pg` ^7.8.0 - PostgreSQL adapter
- `@prisma/client` ^7.8.0 - Generated type-safe client
- `passport-google-oauth20` ^2.0.0 - Google OAuth2 strategy
- `passport-jwt` ^4.0.1 - JWT passport strategy
- `bcrypt` ^6.0.0 - Password hashing
- `kafkajs` ^2.2.4 - Kafka producer/consumer (wrapped in `@ai-platform/kafka` lib)
- `@anthropic-ai/sdk` ^0.92.0 - Anthropic Claude API client (streaming via `messages.stream`)
- `nestjs-pino` ^4.6.1 + `pino` ^10.3.1 + `pino-pretty` ^13.1.3 - Structured logging
- `class-transformer` ^0.5.1 + `class-validator` ^0.15.1 - DTO validation via `ValidationPipe`
- `axios` ^1.15.2 - HTTP client for Ollama REST API calls
- `cookie-parser` ^1.4.7 - Cookie parsing middleware
- Jest ^30.0.2 - Test runner
- `@nestjs/testing` ^11.0.0 - NestJS test utilities
- `ts-jest` ^29.4.0 - TypeScript Jest transformer
- `jest-environment-node` ^30.0.2 - Node test environment
- Nx 22.7.0 - Monorepo task runner and build system
- Webpack (via `@nx/webpack` 22.7.0) - App bundler
- SWC (`@swc/core` ~1.15.5, `@swc-node/register` ~1.11.1) - Fast TypeScript compilation
### Frontend (`ai-platform-fe/`)
- React ^19.2.5 - UI library
- React DOM ^19.2.5 - DOM renderer
- `@tanstack/react-router` ^1.169.1 - Type-safe file-based router (used in shell and micro-frontends)
- `react-router-dom` 6.30.3 - Also present as dependency
- `@tanstack/react-query` ^5.100.9 - Server state management and caching
- `@tanstack/react-query-devtools` ^5.100.9 - Dev tools
- `@tanstack/react-form` ^1.29.1 - Form state management
- `@tanstack/zod-form-adapter` ^0.42.1 - Zod adapter for TanStack Form
- `zod` ^3.25.76 - Schema validation
- `antd` ^6.3.7 - Ant Design component library
- `@ant-design/icons` ^6.2.2 - Icon set
- `axios` ^1.16.0 - HTTP client; configured in `ai-platform-fe/libs/api/src/client.ts`
- `@module-federation/enhanced` 2.4.0 - Runtime module federation
- `@nx/module-federation` ^22.7.1 - Nx MF integration
- Vitest ^3.2.4 - Unit/component test runner
- `@testing-library/react` ^16.3.2 - Component testing utilities
- `@testing-library/jest-dom` ^6.9.1 - DOM matchers
- Playwright ^1.59.1 - E2E testing (config at `ai-platform-fe/playwright.config.ts`)
- Storybook 10.3.6 - Component documentation and visual testing
- Nx 22.7.1 - Monorepo task runner
- Rspack 1.6.8 (`@rspack/core`, `@rspack/cli`) - Webpack-compatible bundler (per-app config: `rspack.config.ts`)
- Rsbuild ^1.7.5 - Build tool for `ui` lib Storybook (`ai-platform-fe/libs/ui/rsbuild.config.ts`)
- SWC (`@swc/core` ~1.15.5) - TypeScript transpiler
## Key Dependencies
- `@anthropic-ai/sdk` ^0.92.0 - Powers Claude LLM provider; env vars `CLAUDE_API_KEY` / `ANTHROPIC_API_KEY`
- `kafkajs` ^2.2.4 - Message bus between api-gateway and ai-service; brokers via `KAFKA_BROKERS` env
- `@prisma/client` ^7.8.0 - All database access; schema at `ai-platform/libs/database/prisma/schema.prisma`
- `pgvector/pgvector:pg16` - PostgreSQL with vector extension; required for RAG similarity search (`Chunk.embedding` field `vector(768)`)
- `pg` ^8.20.0 - Raw PostgreSQL driver used alongside Prisma adapter
- `rxjs` ^7.8.2 - Observable streaming pipeline for AI responses
## Configuration
- Backend env template: `ai-platform/.env.example`
- Frontend env template: `ai-platform-fe/.env.example`
- Backend loaded via `@nestjs/config` (`ConfigModule.forRoot({ isGlobal: true })`)
- Frontend env variables must be prefixed `NX_PUBLIC_` to be inlined into browser bundle by Rspack
- `NODE_ENV`, `LOG_LEVEL` - Runtime behavior
- `API_GATEWAY_PORT` (4000), `AI_SERVICE_PORT` (4001), `AUTH_SERVICE_PORT` (4002) - Service ports
- `DATABASE_URL` - PostgreSQL connection string
- `KAFKA_BROKERS`, `KAFKA_CLIENT_ID`, `KAFKA_GROUP_ID` - Kafka connection
- `AI_PROVIDER` (`claude` | `ollama`) - LLM provider selector
- `ANTHROPIC_API_KEY` / `CLAUDE_API_KEY`, `CLAUDE_MODEL` - Claude config
- `OLLAMA_URL`, `OLLAMA_EMBEDDING_MODEL`, `OLLAMA_MODEL` - Ollama config
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` - JWT signing secrets
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` - OAuth
- `FRONTEND_PORT`, `FRONTEND_URL`, `CLIENT_URL` - CORS origins
- `NX_PUBLIC_API_URL` - API gateway base URL (default: `http://localhost:4000/api`)
- Backend: `ai-platform/nx.json` (Nx plugins: webpack, eslint, jest)
- Frontend: `ai-platform-fe/nx.json`
- Root workspace: `/nx.json` (top-level Nx config)
- TypeScript paths: `ai-platform/tsconfig.base.json` — `@ai-platform/shared`, `@ai-platform/kafka`, `@ai-platform/database`
- Prisma schema config: `ai-platform/prisma.config.ts`
## Code Quality
- ESLint ^9.x with TypeScript ESLint ^8.40.0 (`typescript-eslint`)
- `eslint-config-prettier` ^10.0.0 - Disables style rules
- Frontend adds `eslint-plugin-react` 7.35.0, `eslint-plugin-react-hooks` 5.0.0, `eslint-plugin-jsx-a11y` 6.10.1, `eslint-plugin-import` 2.31.0
- Prettier ~3.6.2 in both workspaces
- Husky ^9.1.7 - Git hooks runner
- `lint-staged` ^16.x - Pre-commit lint + format
- `@commitlint/cli` ^20.x + `@commitlint/config-conventional` - Commit message linting (types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`)
## Platform Requirements
- Node.js 22
- Docker / Docker Compose for PostgreSQL (`pgvector/pgvector:pg16`), Zookeeper, and Kafka (Confluent Platform 7.5.0)
- Ollama (optional local LLM) or Anthropic API key
- Not explicitly defined; no Dockerfiles present for application services
- Infrastructure via `ai-platform/docker-compose.yml` covers only Postgres + Kafka stack
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Backend: `kebab-case` for all files — `auth.service.ts`, `jwt-auth.guard.ts`, `kafka-producer.service.ts`
- Frontend: `PascalCase` for component files — `ChatMessage.tsx`, `LoginForm.tsx`, `AppLayout.tsx`
- Stories: `ComponentName.stories.tsx` co-located with component — `ChatMessage.stories.tsx`
- Tests: `*.spec.ts` / `*.spec.tsx` co-located with subject file
- DTOs: `<action>.dto.ts` — `login.dto.ts`, `register.dto.ts`
- Types: `<domain>.types.ts` — `auth.types.ts`, `user.types.ts`, `chat.types.ts`
- Constants: `<domain>.constants.ts` — `kafka.constants.ts`, `app.constants.ts`
- camelCase throughout — `googleLogin`, `generateTokens`, `formatMessageTime`, `notifyListeners`
- Private helpers use camelCase — `findOrCreateUser`, `storeRefreshToken`, `parseRequest`
- Hook functions prefixed with `use` — `useConversations`, `useTypewriter`, `useActiveConversation`
- camelCase — `accessToken`, `refreshToken`, `navigateMock`
- Constants in `SCREAMING_SNAKE_CASE` for module-level values — `FIFTEEN_MINUTES`, `SEVEN_DAYS`, `PASSWORD_HASH_ROUNDS`, `LOGIN_FAILED`, `ACTIVE_CONVERSATION_STORAGE_KEY`
- Enum members in `SCREAMING_SNAKE_CASE` — `KAFKA_TOPICS.AI_REQUEST`, `KAFKA_TOPICS.AI_RESPONSE`
- Prefix unused parameters and variables with `_` to satisfy ESLint — `argsIgnorePattern: '^_'`
- Backend interfaces prefixed with `I` — `IUser`, `ITokens`, `IUserPayload`, `IGoogleProfile`, `IKafkaMessage`
- Frontend interfaces prefixed with `I` for data shapes — `ILoginDto`, `IRegisterDto`, `IUser`
- Props interfaces suffixed with `Props` — `ChatMessageProps`, `LoginFormProps`, `AppLayoutProps`
- Form value types suffixed with `Values` — `LoginFormValues`, `RegisterFormValues`
- Inline types inside a file use `type` keyword — `AuthenticatedRequest`, `AiRequestPayload`, `Listener`
- PascalCase — `AuthService`, `KafkaProducerService`, `LoggerService`
- Suffixed by role: `Service`, `Controller`, `Module`, `Guard`, `Strategy`, `Dto`
## Code Style
- Tool: Prettier (both monorepos share identical config)
- Config: `ai-platform/.prettierrc`, `ai-platform-fe/.prettierrc`
- `singleQuote: true`
- `semi: true`
- `trailingComma: "all"`
- `printWidth: 100`
- Tool: TypeScript ESLint via `@nx/eslint-plugin` flat config
- Backend root config: `ai-platform/eslint.config.js`
- Frontend root config: `ai-platform-fe/eslint.config.mjs`
- Key rules enforced globally:
- Test files: `@typescript-eslint/no-empty-function` is `off`
- `strict: true` in both monorepos' `tsconfig.base.json`
- `emitDecoratorMetadata: true` and `experimentalDecorators: true` in backend (NestJS requirement)
- `consistent-type-imports` enforced — type-only imports must use `import type`
## Import Organization
- Backend: `@ai-platform/shared`, `@ai-platform/kafka`, `@ai-platform/database` — defined in `ai-platform/tsconfig.base.json`
- Frontend: `@libs/ui`, `@libs/api`, `@libs/store` — defined via Vitest resolve aliases in `ai-platform-fe/vitest.config.ts` and Rspack/Module Federation config
## Error Handling
- Throw NestJS built-in HTTP exceptions directly from services: `UnauthorizedException`, `ConflictException`, `BadRequestException`
- Never swallow errors silently — always log then throw
- Catch blocks are narrow: catch only what is expected (e.g., JWT verification errors)
- Example from `auth.service.ts`:
- Handle errors in `onError` callback of `useMutation`
- Show user-facing messages via `message.error()` (Ant Design) AND set local `formError` state for inline Alert display
- Error constants are module-level: `const LOGIN_FAILED = 'Could not sign in...'`
- Example from `login.tsx`:
## Logging
- Service: `ai-platform/libs/shared/src/lib/logger/logger.service.ts`
- Methods: `log`, `warn`, `error`, `debug`, `verbose`
- No direct `console.log` — ESLint enforces `no-console: error`
- Pass `ClassName.name` as context: `this.logger.log('...', AuthService.name)`
- Pass structured metadata as third argument: `this.logger.log('...', AuthService.name, { userId })`
- Log at start and end of significant operations: "Request received" and "Request completed"
- Warn on rejected/unauthorized operations: "Login rejected: invalid credentials"
- Frontend: no dedicated logger — avoid `console.*` (ESLint rule enforced)
## Comments
- `TODO:` prefix for known incomplete stubs or deferred work — used throughout the codebase
- Inline comments explain non-obvious decisions (e.g., `// Passport redirects to Google automatically via GoogleAuthGuard`)
- Comments explain deferred work: `// TODO: replace with JwtModule.registerAsync + ConfigService for production`
- JSDoc is not used in source code; comments are plain inline style
## Function Design
- Backend: always typed with explicit return type annotations — `async register(...): Promise<ITokens>`
- Frontend: React components return JSX; hooks return typed object shapes
- Avoid `any` — `@typescript-eslint/no-explicit-any: error` is enforced
## Module Design
- Every feature has `<feature>.module.ts`, `<feature>.service.ts`, `<feature>.controller.ts`
- `app.module.ts` imports all feature modules
- Libs expose a module class and an `index.ts` barrel
- Each lib exports from a single `src/index.ts` — named exports + type-only re-exports
- Both values and types are exported separately: `export { ChatMessage }` + `export type { ChatMessageProps }`
- Example: `ai-platform-fe/libs/ui/src/index.ts`
- `@commitlint/config-conventional` enforced with husky pre-commit hooks in both monorepos
- Allowed types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`
- Scope is required (warning level)
- Subject must not be empty and must not end with `.`
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## System Overview
```text
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
- API Gateway acts as the only public-facing NestJS service; downstream services are never called directly by the browser
- AI request/response cycle is fully asynchronous: HTTP POST queues a Kafka message, a Server-Sent Events endpoint streams the response back to the browser as the AI service publishes chunks to `ai.response`
- Frontend uses Webpack Module Federation: the `shell` app is the host and lazily loads `auth` and `chat` micro-frontends at runtime
- RAG (Retrieval-Augmented Generation) pipeline: user query → embedding (Ollama) → cosine similarity search against pgvector chunks → context injected into LLM prompt
- AI provider is swappable at startup via `AI_PROVIDER` env var: `ollama` (default) or `claude`
## Layers
- Purpose: Cross-app utilities shared across all MFE remotes
- Location: `ai-platform-fe/libs/`
- Contains: API client + endpoint functions (`@libs/api`), TanStack Query hooks (`@libs/store`), UI components (`@libs/ui`)
- Depends on: axios, @tanstack/react-query, Ant Design
- Used by: all FE apps (auth, chat, shell, docs)
- Purpose: Route-level pages and feature hooks
- Location: `ai-platform-fe/apps/`
- Contains: `shell` (host + router), `auth` (login/register routes), `chat` (chat page + hooks), `docs` (placeholder)
- Depends on: `@libs/api`, `@libs/store`, `@libs/ui`
- Used by: end users via browser
- Purpose: Edge gateway — authenticates requests (JWT cookie), routes to backend services
- Location: `ai-platform/apps/api-gateway/src/`
- Contains: controllers for auth (proxy), ai (Kafka), conversations (Prisma direct), documents (HTTP proxy), health
- Depends on: `@ai-platform/database`, `@ai-platform/kafka`, `@ai-platform/shared`
- Used by: frontend (all HTTP/SSE requests)
- Purpose: Identity and session management
- Location: `ai-platform/apps/auth-service/src/`
- Contains: AuthController, AuthService, JWT/Google Passport strategies, DTOs
- Depends on: `@ai-platform/database`, `@ai-platform/shared`
- Used by: api-gateway (HTTP proxy)
- Purpose: AI processing — document ingestion, RAG search, LLM orchestration
- Location: `ai-platform/apps/ai-service/src/`
- Contains: AiModule (Kafka consumer), AiService (RAG pipeline), provider factory, SearchService, EmbeddingsService, DocumentService, KnowledgeService, ConversationService
- Depends on: `@ai-platform/database`, `@ai-platform/kafka`, `@ai-platform/shared`
- Used by: api-gateway (Kafka, HTTP for doc uploads)
- Purpose: Common NestJS modules injected into all services
- Location: `ai-platform/libs/`
- Contains: `@ai-platform/database` (PrismaService), `@ai-platform/kafka` (producer/consumer), `@ai-platform/shared` (logger, types, constants)
- Depends on: Prisma, kafkajs, nestjs-pino, pino
- Used by: all backend services
## Data Flow
### AI Chat Request (Async Kafka + SSE)
### Document Upload
### Authentication Flow
- Server state: TanStack Query via `@libs/store` conversation hooks (`ai-platform-fe/libs/store/src/conversation-hooks.ts`)
- Active conversation: module-level singleton + `useSyncExternalStore` + localStorage persistence (`ai-platform-fe/libs/store/src/active-conversation-store.ts`)
- In-flight stream state: `useRef` (inFlightRef) + component `useState` inside `useChat`
## Key Abstractions
- Purpose: Common interface for LLM providers; `chat(message)` returns `Observable<string>` (streaming tokens)
- Examples: `ai-platform/apps/ai-service/src/ai/providers/claude.provider.ts`, `ai-platform/apps/ai-service/src/ai/providers/ollama.provider.ts`
- Pattern: Factory (`AiProviderFactory`) selects implementation at runtime from `AI_PROVIDER` env var
- Purpose: Typed Kafka message payload for streaming AI responses; carries `event` type (`status`/`chunk`/`complete`/`error`), `stage`, `result`, `conversationId`, `userId`
- Definition: `ai-platform/libs/shared/src/lib/types/ai.types.ts`
- Used by: ai-service (producer), api-gateway (consumer/SSE forwarder), frontend (`useStreamConnection`)
- Purpose: Multiple handlers can subscribe to the same Kafka topic; `unsubscribe` used for SSE cleanup
- Location: `ai-platform/libs/kafka/src/lib/kafka-consumer.service.ts`
- Pattern: `Map<topic, Set<handler>>` with dynamic topic re-subscription
- Every feature is a self-contained module: `<feature>.module.ts` + `<feature>.controller.ts` + `<feature>.service.ts` + `dto/`
- Examples: `ai-platform/apps/api-gateway/src/conversations/`, `ai-platform/apps/auth-service/src/auth/`
## Entry Points
- Location: `ai-platform/apps/api-gateway/src/main.ts`
- Triggers: `nx serve api-gateway` or `npm start`
- Responsibilities: Starts NestJS HTTP server on `API_GATEWAY_PORT` (default 4000), sets global prefix `/api`, enables CORS, applies ValidationPipe, cookie-parser
- Location: `ai-platform/apps/ai-service/src/main.ts`
- Triggers: `nx serve ai-service` or `npm start`
- Responsibilities: Starts both HTTP server (port `AI_SERVICE_PORT` default 4001) for document upload endpoint AND Kafka microservice consumer simultaneously via `Promise.all`
- Location: `ai-platform/apps/auth-service/src/main.ts`
- Triggers: `nx serve auth-service` or `npm start`
- Responsibilities: Starts NestJS on `AUTH_SERVICE_PORT` (default 4002), configures Passport, sets cookies
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
### `DocumentsController` in api-gateway using `fetch` + `Logger` instead of `HttpService` + `LoggerService`
### SSE user-ID filtering in api-gateway
## Error Handling
- NestJS built-in exceptions (`BadRequestException`, `UnauthorizedException`, `NotFoundException`, `ConflictException`) used throughout controllers and services
- Kafka message handler errors in `KafkaConsumerService` cause the offending handler to be removed from the set and processing continues (`ai-platform/libs/kafka/src/lib/kafka-consumer.service.ts` line 103)
- Frontend `useChat` shows inline system error messages on send/receive failure; never rethrows
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
