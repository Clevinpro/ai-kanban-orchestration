---
name: microservices-structure
description: Explains ai-platform-fe microfrontends structure, folder conventions, state/store approach, and testing rules. Use when implementing or refactoring auth/chat/docs/shell apps, creating new features, or deciding where files should live.
disable-model-invocation: true
---

# AI Platform FE: Microservices Structure

## Scope

Use this skill for work inside `ai-platform-fe`.

## Architecture Snapshot

- Monorepo with Nx.
- Microfrontends are in `apps/`.
- Shared code is in `libs/`.
- Routing uses TanStack Router.
- Server state uses TanStack Query via shared `queryClient`.
- UI uses Ant Design and shared UI components.

## Microservice Map

- `apps/shell`: host app (port `3000`), composes remotes and defines top-level routes.
- `apps/auth`: auth remote (port `3001`), owns login/register pages and auth flow.
- `apps/chat`: chat app/remote (port `3002`), current root route scaffold.
- `apps/docs`: docs app/remote (port `3003`), current root route scaffold.

Each app keeps feature code under `src/`:
- `bootstrap.tsx`: providers and app mount.
- `router.ts(x)`: route tree.
- `routes/`: route components.
- `app/`: app-level page composition.

## Shared Libraries

- `libs/api`: API client and endpoint modules.
- `libs/store`: shared React Query setup (`queryClient`).
- `libs/ui`: reusable UI primitives/components and layout.

## State and Store Rules

1. Use **TanStack Query** for server state (requests, caching, mutations).
2. Use local component/form state for transient UI state.
3. Do not introduce Redux/Zustand/MobX unless explicitly requested.
4. Reuse `queryClient` from `@libs/store` in app bootstraps.
5. Keep API calls in `libs/api`; UI routes should call API modules, not inline axios logic.

## Testing Rules

- Unit/integration: Vitest (`@nx/vitest:test`) per app/lib.
- E2E: Playwright in `e2e/`.
- Prefer colocated tests:
  - components/routes: `*.spec.tsx`
  - non-UI modules: `*.spec.ts`
- Minimum expectations for new feature changes:
  - validation/logic branch covered;
  - happy-path submit/action covered;
  - at least one error-path assertion for user feedback.

## Folder Structure Conventions

For new route features inside an app:

1. Put page container in `apps/<app>/src/routes/`.
2. Keep route-specific helpers/types near the route unless shared by multiple routes.
3. Promote reusable code to libs:
   - API/domain DTOs and endpoints -> `libs/api`
   - cross-app UI -> `libs/ui`
   - cross-app data client/state infra -> `libs/store`
4. Keep imports through aliases when available (for example `@libs/api`, `@libs/store`, `@libs/ui`).
5. Avoid deep relative imports into other app boundaries.

## Implementation Checklist

- [ ] Correct app boundary (`apps/*`) chosen.
- [ ] Shared logic extracted to the correct `libs/*` package.
- [ ] Routing done with TanStack Router patterns already used in the target app.
- [ ] Server interactions use TanStack Query + `libs/api`.
- [ ] Tests updated (Vitest and, when flow-level behavior changes, Playwright).

