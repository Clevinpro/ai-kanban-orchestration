/**
 * In-memory doubles for ai-service E2E.
 *
 * ai-service has no HTTP chat endpoint: its external entry point for a chat
 * request is the Kafka `AI_REQUEST` topic. These doubles replace the real
 * Kafka/Prisma providers so an E2E can drive a real request through the booted
 * Nest DI graph (consumer -> AiModule -> AiService -> tools -> DB) and assert the
 * observable result (the `AI_RESPONSE` stream published back) and the persisted
 * side effect (the assistant Message row) — all without docker.
 */

import type { ChatMessage, MessageRole } from '@ai-platform/shared';
import { Observable } from 'rxjs';

/** A message captured by {@link FakeKafkaProducerService.publish}. */
export interface CapturedKafkaMessage {
  topic: string;
  value: unknown;
}

/**
 * Stand-in for `KafkaProducerService`. Records every published message instead
 * of talking to a broker; never opens a connection.
 */
export class FakeKafkaProducerService {
  readonly published: CapturedKafkaMessage[] = [];

  async onModuleInit(): Promise<void> {
    /* no broker connection in E2E */
  }

  async onModuleDestroy(): Promise<void> {
    /* nothing to tear down */
  }

  async publish(topic: string, message: { topic: string; value: unknown }): Promise<void> {
    this.published.push({ topic, value: message.value });
  }

  /** Every value published to `topic`, in order. */
  valuesFor<T = unknown>(topic: string): T[] {
    return this.published.filter((m) => m.topic === topic).map((m) => m.value as T);
  }
}

type SubscribeHandler = (message: { value: unknown }) => unknown;

/**
 * Stand-in for `KafkaConsumerService`. Records subscriptions and lets a spec
 * deliver a message via {@link emit}; never opens a connection.
 *
 * Unlike a fire-and-forget broker, {@link emit} awaits every subscribed
 * handler's returned promise, so an E2E can deterministically wait for the
 * AI_REQUEST run to fully settle (answer streamed + persisted) before asserting.
 */
export class FakeKafkaConsumerService {
  private readonly handlers = new Map<string, Set<SubscribeHandler>>();

  async onModuleInit(): Promise<void> {
    /* no broker connection in E2E */
  }

  async onModuleDestroy(): Promise<void> {
    /* nothing to tear down */
  }

  async subscribe<T>(topic: string, handler: (message: { value: T }) => unknown): Promise<void> {
    const set = this.handlers.get(topic) ?? new Set<SubscribeHandler>();
    set.add(handler as SubscribeHandler);
    this.handlers.set(topic, set);
  }

  unsubscribe(topic: string, handler: (message: { value: unknown }) => unknown): void {
    this.handlers.get(topic)?.delete(handler as SubscribeHandler);
  }

  /** Deliver a message to every handler on `topic` and await their completion. */
  async emit(topic: string, value: unknown): Promise<void> {
    const handlers = this.handlers.get(topic);
    if (!handlers) {
      return;
    }
    await Promise.all([...handlers].map((handler) => handler({ value })));
  }
}

/** A persisted message row captured by the prisma double. */
export interface StoredMessage {
  conversationId: string;
  role: MessageRole;
  content: string;
  runId?: string;
}

/** A seeded document the fetchDocument / tagQuery raw queries resolve against. */
export interface SeededDocument {
  title: string;
  content: string;
}

/**
 * Stand-in for `PrismaService`.
 *
 * - `conversation.create` mints a deterministic id.
 * - `message.{upsert,create,findMany}` back a simple in-memory store so the
 *   assistant turn an agent run persists is observable.
 * - `$queryRaw` resolves the seeded documents so the content tools
 *   (`fetchDocument` / `tagQuery`) return known bodies without a real database.
 *   It branches on the generated SQL: the fetchDocument projection selects a
 *   document body (`d.content` / `title, content`) and returns `{title, content}`
 *   rows; the tagQuery lookup selects titles only and returns `{title}` rows.
 */
export class FakePrismaService {
  readonly messages: StoredMessage[] = [];

  private readonly documents: SeededDocument[];
  private conversationCount = 1;

  constructor(documents: SeededDocument[] = []) {
    this.documents = documents;
  }

  conversation = {
    create: async ({ data }: { data: { userId: string; title?: string | null } }) => ({
      id: `conv-${this.conversationCount++}`,
      ...data,
    }),
  };

  message = {
    findMany: async (args: {
      where: { conversationId: string };
      orderBy: { createdAt: 'asc' | 'desc' };
      take: number;
      select: { role: true; content: true };
    }): Promise<ChatMessage[]> => {
      const rows = this.messages
        .filter((m) => m.conversationId === args.where.conversationId)
        .map((m) => ({ role: m.role, content: m.content }));
      const ordered = args.orderBy.createdAt === 'desc' ? [...rows].reverse() : rows;
      return ordered.slice(0, args.take);
    },

    create: async (args: { data: StoredMessage }): Promise<unknown> => {
      this.messages.push({ ...args.data });
      return args.data;
    },

    upsert: async (args: {
      where: { runId_role: { runId: string; role: MessageRole } };
      create: StoredMessage & { runId: string };
      update: Record<string, never>;
    }): Promise<unknown> => {
      const { runId, role } = args.where.runId_role;
      const existing = this.messages.find((m) => m.runId === runId && m.role === role);
      if (existing) {
        return existing;
      }
      this.messages.push({ ...args.create });
      return args.create;
    },
  };

  async onModuleInit(): Promise<void> {
    /* no database connection in E2E */
  }

  async onModuleDestroy(): Promise<void> {
    /* nothing to tear down */
  }

  async $connect(): Promise<void> {
    /* no-op */
  }

  async $disconnect(): Promise<void> {
    /* no-op */
  }

  /**
   * Resolve the content tools' raw queries against the seeded documents. The
   * argument is a `Prisma.Sql` whose `.strings` fragments reveal which tool
   * issued it (fetchDocument projects the body; tagQuery lookup projects titles).
   */
  async $queryRaw<T = unknown>(query: { strings?: readonly string[] }): Promise<T> {
    const sql = (query?.strings ?? []).join(' ');
    const wantsBody = /d\.content|title,\s*content/.test(sql);

    if (wantsBody) {
      return this.documents.map((d) => ({ title: d.title, content: d.content })) as unknown as T;
    }

    // tagQuery lookup / list: titles only.
    return this.documents.map((d) => ({ title: d.title })) as unknown as T;
  }
}

/** A scripted LLM provider turn: the chunks to emit for one `chat()` call. */
export type ScriptedTurn = string[];

/**
 * A deterministic `IAIProvider` whose `chat()` returns a pre-scripted sequence
 * of token chunks per planning turn. No network, no real model.
 */
export function createScriptedProvider(turns: ScriptedTurn[]): {
  chat: (messages: unknown) => Observable<string>;
  calls: unknown[][];
} {
  let turn = 0;
  const calls: unknown[][] = [];
  return {
    calls,
    chat(messages: unknown): Observable<string> {
      calls.push(messages as unknown[]);
      const chunks = turns[Math.min(turn, turns.length - 1)] ?? [];
      turn += 1;
      // Emit each chunk on a microtask, mirroring a streaming provider, so the
      // chat flow's BehaviorSubject forwards every final-answer token.
      return new Observable<string>((subscriber) => {
        let cancelled = false;
        void (async () => {
          for (const chunk of chunks) {
            await Promise.resolve();
            if (cancelled) return;
            subscriber.next(chunk);
          }
          if (!cancelled) subscriber.complete();
        })();
        return () => {
          cancelled = true;
        };
      });
    },
  };
}
