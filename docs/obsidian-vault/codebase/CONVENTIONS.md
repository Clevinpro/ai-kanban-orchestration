# Coding Conventions

**Analysis Date:** 2026-05-20

## Naming Patterns

**Files:**
- Backend: `kebab-case` for all files — `auth.service.ts`, `jwt-auth.guard.ts`, `kafka-producer.service.ts`
- Frontend: `PascalCase` for component files — `ChatMessage.tsx`, `LoginForm.tsx`, `AppLayout.tsx`
- Stories: `ComponentName.stories.tsx` co-located with component — `ChatMessage.stories.tsx`
- Tests: `*.spec.ts` / `*.spec.tsx` co-located with subject file
- DTOs: `<action>.dto.ts` — `login.dto.ts`, `register.dto.ts`
- Types: `<domain>.types.ts` — `auth.types.ts`, `user.types.ts`, `chat.types.ts`
- Constants: `<domain>.constants.ts` — `kafka.constants.ts`, `app.constants.ts`

**Functions:**
- camelCase throughout — `googleLogin`, `generateTokens`, `formatMessageTime`, `notifyListeners`
- Private helpers use camelCase — `findOrCreateUser`, `storeRefreshToken`, `parseRequest`
- Hook functions prefixed with `use` — `useConversations`, `useTypewriter`, `useActiveConversation`

**Variables:**
- camelCase — `accessToken`, `refreshToken`, `navigateMock`
- Constants in `SCREAMING_SNAKE_CASE` for module-level values — `FIFTEEN_MINUTES`, `SEVEN_DAYS`, `PASSWORD_HASH_ROUNDS`, `LOGIN_FAILED`, `ACTIVE_CONVERSATION_STORAGE_KEY`
- Enum members in `SCREAMING_SNAKE_CASE` — `KAFKA_TOPICS.AI_REQUEST`, `KAFKA_TOPICS.AI_RESPONSE`
- Prefix unused parameters and variables with `_` to satisfy ESLint — `argsIgnorePattern: '^_'`

**Types/Interfaces:**
- Backend interfaces prefixed with `I` — `IUser`, `ITokens`, `IUserPayload`, `IGoogleProfile`, `IKafkaMessage`
- Frontend interfaces prefixed with `I` for data shapes — `ILoginDto`, `IRegisterDto`, `IUser`
- Props interfaces suffixed with `Props` — `ChatMessageProps`, `LoginFormProps`, `AppLayoutProps`
- Form value types suffixed with `Values` — `LoginFormValues`, `RegisterFormValues`
- Inline types inside a file use `type` keyword — `AuthenticatedRequest`, `AiRequestPayload`, `Listener`

**Classes (backend NestJS):**
- PascalCase — `AuthService`, `KafkaProducerService`, `LoggerService`
- Suffixed by role: `Service`, `Controller`, `Module`, `Guard`, `Strategy`, `Dto`

## Code Style

**Formatting:**
- Tool: Prettier (both monorepos share identical config)
- Config: `ai-platform/.prettierrc`, `ai-platform-fe/.prettierrc`
- `singleQuote: true`
- `semi: true`
- `trailingComma: "all"`
- `printWidth: 100`

**Linting:**
- Tool: TypeScript ESLint via `@nx/eslint-plugin` flat config
- Backend root config: `ai-platform/eslint.config.js`
- Frontend root config: `ai-platform-fe/eslint.config.mjs`
- Key rules enforced globally:
  - `no-console: error` — use `LoggerService` in backend, avoid `console` in frontend
  - `prefer-const: error`
  - `@typescript-eslint/no-unused-vars: error` (prefix with `_` to suppress)
  - `@typescript-eslint/no-explicit-any: error` (on all `src/**/*.ts` files)
  - `@typescript-eslint/consistent-type-imports: error` — use `import type { ... }` for type-only imports
  - `@nx/enforce-module-boundaries: error` — cross-lib imports must respect declared tags
- Test files: `@typescript-eslint/no-empty-function` is `off`

**TypeScript:**
- `strict: true` in both monorepos' `tsconfig.base.json`
- `emitDecoratorMetadata: true` and `experimentalDecorators: true` in backend (NestJS requirement)
- `consistent-type-imports` enforced — type-only imports must use `import type`

## Import Organization

**Backend (`ai-platform`):**
1. NestJS framework packages — `@nestjs/common`, `@nestjs/jwt`, etc.
2. Monorepo library imports (`@ai-platform/*`) — `@ai-platform/database`, `@ai-platform/shared`
3. Third-party packages — `bcrypt`, `rxjs`, etc.
4. Relative imports — DTOs, local helpers

Example from `auth.service.ts`:
```typescript
import { ConflictException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@ai-platform/database';
import { LoggerService } from '@ai-platform/shared';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
```

**Frontend (`ai-platform-fe`):**
1. Internal monorepo lib imports (`@libs/*`) — `@libs/api`, `@libs/ui`, `@libs/store`
2. Third-party packages alphabetically — `@tanstack/react-query`, `antd`, `react`
3. Relative imports — local components, hooks

Example from `login.tsx`:
```typescript
import { login } from '@libs/api';
import { LoginForm } from '@libs/ui';
import { useMutation } from '@tanstack/react-query';
import { Button, Card } from 'antd';
import { useState } from 'react';
import GuestRoute from '../components/GuestRoute';
```

**Path Aliases:**
- Backend: `@ai-platform/shared`, `@ai-platform/kafka`, `@ai-platform/database` — defined in `ai-platform/tsconfig.base.json`
- Frontend: `@libs/ui`, `@libs/api`, `@libs/store` — defined via Vitest resolve aliases in `ai-platform-fe/vitest.config.ts` and Rspack/Module Federation config

## Error Handling

**Backend — NestJS exceptions:**
- Throw NestJS built-in HTTP exceptions directly from services: `UnauthorizedException`, `ConflictException`, `BadRequestException`
- Never swallow errors silently — always log then throw
- Catch blocks are narrow: catch only what is expected (e.g., JWT verification errors)
- Example from `auth.service.ts`:
```typescript
try {
  await this.jwtService.verifyAsync<IUserPayload>(refreshToken, { ... });
} catch {
  this.logger.warn('Refresh token rejected: invalid signature', AuthService.name);
  throw new UnauthorizedException('Invalid refresh token');
}
```

**Frontend — React Query mutations:**
- Handle errors in `onError` callback of `useMutation`
- Show user-facing messages via `message.error()` (Ant Design) AND set local `formError` state for inline Alert display
- Error constants are module-level: `const LOGIN_FAILED = 'Could not sign in...'`
- Example from `login.tsx`:
```typescript
const loginMutation = useMutation({
  mutationFn: login,
  onSuccess: () => { void navigate({ to: '/chat' }); },
  onError: () => {
    setFormError(LOGIN_FAILED);
    message.error(LOGIN_FAILED);
  },
});
```

## Logging

**Framework:** `nestjs-pino` via `LoggerService` wrapper in `@ai-platform/shared`
- Service: `ai-platform/libs/shared/src/lib/logger/logger.service.ts`
- Methods: `log`, `warn`, `error`, `debug`, `verbose`
- No direct `console.log` — ESLint enforces `no-console: error`

**Patterns:**
- Pass `ClassName.name` as context: `this.logger.log('...', AuthService.name)`
- Pass structured metadata as third argument: `this.logger.log('...', AuthService.name, { userId })`
- Log at start and end of significant operations: "Request received" and "Request completed"
- Warn on rejected/unauthorized operations: "Login rejected: invalid credentials"
- Frontend: no dedicated logger — avoid `console.*` (ESLint rule enforced)

## Comments

**When to Comment:**
- `TODO:` prefix for known incomplete stubs or deferred work — used throughout the codebase
- Inline comments explain non-obvious decisions (e.g., `// Passport redirects to Google automatically via GoogleAuthGuard`)
- Comments explain deferred work: `// TODO: replace with JwtModule.registerAsync + ConfigService for production`
- JSDoc is not used in source code; comments are plain inline style

**All code comments must be in English** — stated in `ai-platform/CLAUDE.md`.

## Function Design

**Size:** Single-responsibility; services decompose into small private helpers (`findOrCreateUser`, `storeRefreshToken`, `generateTokens`)

**Parameters:** Dependency-injected via NestJS constructor injection in backend; function parameters use destructuring for React components

**Return Values:**
- Backend: always typed with explicit return type annotations — `async register(...): Promise<ITokens>`
- Frontend: React components return JSX; hooks return typed object shapes
- Avoid `any` — `@typescript-eslint/no-explicit-any: error` is enforced

## Module Design

**Backend — NestJS module pattern:**
- Every feature has `<feature>.module.ts`, `<feature>.service.ts`, `<feature>.controller.ts`
- `app.module.ts` imports all feature modules
- Libs expose a module class and an `index.ts` barrel

**Frontend — barrel exports:**
- Each lib exports from a single `src/index.ts` — named exports + type-only re-exports
- Both values and types are exported separately: `export { ChatMessage }` + `export type { ChatMessageProps }`
- Example: `ai-platform-fe/libs/ui/src/index.ts`

**Commit Convention:**
- `@commitlint/config-conventional` enforced with husky pre-commit hooks in both monorepos
- Allowed types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`
- Scope is required (warning level)
- Subject must not be empty and must not end with `.`

---

*Convention analysis: 2026-05-20*
