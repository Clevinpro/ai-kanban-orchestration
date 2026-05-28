# Skill: FE Conventions (React)

**Purpose:** Load this skill before implementing React features in ai-platform-fe/.

## Rules

- All comments, descriptions, and documentation must be in **English**.

## App Structure

```
ai-platform-fe/
├── apps/
│   ├── shell/          # MFE host — TanStack Router, QueryClientProvider, lazy-loads remotes
│   ├── auth/           # MFE remote — Login, Register, Google OAuth, GuestRoute
│   ├── chat/           # MFE remote — Chat page, useChat hook, SSE client, conversation sidebar
│   └── docs/           # MFE remote — placeholder
└── libs/
    ├── api/            # Axios client, API endpoint functions, SSE streamMessage, types (@libs/api)
    ├── store/          # TanStack Query hooks for conversations, useActiveConversation (@libs/store)
    └── ui/             # Shared React components, Storybook (@libs/ui)
```

## Module Federation Pattern

- `shell` is the MFE host (Rspack/Webpack Module Federation host)
- `auth`, `chat`, `docs` are MFE remotes lazy-loaded at runtime via `@module-federation/enhanced`
- Import shared code via `@libs/api`, `@libs/store`, `@libs/ui` aliases — NOT direct relative paths across apps
- Remote federation config lives in each app's `rspack.config.ts`

## Naming Conventions

- Component files: PascalCase — `ChatMessage.tsx`, `LoginForm.tsx`, `AppLayout.tsx`
- Hook files: camelCase with `use` prefix — `useConversations.ts`, `useTypewriter.ts`
- Story files: `ComponentName.stories.tsx` co-located with component
- Test files: `*.spec.tsx` co-located with subject file
- Props interfaces: `<Component>Props` suffix — `ChatMessageProps`, `LoginFormProps`
- Form value types: `<Feature>Values` suffix — `LoginFormValues`
- Constants: `SCREAMING_SNAKE_CASE` for module-level values
- Unused params/variables: prefix with `_` to satisfy ESLint `argsIgnorePattern: '^_'`

## Key Conventions

- **Build**: `nx serve <app>` (Rspack dev server) / `nx build <app>` (production build)
- **Unit test**: `nx test <app|lib>` — Vitest
- **E2E test**: `nx e2e <app>-e2e` — Playwright
- **Import aliases**: `@libs/api`, `@libs/store`, `@libs/ui` — defined in vitest.config.ts resolve aliases
- **State**: TanStack Query (`@tanstack/react-query`) for server state; `useSyncExternalStore` for singletons
- **Forms**: `@tanstack/react-form` + `@tanstack/zod-form-adapter` + `zod` for validation
- **UI components**: Ant Design (`antd` ^6) — use `message.error()` for user-facing error messages
- **HTTP client**: axios (configured in `ai-platform-fe/libs/api/src/client.ts`) — not fetch
- **Routing**: `@tanstack/react-router` (file-based, type-safe) in shell and remotes
- **Linting**: TypeScript ESLint (`eslint.config.mjs`) + eslint-plugin-react, eslint-plugin-react-hooks
- **Commit**: commitlint with @commitlint/config-conventional
- **Storybook**: co-located stories (`ComponentName.stories.tsx`), Rsbuild config in libs/ui

## App Dependencies

| App     | Libs used                                          |
| ------- | -------------------------------------------------- |
| `shell` | `@libs/api`, `@libs/store`, `@libs/ui`             |
| `auth`  | `@libs/api`, `@libs/store`, `@libs/ui`             |
| `chat`  | `@libs/api`, `@libs/store`, `@libs/ui`             |
| `docs`  | `@libs/ui`                                         |

## Environment Variables

- Must be prefixed `NX_PUBLIC_` to be inlined by Rspack into the browser bundle
- `NX_PUBLIC_API_URL` — API gateway base URL (default: `http://localhost:4000/api`)
