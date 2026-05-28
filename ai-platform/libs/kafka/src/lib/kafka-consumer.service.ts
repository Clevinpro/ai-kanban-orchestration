import { IKafkaMessage, IKafkaModuleConfig, KafkaMessageHandler } from '@ai-platform/shared';
import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Consumer, Kafka } from 'kafkajs';
import { KAFKA_MODULE_CONFIG } from './kafka.constants';

function topicSetsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const x of a) {
    if (!b.has(x)) {
      return false;
    }
  }
  return true;
}

// How long (ms) the consumer can go without a heartbeat before Kafka removes it.
// Must exceed the slowest possible LLM response time (e.g. 5 min for local models).
const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const HEARTBEAT_INTERVAL_MS = 10_000; // 10 seconds

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private kafka!: Kafka;
  private consumer!: Consumer;
  private readonly handlersByTopic = new Map<string, Set<KafkaMessageHandler<unknown>>>();
  private activeSubscriptionTopics = new Set<string>();
  private isRunning = false;

  constructor(
    @Inject(KAFKA_MODULE_CONFIG)
    private readonly config: IKafkaModuleConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    this.kafka = new Kafka({
      clientId: `${this.config.clientId}-consumer`,
      brokers: this.config.brokers,
    });
    this.consumer = this.kafka.consumer({
      groupId: this.config.groupId,
      sessionTimeout: SESSION_TIMEOUT_MS,
      heartbeatInterval: HEARTBEAT_INTERVAL_MS,
    });
    await this.consumer.connect();
  }

  async subscribe<T>(topic: string, handler: KafkaMessageHandler<T>): Promise<void> {
    let handlers = this.handlersByTopic.get(topic);
    if (!handlers) {
      handlers = new Set<KafkaMessageHandler<unknown>>();
      this.handlersByTopic.set(topic, handlers);
    }
    handlers.add(handler as KafkaMessageHandler<unknown>);

    const desiredTopics = new Set(this.handlersByTopic.keys());
    if (topicSetsEqual(desiredTopics, this.activeSubscriptionTopics)) {
      return;
    }

    await this.applySubscription([...desiredTopics]);
  }

  unsubscribe<T>(topic: string, handler: KafkaMessageHandler<T>): void {
    this.handlersByTopic.get(topic)?.delete(handler as KafkaMessageHandler<unknown>);
  }

  private async applySubscription(topics: string[]): Promise<void> {
    if (topics.length === 0) {
      return;
    }

    if (this.isRunning) {
      await this.consumer.stop();
      this.isRunning = false;
    }

    await this.consumer.subscribe({ topics, fromBeginning: false });
    this.activeSubscriptionTopics = new Set(topics);
    this.isRunning = true;

    void this.consumer
      .run({
        eachMessage: async ({ topic, message }) => {
          const handlers = this.handlersByTopic.get(topic);
          if (!handlers || handlers.size === 0) {
            return;
          }

          let parsed: unknown;
          try {
            parsed = JSON.parse(message.value?.toString() ?? 'null');
          } catch {
            return;
          }

          const payload: IKafkaMessage<unknown> = { topic, value: parsed };
          for (const h of handlers) {
            try {
              await h(payload);
            } catch {
              // Handler threw (e.g. stale SSE subscriber) — remove it and continue
              handlers.delete(h);
            }
          }
        },
      })
      .catch(() => {
        this.isRunning = false;
      });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.isRunning) {
      await this.consumer.stop();
      this.isRunning = false;
    }
    await this.consumer?.disconnect();
  }
}
