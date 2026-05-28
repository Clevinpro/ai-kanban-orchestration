# Testing: ai-agent-microservices

**Mapped:** 2026-05-20

## Overview

Multi-package monorepo with Jest (backend), Vitest (frontend), and Playwright (E2E). All packages enforce 80% coverage threshold. Most specs are currently placeholder stubs.

---

## Backend (`ai-platform`)

**Framework:** Jest + ts-jest

**Coverage:** 80% threshold enforced

**Structure:** `*.spec.ts` files co-located with source files

**Status:** Placeholder specs — minimal real test logic implemented

---

## Frontend (`ai-platform-fe`)

**Framework:** Vitest + jsdom + `@testing-library/react`

**Coverage:** 80% threshold via v8 provider

**Structure:** `*.spec.tsx` co-located with components

**Real tests exist for:**
- `login.spec.tsx`
- `register.spec.tsx`

### Mocking Patterns

```ts
// Partial module mock
vi.mock('@libs/api', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, /* overrides */ };
});

// Side-effect spy
vi.spyOn(message, 'error');

// Real QueryClient (no mock)
new QueryClient({ defaultOptions: { queries: { retry: false } } });
```

### Todo Stubs

Incomplete tests use `it.todo('description')` rather than `it.skip`.

---

## E2E

**Framework:** Playwright

**Target:** `http://localhost:3000` (Chromium)

**Status:** All specs currently placeholder

---

## Storybook

**Package:** `@storybook/react`

**Scope:** Stories for all UI lib components

**Pattern:**
```ts
import type { Meta, StoryObj } from '@storybook/react';
const meta: Meta<typeof Component> = { ... };
export default meta;
type Story = StoryObj<typeof meta>;
```

---

## Coverage Thresholds

| Package       | Threshold |
|---------------|-----------|
| ai-platform   | 80%       |
| ai-platform-fe| 80%       |

---

*Last mapped: 2026-05-20*
