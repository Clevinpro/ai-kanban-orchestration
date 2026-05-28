# Technology Stack

**Analysis Date:** 2026-05-20

## Languages

**Primary:**
- TypeScript ~5.9.2 (backend) / ~5.7.2 (frontend) - All source code in both `ai-platform/` and `ai-platform-fe/`

**Secondary:**
- JavaScript - Config files, Nx hooks (`*.config.js`, `.claude/hooks/`)

## Runtime

**Environment:**
- Node.js v22 (`.nvmrc` in backend specifies `22`; `.node-version` in frontend specifies `20`)
- `@types/node` 20.19.9 pinned in both workspaces

**Package Manager:**
- npm (lockfile: `package-lock.json` present in root, `ai-platform/`, and `ai-platform-fe/`)

## Frameworks

### Backend (`ai-platform/`)

**Core:**
- NestJS ^11.0.0 - HTTP server framework, DI container, microservice transport
- `@nestjs/microservices` ^11.0.0 - Kafka microservice transport layer
- `@nestjs/platform-express` ^11.0.0 - Express HTTP adapter
- `@nestjs/passport` ^11.0.5 - Auth strategy integration
- `@nestjs/jwt` ^11.0.2 - JWT signing and verification
- `@nestjs/config` ^4.0.4 - Environment config via `ConfigService`
- `@nestjs/axios` ^4.0.1 - HTTP client module (used for Ollama)
- `rxjs` ^7.8.2 - Observable streams for AI response streaming

**ORM/Database:**
- Prisma ^7.8.0 - ORM; schema at `ai-platform/libs/database/prisma/schema.prisma`
- `@prisma/adapter-pg` ^7.8.0 - PostgreSQL adapter
- `@prisma/client` ^7.8.0 - Generated type-safe client

**Authentication:**
- `passport-google-oauth20` ^2.0.0 - Google OAuth2 strategy
- `passport-jwt` ^4.0.1 - JWT passport strategy
- `bcrypt` ^6.0.0 - Password hashing

**Messaging:**
- `kafkajs` ^2.2.4 - Kafka producer/consumer (wrapped in `@ai-platform/kafka` lib)

**AI SDKs:**
- `@anthropic-ai/sdk` ^0.92.0 - Anthropic Claude API client (streaming via `messages.stream`)

**Logging:**
- `nestjs-pino` ^4.6.1 + `pino` ^10.3.1 + `pino-pretty` ^13.1.3 - Structured logging

**Validation:**
- `class-transformer` ^0.5.1 + `class-validator` ^0.15.1 - DTO validation via `ValidationPipe`

**HTTP:**
- `axios` ^1.15.2 - HTTP client for Ollama REST API calls
- `cookie-parser` ^1.4.7 - Cookie parsing middleware

**Testing (Backend):**
- Jest ^30.0.2 - Test runner
- `@nestjs/testing` ^11.0.0 - NestJS test utilities
- `ts-jest` ^29.4.0 - TypeScript Jest transformer
- `jest-environment-node` ^30.0.2 - Node test environment

**Build (Backend):**
- Nx 22.7.0 - Monorepo task runner and build system
- Webpack (via `@nx/webpack` 22.7.0) - App bundler
- SWC (`@swc/core` ~1.15.5, `@swc-node/register` ~1.11.1) - Fast TypeScript compilation

### Frontend (`ai-platform-fe/`)

**Core Framework:**
- React ^19.2.5 - UI library
- React DOM ^19.2.5 - DOM renderer

**Routing:**
- `@tanstack/react-router` ^1.169.1 - Type-safe file-based router (used in shell and micro-frontends)
- `react-router-dom` 6.30.3 - Also present as dependency

**State / Data Fetching:**
- `@tanstack/react-query` ^5.100.9 - Server state management and caching
- `@tanstack/react-query-devtools` ^5.100.9 - Dev tools

**Forms / Validation:**
- `@tanstack/react-form` ^1.29.1 - Form state management
- `@tanstack/zod-form-adapter` ^0.42.1 - Zod adapter for TanStack Form
- `zod` ^3.25.76 - Schema validation

**UI Components:**
- `antd` ^6.3.7 - Ant Design component library
- `@ant-design/icons` ^6.2.2 - Icon set

**HTTP:**
- `axios` ^1.16.0 - HTTP client; configured in `ai-platform-fe/libs/api/src/client.ts`

**Module Federation:**
- `@module-federation/enhanced` 2.4.0 - Runtime module federation
- `@nx/module-federation` ^22.7.1 - Nx MF integration

**Testing (Frontend):**
- Vitest ^3.2.4 - Unit/component test runner
- `@testing-library/react` ^16.3.2 - Component testing utilities
- `@testing-library/jest-dom` ^6.9.1 - DOM matchers
- Playwright ^1.59.1 - E2E testing (config at `ai-platform-fe/playwright.config.ts`)
- Storybook 10.3.6 - Component documentation and visual testing

**Build (Frontend):**
- Nx 22.7.1 - Monorepo task runner
- Rspack 1.6.8 (`@rspack/core`, `@rspack/cli`) - Webpack-compatible bundler (per-app config: `rspack.config.ts`)
- Rsbuild ^1.7.5 - Build tool for `ui` lib Storybook (`ai-platform-fe/libs/ui/rsbuild.config.ts`)
- SWC (`@swc/core` ~1.15.5) - TypeScript transpiler

## Key Dependencies

**Critical:**
- `@anthropic-ai/sdk` ^0.92.0 - Powers Claude LLM provider; env vars `CLAUDE_API_KEY` / `ANTHROPIC_API_KEY`
- `kafkajs` ^2.2.4 - Message bus between api-gateway and ai-service; brokers via `KAFKA_BROKERS` env
- `@prisma/client` ^7.8.0 - All database access; schema at `ai-platform/libs/database/prisma/schema.prisma`
- `pgvector/pgvector:pg16` - PostgreSQL with vector extension; required for RAG similarity search (`Chunk.embedding` field `vector(768)`)

**Infrastructure:**
- `pg` ^8.20.0 - Raw PostgreSQL driver used alongside Prisma adapter
- `rxjs` ^7.8.2 - Observable streaming pipeline for AI responses

## Configuration

**Environment:**
- Backend env template: `ai-platform/.env.example`
- Frontend env template: `ai-platform-fe/.env.example`
- Backend loaded via `@nestjs/config` (`ConfigModule.forRoot({ isGlobal: true })`)
- Frontend env variables must be prefixed `NX_PUBLIC_` to be inlined into browser bundle by Rspack

**Key Backend Env Vars:**
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

**Key Frontend Env Vars:**
- `NX_PUBLIC_API_URL` - API gateway base URL (default: `http://localhost:4000/api`)

**Build:**
- Backend: `ai-platform/nx.json` (Nx plugins: webpack, eslint, jest)
- Frontend: `ai-platform-fe/nx.json`
- Root workspace: `/nx.json` (top-level Nx config)
- TypeScript paths: `ai-platform/tsconfig.base.json` — `@ai-platform/shared`, `@ai-platform/kafka`, `@ai-platform/database`
- Prisma schema config: `ai-platform/prisma.config.ts`

## Code Quality

**Linting:**
- ESLint ^9.x with TypeScript ESLint ^8.40.0 (`typescript-eslint`)
- `eslint-config-prettier` ^10.0.0 - Disables style rules
- Frontend adds `eslint-plugin-react` 7.35.0, `eslint-plugin-react-hooks` 5.0.0, `eslint-plugin-jsx-a11y` 6.10.1, `eslint-plugin-import` 2.31.0

**Formatting:**
- Prettier ~3.6.2 in both workspaces

**Git Hooks:**
- Husky ^9.1.7 - Git hooks runner
- `lint-staged` ^16.x - Pre-commit lint + format
- `@commitlint/cli` ^20.x + `@commitlint/config-conventional` - Commit message linting (types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`)

## Platform Requirements

**Development:**
- Node.js 22
- Docker / Docker Compose for PostgreSQL (`pgvector/pgvector:pg16`), Zookeeper, and Kafka (Confluent Platform 7.5.0)
- Ollama (optional local LLM) or Anthropic API key

**Production:**
- Not explicitly defined; no Dockerfiles present for application services
- Infrastructure via `ai-platform/docker-compose.yml` covers only Postgres + Kafka stack

---

*Stack analysis: 2026-05-20*
