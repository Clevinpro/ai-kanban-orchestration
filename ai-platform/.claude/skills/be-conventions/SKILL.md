# Skill: BE Conventions (NestJS)

**Purpose:** Load this skill before implementing NestJS features in ai-platform/.

## Rules

- All comments, descriptions, and documentation must be in **English**.

## Project Layout

```
├── apps/                       # NestJS microservices
│   ├── api-gateway/            # Edge gateway — routes, auth guard, proxies to backend services
│   ├── auth-service/           # Auth service — JWT, Passport (Google OAuth, JWT strategy)
│   └── ai-service/             # AI service — document ingestion, RAG search, embeddings, LLM providers
├── libs/                       # Shared NestJS libraries
│   ├── database/               # Prisma ORM — PrismaService, schema, migrations (@ai-platform/database)
│   ├── kafka/                  # Kafka infrastructure — consumer/producer services, module, constants (@ai-platform/kafka)
│   └── shared/                 # Cross-cutting helpers — logging (pino/nestjs-pino), common utilities (@ai-platform/shared)
├── libs/database/prisma/       # Prisma schema & migrations
├── nx.json                     # Nx workspace config — webpack/nest/eslint/jest plugins
├── package.json                # Root workspace — scripts: start, lint, test, db:*
└── tsconfig.base.json          # Shared TypeScript paths & compiler options
```

## Service Pattern

```
apps/<name>/
├── src/
│   ├── main.ts                 # Bootstrap — NestFactory, global prefix, Swagger (if applicable)
│   ├── app/
│   │   └── app.module.ts       # Root module — @Module() for all feature modules
│   └── <feature>/              # One folder per feature
│       ├── <feature>.controller.ts
│       ├── <feature>.service.ts
│       └── <feature>.module.ts
├── webpack.config.js           # Nx webpack build
├── tsconfig.json
├── jest.config.ts
└── package.json
```

## Key Conventions

- **Monorepo scope**: `@ai-platform/*` — libs use `@ai-platform/database`, `@ai-platform/kafka`, `@ai-platform/shared`
- **Build**: `nx serve <app>` / `nx build <lib>` — Nx + webpack for apps, tsc for libs
- **Test**: `nx test <app|lib>` — Jest
- **Deps**: libs declare deps on other libs via `package.json` dependencies (e.g. kafka depends on shared)
- **Modules**: Every feature is a self-contained NestJS module with controller → service → DTOs
- **Validation**: class-transformer + class-validator DTOs
- **Logging**: pino via nestjs-pino (from @ai-platform/shared)
- **Linting**: TypeScript ESLint + eslint-config-prettier
- **Commit**: commitlint with @commitlint/config-conventional
- **Run local env**: `npm start` launches all 3 services in parallel

## App Dependencies

| App            | Internal deps                                                        |
| -------------- | -------------------------------------------------------------------- |
| `api-gateway`  | `@ai-platform/kafka`, `@ai-platform/shared`                          |
| `auth-service` | `@ai-platform/database`, `@ai-platform/kafka`, `@ai-platform/shared` |
| `ai-service`   | `@ai-platform/database`, `@ai-platform/kafka`, `@ai-platform/shared` |
