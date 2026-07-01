/**
 * Reusable supertest E2E harness.
 *
 * Boots a Nest app from a root module via `Test.createTestingModule`, replaces
 * external infra providers (Prisma / Kafka / Redis) with in-memory doubles, and
 * applies the same global config as `main.ts` (global prefix + ValidationPipe)
 * so specs exercise the REAL HTTP layer, DI graph and validation without docker.
 *
 * Usage (see `ai/ai.e2e-spec.ts` for a full example):
 *
 *   const ctx = await bootE2EApp({
 *     module: AppModule,
 *     overrides: [
 *       { provide: PrismaService, useValue: prisma },
 *       { provide: KafkaProducerService, useValue: producer },
 *     ],
 *   });
 *   await request(ctx.httpServer).get('/api/health').expect(200);
 *   await ctx.close();
 *
 * Reuse note: the harness is app-agnostic — ai-service passes its own AppModule
 * and overrides. `applyGlobals` defaults to api-gateway's bootstrap config; pass
 * a custom one if another app configures its Nest instance differently.
 */
import type { INestApplication, Type } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import type { ModuleMetadata } from '@nestjs/common/interfaces';
import type { TestingModuleBuilder } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';

/** One provider replacement applied via `.overrideProvider(provide).useValue(useValue)`. */
export interface ProviderOverride {
  provide: unknown;
  useValue: unknown;
}

/** One guard replacement applied via `.overrideGuard(guard).useValue(useValue)`. */
export interface GuardOverride {
  guard: unknown;
  useValue: unknown;
}

export interface BootE2EOptions {
  /** Root module to boot (e.g. AppModule). */
  module: Type<unknown> | (ModuleMetadata & { module?: unknown });
  /** External-infra doubles to swap in for the real providers. */
  overrides?: ProviderOverride[];
  /** Guard replacements (e.g. a JWT guard that injects a fixed test user). */
  guards?: GuardOverride[];
  /**
   * Applies the same global config as production bootstrap. Defaults to the
   * api-gateway setup (`/api` prefix + whitelist/transform ValidationPipe).
   */
  applyGlobals?: (app: INestApplication) => void;
}

export interface E2EContext {
  app: INestApplication;
  /** Pass to `supertest`'s `request(...)`. */
  httpServer: Server;
  close: () => Promise<void>;
}

/** Mirrors `apps/api-gateway/src/main.ts` global config. */
function defaultApplyGlobals(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
}

export async function bootE2EApp(options: BootE2EOptions): Promise<E2EContext> {
  const { module, overrides = [], guards = [], applyGlobals = defaultApplyGlobals } = options;

  let builder: TestingModuleBuilder = Test.createTestingModule(
    typeof module === 'function' ? { imports: [module] } : module,
  );

  for (const override of overrides) {
    builder = builder.overrideProvider(override.provide).useValue(override.useValue);
  }

  for (const override of guards) {
    builder = builder.overrideGuard(override.guard).useValue(override.useValue);
  }

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  applyGlobals(app);
  await app.init();

  return {
    app,
    httpServer: app.getHttpServer() as Server,
    close: () => app.close(),
  };
}
