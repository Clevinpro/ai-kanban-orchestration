# Skill: App Structure

**Purpose:** scaffold a new NestJS app with valid file structure.

## Rules

- All comments, descriptions, and documentation must be in **English**.

## App template

```
apps/<name>/
├── src/
│   ├── main.ts                 # NestFactory bootstrap, global prefix, Swagger
│   ├── app/
│   │   └── app.module.ts       # Root @Module, imports all feature modules
│   └── <feature>/              # One folder per domain
│       ├── <feature>.controller.ts
│       ├── <feature>.service.ts
│       └── <feature>.module.ts
├── webpack.config.js
├── tsconfig.json
├── jest.config.ts
└── package.json
```

## App dependencies

| App            | Internal deps                                                        |
| -------------- | -------------------------------------------------------------------- |
| `api-gateway`  | `@ai-platform/kafka`, `@ai-platform/shared`                          |
| `auth-service` | `@ai-platform/database`, `@ai-platform/kafka`, `@ai-platform/shared` |
| `ai-service`   | `@ai-platform/database`, `@ai-platform/kafka`, `@ai-platform/shared` |

## When to create a new app

- A new domain that doesn't fit into existing services
- Separate process/port for scaling
- Different tech stack (here — all NestJS, so rarely needed)

## Conventions

- Folder name: `kebab-case`
- Module name: PascalCase (e.g. `AuthServiceModule`)
- Services: `*Service` suffix, exported via `@Injectable()`
- DTOs: separate `dto/` subfolder in the feature folder
- Tests: `*.spec.ts` alongside the file under test
- Linting: ESLint via Nx plugin `@nx/eslint`
- Testing: Jest via Nx plugin `@nx/jest`
