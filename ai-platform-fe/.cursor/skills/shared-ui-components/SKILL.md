---
name: shared-ui-components
description: >-
  Defines where cross-app React UI lives in libs/ui, how to export from the
  barrel, and that apps must import via @libs/ui — never duplicate the same
  component in apps. Use when adding or moving LoginForm, RegisterForm, other
  shared UI, or when refactoring auth/chat routes that reimplement forms.
disable-model-invocation: true
---

# Shared UI components (`@libs/ui`)

## Goal

Avoid duplicating the same forms and widgets across multiple `apps/*`: implementation lives in `libs/ui`, and apps only import the public API.

## Location and exports

- **Component** (example): `libs/ui/src/components/LoginForm/LoginForm.tsx` — implementation here.
- **Barrel (public exports)**: `libs/ui/src/index.ts` — export from here.  
  The `@libs/ui` alias in `tsconfig.base.json` points at this file.

For a new shared component:

1. Add `libs/ui/src/components/<Name>/<Name>.tsx` (and stories/types if needed).
2. Add `export { <Name> }` (and types) to `libs/ui/src/index.ts`.
3. Do not copy the same markup/logic under any `apps/*/src/` — import from the library instead.

## Imports in apps

```tsx
import { LoginForm } from '@libs/ui';
```

Example: the login route `apps/auth/src/routes/login.tsx` should import from `@libs/ui`, not define a local component with the same name that duplicates `LoginForm` from the lib.

## Anti-pattern

- A local `function LoginForm()` (or a separate file) in `apps/auth` when `libs/ui` already exports `LoginForm` — that is duplication; move shared code to the lib or switch to the import.

## Related

For app vs lib boundaries and the wider monorepo layout, see the `microservices-structure` skill.
