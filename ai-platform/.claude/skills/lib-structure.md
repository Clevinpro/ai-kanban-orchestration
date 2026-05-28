# Skill: Library Structure

**Purpose:** scaffold a new NestJS library with valid file structure and dependencies.

## Rules

- All comments, descriptions, and documentation must be in **English**.

## Library template

```
libs/<name>/
├── src/
│   ├── index.ts                # Public API — re-exports all public symbols
│   └── lib/
│       └── <name>.ts           # Core implementation
├── tsconfig.json
├── package.json
└── README.md
```

## Library overview

| Library    | Package                 | Purpose                                                                          | Dependencies                           |
| ---------- | ----------------------- | -------------------------------------------------------------------------------- | -------------------------------------- |
| `database` | `@ai-platform/database` | Prisma ORM — `PrismaService`, schema, migrations                                 | `@prisma/client`, `@prisma/adapter-pg` |
| `kafka`    | `@ai-platform/kafka`    | Kafka — `KafkaConsumerService`, `KafkaProducerService`, `KafkaModule`, constants | `@ai-platform/shared`, `kafkajs`       |
| `shared`   | `@ai-platform/shared`   | Shared utilities — logging (pino), global configs                                | `nestjs-pino`, `pino`                  |

## Dependency graph

```
shared  ←  (no internal deps)
kafka   →  @ai-platform/shared
database →  (no internal deps)
```

## When to create a new library

- Logic is used in 2+ apps
- Need isolated configuration/infrastructure (ORM, queues, etc.)
- Shared DTOs, interfaces, or typing

## Conventions

- Folder name: `kebab-case`
- Package name: `@ai-platform/<kebab-case-name>`
- Version: `0.0.1` (not published to npm)
- Public API only via `src/index.ts`, never import `src/lib/*` directly
- Dependencies on other libs via `package.json` (e.g. `"@ai-platform/shared": "0.0.1"`)
- All libs `private: true`
- Testing: Jest via `@nx/jest`
