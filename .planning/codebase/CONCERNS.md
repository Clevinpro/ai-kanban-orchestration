# Concerns: ai-agent-microservices

**Mapped:** 2026-05-20

## Summary

| Severity | Count |
|----------|-------|
| High     | 3     |
| Medium   | 5     |
| Low      | 4     |

---

## High Severity

### H1: Near-Zero Test Coverage

**Location:** All services and apps

Most test files are placeholder stubs with no implementation:
- `ai-platform/apps/ai-service/src/app/app.service.spec.ts` — placeholder
- `ai-platform/apps/auth-service/src/app/app.service.spec.ts` — placeholder
- `ai-platform-fe/apps/auth/src/placeholder.spec.ts` — placeholder
- `ai-platform-fe/apps/chat/src/placeholder.spec.ts` — placeholder
- `ai-platform-fe/apps/docs/src/placeholder.spec.ts` — placeholder
- `ai-platform-fe/apps/shell/src/placeholder.spec.tsx` — placeholder
- All Playwright E2E specs (`auth.spec.ts`, `chat.spec.ts`, `docs.spec.ts`) — placeholder

80% coverage thresholds are configured but will fail immediately if enabled strictly. Real tests only exist for `login.spec.tsx` and `register.spec.tsx`.

**Risk:** No regression safety net. Any refactor or feature addition could break silently.

### H2: `dist/` Directory Committed to Git

**Location:** `ai-platform/dist/apps/ai-service/`

Built artifacts (`main.js`, `main.js.map`, `package.json`, `package-lock.json`) are committed. This pollutes git history and creates stale artifact risk.

**Risk:** CI/CD may deploy stale build artifacts; merge conflicts on dist files.

### H3: No Root-Level `.gitignore`

**Location:** `/` (workspace root)

The workspace root has no `.gitignore`. The `.nx/workspace-data/` directory with large binary/cache files (`.db`, `.json` files) is untracked and may be accidentally committed.

**Risk:** Accidental commit of Nx cache, `.DS_Store`, or other large files.

---

## Medium Severity

### M1: Multiple Stale Claude Worktrees

**Location:** `ai-platform/.claude/worktrees/`, `ai-platform-fe/.claude/worktrees/`

Multiple abandoned worktree directories remain:
- `ai-platform/.claude/worktrees/cool-lalande-9a67a7`
- `ai-platform/.claude/worktrees/elated-hellman-818243`
- `ai-platform-fe/.claude/worktrees/beautiful-agnesi-7a1278`
- `ai-platform-fe/.claude/worktrees/musing-borg-23a57c`
- `ai-platform-fe/.claude/worktrees/suspicious-cerf-b1d367`
- `ai-platform-fe/.claude/worktrees/wizardly-chebyshev-46d017`

Each contains a full duplicate of the codebase. Consuming disk space and creating confusion about which copy is canonical.

**Risk:** Disk bloat; accidental edits to worktree copies instead of main.

### M2: AI Provider Factory — No Fallback Strategy

**Location:** `ai-platform/apps/ai-service/src/ai/providers/ai-provider.factory.ts`

Factory switches between `claude.provider.ts` and `ollama.provider.ts` via capability detection. No documented fallback behavior if the selected provider fails at runtime.

**Risk:** Silent provider failure causes unhandled errors in production.

### M3: Kafka Dependency for Inter-Service Communication

**Location:** `ai-platform/libs/kafka/`

All inter-service communication routes through Kafka. No HTTP fallback or circuit breaker visible. If Kafka is unavailable locally or in dev, the entire system is non-functional.

**Risk:** Dev/test environment fragility; single point of failure.

### M4: Module Federation Type Sharing — Only `shell/@mf-types/auth`

**Location:** `ai-platform-fe/apps/shell/@mf-types/`

Only the `auth` remote has compiled type declarations shared to `shell`. `chat` and `docs` remotes appear to have no published types.

**Risk:** Shell app loses type safety when consuming chat/docs remote modules.

### M5: No API Error Boundary in Frontend

**Location:** `ai-platform-fe/libs/api/`

No evidence of global error boundaries or standardized error handling in the `@libs/api` layer based on structure (not code-reviewed).

**Risk:** Unhandled API errors may cause silent failures or crashes without user feedback.

---

## Low Severity

### L1: `.env` Files Present (Not `.env.example` Only)

**Location:** `ai-platform/.env`, `ai-platform-fe/.env`

Actual `.env` files exist alongside `.env.example`. If secrets are present in these files they must not be committed.

**Risk:** Credential leak if `.gitignore` rules are misconfigured.

### L2: `apps/auth/coverage/` Committed

**Location:** `ai-platform-fe/apps/auth/coverage/`, `apps/shell/coverage/`

Coverage HTML reports appear to be committed to the repo. These are generated artifacts.

**Risk:** Noisy diffs, repo bloat.

### L3: No Docker Compose at Workspace Root

**Location:** `/`

`docker-compose.yml` only exists in `ai-platform/`. Frontend devs working on `ai-platform-fe` have no documented way to start backend dependencies.

**Risk:** Onboarding friction; frontend devs may not know how to run the full stack.

### L4: E2E Target `http://localhost:3000` Hardcoded

**Location:** `ai-platform-fe/playwright.config.ts`

Playwright base URL targets `http://localhost:3000`. No environment variable override documented.

**Risk:** E2E tests break in CI if port differs; no staging environment support.

---

*Last mapped: 2026-05-20*
