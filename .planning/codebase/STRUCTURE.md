# Structure: ai-agent-microservices

**Mapped:** 2026-05-20

## Workspace Root

```
ai-agent-microservices/
├── ai-platform/          # Backend NestJS monorepo (has own .git)
├── ai-platform-fe/       # Frontend React MFE monorepo (has own .git)
├── .nx/                  # Nx workspace cache
├── .vscode/              # Shared editor config
├── .nxignore
└── package.json          # Root workspace (if any)
```

This is a **multi-repo workspace** — each sub-directory is an independent git repo with its own `node_modules`, `nx.json`, and `package.json`.

---

## Backend: `ai-platform/`

NestJS microservices monorepo managed by Nx.

```
ai-platform/
├── apps/
│   ├── api-gateway/      # HTTP entry point; routes to downstream services via Kafka
│   │   └── src/
│   │       ├── ai/           # AI chat proxy (controller + module)
│   │       ├── auth/         # JWT guard + auth proxy
│   │       ├── conversations/ # Conversation management
│   │       ├── documents/    # Document upload/query proxy
│   │       ├── health/       # Health check endpoint
│   │       └── main.ts
│   ├── auth-service/     # JWT + Google OAuth authentication
│   │   └── src/
│   │       ├── auth/
│   │       │   ├── dto/      # login.dto, register.dto, google-profile.dto
│   │       │   ├── guards/   # jwt-auth.guard, google-auth.guard
│   │       │   ├── strategies/ # jwt.strategy, google.strategy
│   │       │   ├── auth.controller.ts
│   │       │   ├── auth.module.ts
│   │       │   └── auth.service.ts
│   │       └── main.ts
│   └── ai-service/       # AI inference + RAG + knowledge management
│       └── src/
│           ├── ai/           # AI provider abstraction + capability detection
│           │   ├── providers/  # claude.provider, ollama.provider, factory
│           │   └── dto/
│           ├── conversation/ # Conversation state service
│           ├── document/     # Document ingestion controller/service
│           ├── embeddings/   # Embedding generation
│           ├── knowledge/    # Knowledge base queries
│           ├── search/       # Semantic search
│           └── main.ts
├── libs/
│   ├── database/         # Prisma ORM — schema, migrations, PrismaService
│   │   ├── prisma/       # schema.prisma, migrations
│   │   └── src/
│   ├── kafka/            # KafkaJS wrapper — producers, consumers, topics
│   │   └── src/
│   └── shared/           # DTOs, constants, utilities shared across apps
│       └── src/
├── docker-compose.yml    # Local infra (Postgres, Kafka, etc.)
├── prisma.config.ts      # Prisma config
├── CLAUDE.md
├── nx.json
├── tsconfig.base.json
└── package.json
```

### Where to add new backend code

| What | Where |
|------|-------|
| New API endpoint | `apps/api-gateway/src/<feature>/<feature>.controller.ts` |
| New microservice feature | `apps/<service>/src/<feature>/<feature>.module.ts` |
| Prisma model | `libs/database/prisma/schema.prisma` |
| Kafka topic/consumer | `libs/kafka/src/` |
| Shared DTO/type | `libs/shared/src/` |
| New microservice | `apps/<new-service>/` (new Nx app) |

---

## Frontend: `ai-platform-fe/`

React Micro-Frontend monorepo using Nx + Rspack + Module Federation v2.

```
ai-platform-fe/
├── apps/
│   ├── shell/            # MFE host — loads remote apps, top-level routing
│   │   └── src/
│   │       ├── app/      # Root App component
│   │       ├── bootstrap.tsx
│   │       ├── main.tsx
│   │       └── placeholder.spec.tsx
│   ├── auth/             # Remote MFE — login, register pages
│   │   └── src/
│   │       ├── app/
│   │       ├── components/   # GuestRoute.tsx
│   │       ├── routes/       # __root.tsx, index.tsx, login.tsx, register.tsx
│   │       │               # login.spec.tsx, register.spec.tsx (real tests)
│   │       ├── router.ts
│   │       ├── bootstrap.tsx
│   │       ├── remote-entry.ts
│   │       └── main.tsx
│   ├── chat/             # Remote MFE — AI chat interface
│   │   └── src/
│   │       ├── hooks/        # useChat, useScrollToBottom, useStatusQueue, useStreamConnection
│   │       ├── routes/       # chat.tsx, __root.tsx, index.tsx
│   │       ├── remote-entry.ts
│   │       └── main.tsx
│   └── docs/             # Remote MFE — documentation viewer
│       └── src/
│           ├── app/
│           ├── remote-entry.ts
│           └── main.tsx
├── libs/
│   ├── api/              # API client layer (React Query + axios/fetch)
│   ├── store/            # Global state (Zustand or similar)
│   └── ui/               # Shared component library (has Storybook stories)
├── e2e/                  # Playwright E2E specs
│   ├── auth.spec.ts
│   ├── chat.spec.ts
│   └── docs.spec.ts
├── playwright.config.ts
├── vitest.config.ts      # Root Vitest config (v8 coverage)
├── nx.json
├── tsconfig.base.json
└── package.json
```

### Where to add new frontend code

| What | Where |
|------|-------|
| New route in auth | `apps/auth/src/routes/<route>.tsx` |
| New route in chat | `apps/chat/src/routes/<route>.tsx` |
| Chat hook | `apps/chat/src/hooks/use<Name>.ts` |
| Shared UI component | `libs/ui/src/<component>/` (add Storybook story) |
| API call | `libs/api/src/` |
| Global state | `libs/store/src/` |
| New MFE remote | `apps/<name>/` + register in shell `module-federation.config.ts` |

---

## Naming Conventions

### Backend

| Entity | Convention | Example |
|--------|-----------|---------|
| Files | `kebab-case.type.ts` | `auth.service.ts`, `jwt-auth.guard.ts` |
| Classes | `PascalCase` | `AuthService`, `JwtAuthGuard` |
| Modules | `<Feature>Module` | `AuthModule`, `KafkaModule` |
| DTOs | `<Action><Entity>Dto` | `LoginDto`, `RegisterDto` |
| Dirs | `kebab-case` | `auth-service/`, `api-gateway/` |

### Frontend

| Entity | Convention | Example |
|--------|-----------|---------|
| Components | `PascalCase.tsx` | `GuestRoute.tsx`, `App.tsx` |
| Routes | `lowercase.tsx` | `login.tsx`, `register.tsx`, `chat.tsx` |
| Hooks | `useCamelCase.ts` | `useChat.ts`, `useStreamConnection.ts` |
| Root route | `__root.tsx` | `__root.tsx` |
| Tests | co-located `.spec.tsx` | `login.spec.tsx` |

---

*Last mapped: 2026-05-20*
