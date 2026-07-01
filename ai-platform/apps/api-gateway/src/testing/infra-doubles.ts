/**
 * In-memory doubles for external infrastructure (Kafka, Prisma, Redis).
 *
 * These replace the real provider implementations during E2E so the booted Nest
 * app exercises the real HTTP layer, DI graph and validation pipes without ever
 * touching docker-backed infra. Each double records what the app asked it to do
 * so specs can assert side effects (e.g. the exact Kafka payload published).
 *
 * Reuse note: these are framework-agnostic plain objects. ai-service can import
 * the same doubles and extend `FakePrismaService` with whatever model methods
 * its controllers touch.
 */

/** A single message captured by {@link FakeKafkaProducerService.publish}. */
export interface CapturedKafkaMessage {
  topic: string;
  message: { topic: string; key?: string; value: unknown };
}

/**
 * Stand-in for `KafkaProducerService`. Captures every published message instead
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

  async publish(
    topic: string,
    message: { topic: string; key?: string; value: unknown },
  ): Promise<void> {
    this.published.push({ topic, message });
  }

  /** Convenience: the last value published to `topic`, or undefined. */
  lastValueFor(topic: string): unknown {
    for (let i = this.published.length - 1; i >= 0; i -= 1) {
      if (this.published[i].topic === topic) {
        return this.published[i].message.value;
      }
    }
    return undefined;
  }
}

type SubscribeHandler = (message: { value: unknown }) => unknown;

/**
 * Stand-in for `KafkaConsumerService`. Records subscriptions and lets a spec
 * push a message to subscribers via {@link emit}; never opens a connection.
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

  /** Test helper: deliver a message to every handler subscribed to `topic`. */
  emit(topic: string, value: unknown): void {
    this.handlers.get(topic)?.forEach((handler) => handler({ value }));
  }
}

/**
 * Stand-in for `PrismaService`. Provides just enough surface for E2E specs and
 * skips `$connect`. Per-model methods are seeded by callers via {@link with};
 * by default `conversation.create` returns a deterministic id so the AI chat
 * endpoint can mint a conversation without a database.
 */
export class FakePrismaService {
  conversation = {
    create: async ({ data }: { data: { userId: string; title: string | null } }) => ({
      id: `conv-${this.createCount++}`,
      ...data,
    }),
  };

  private createCount = 1;

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
}
