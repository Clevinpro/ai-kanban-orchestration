import { PrismaService } from '@ai-platform/database';
import {
  AgentEvent,
  AiResponsePayload,
  AiStatusStage,
  KAFKA_TOPICS,
  LoggerService,
} from '@ai-platform/shared';
import { KafkaConsumerService, KafkaProducerService } from '@ai-platform/kafka';
import { Module, OnModuleInit } from '@nestjs/common';
import { ConversationService } from '../conversation/conversation.service';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { SearchModule } from '../search/search.module';
import { SearchService } from '../search/search.service';
import { AiProvidersModule } from './ai-providers.module';
import { AiService } from './ai.service';
import { CapabilityDetectorService } from './capability-detector.service';
import { QueryRouterService } from './query-router.service';
import { isSafeguardError } from './safeguards/errors';
import { createRagSearchTool } from './tools/rag-search.tool';
import { createTagQueryTool } from './tools/tag-query.tool';
import { ToolRegistry } from './tools/tool-registry';

interface AiRequestPayload {
  userId: string;
  conversationId?: string;
  message: string;
  // Agent-mode controls forwarded to AiService.processMessage. When `mode` is
  // omitted or 'chat' the existing chat path is taken with no agent events.
  mode?: 'chat' | 'agent';
  maxIterations?: number;
  tokenBudget?: number;
  timeoutMs?: number;
}

/**
 * Payload for the `AI_CANCEL` topic. Keyed by `conversationId`; the consumer
 * looks up the active agent run's kill switch and trips it. `userId` is optional
 * metadata kept consistent with the gateway cancel producer (out of scope here).
 */
interface AiCancelPayload {
  conversationId: string;
  userId?: string;
}

@Module({
  imports: [EmbeddingsModule, SearchModule, AiProvidersModule],
  providers: [
    AiService,
    CapabilityDetectorService,
    ConversationService,
    QueryRouterService,
    {
      // Singleton ToolRegistry, populated at construction. The factory runs
      // exactly once for this provider, so each tool is registered exactly
      // once — no duplicate-registration risk. SearchService is injected from
      // the imported SearchModule; PrismaService comes from the global
      // DatabaseModule (loaded by AppModule / SearchModule).
      provide: ToolRegistry,
      useFactory: (
        searchService: SearchService,
        prismaService: PrismaService,
      ): ToolRegistry => {
        const registry = new ToolRegistry();
        registry.register(createRagSearchTool(searchService));
        registry.register(createTagQueryTool(prismaService));
        return registry;
      },
      inject: [SearchService, PrismaService],
    },
  ],
  // ToolRegistry is exported so AiService can inject it.
  exports: [AiService, AiProvidersModule, ToolRegistry],
})
export class AiModule implements OnModuleInit {
  constructor(
    private readonly aiService: AiService,
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly logger: LoggerService,
    private readonly conversationService: ConversationService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.kafkaConsumer.subscribe<AiRequestPayload>(
      KAFKA_TOPICS.AI_REQUEST,
      async ({ value }) => {
        try {
          let conversationId = value.conversationId;
          if (!conversationId) {
            this.logger.warn('AI_REQUEST received without conversationId', 'AiModule');
            conversationId = await this.conversationService.createConversation(value.userId);
          }

          this.logger.log(
            `Kafka AI_REQUEST: userId=${value.userId}, conversationId=${conversationId}, messageLength=${value.message?.length ?? 0}`,
            'AiModule',
          );
          await this.streamAiResponse(value, conversationId);
        } catch (error) {
          this.logger.error(
            error instanceof Error ? error.message : String(error),
            error instanceof Error ? error.stack : undefined,
            'AiModule',
          );
        }
      },
    );

    await this.kafkaConsumer.subscribe<AiCancelPayload>(KAFKA_TOPICS.AI_CANCEL, async ({ value }) =>
      this.handleCancel(value),
    );
  }

  /**
   * Handle an `AI_CANCEL` message: look up the active agent run by
   * `conversationId` and trip its kill switch so the loop aborts at its next
   * `checkpoint()` with a `KillSwitchTrippedError`, surfacing as an `error`
   * event. An unknown or already-finished `conversationId` is a safe no-op
   * (logged, never thrown) so the consumer never drops this handler. Chat-mode
   * runs register no kill switch and are therefore unaffected.
   */
  private handleCancel(value: AiCancelPayload): void {
    const conversationId = value?.conversationId;
    if (typeof conversationId !== 'string' || conversationId.length === 0) {
      this.logger.warn('AI_CANCEL received without conversationId', 'AiModule');
      return;
    }

    const killSwitch = this.aiService.getKillSwitch(conversationId);
    if (!killSwitch) {
      // No active agent run for this conversation: unknown id, already-finished
      // run, or a chat-mode run that registers no switch. Safe no-op.
      this.logger.warn(
        `AI_CANCEL ignored: no active agent run for conversationId=${conversationId}`,
        'AiModule',
      );
      return;
    }

    killSwitch.kill();
    this.logger.log(
      `AI_CANCEL: tripped kill switch for conversationId=${conversationId}`,
      'AiModule',
    );
  }

  private streamAiResponse(value: AiRequestPayload, conversationId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let result = '';
      let publishQueue = Promise.resolve();

      const publishResponse = (payload: AiResponsePayload) => {
        publishQueue = publishQueue.then(() =>
          this.kafkaProducer.publish(KAFKA_TOPICS.AI_RESPONSE, {
            topic: KAFKA_TOPICS.AI_RESPONSE,
            value: payload,
          }),
        );

        return publishQueue;
      };

      const publishStatus = (stage: AiStatusStage, message: string) => {
        void publishResponse({
          userId: value.userId,
          conversationId,
          event: 'status',
          stage,
          message,
        });
      };

      // Agent-run progress is serialized through the same publishQueue as chunks
      // so step/budget events stay deterministically ordered relative to the
      // final answer tokens.
      const publishAgentEvent = (agent: AgentEvent) => {
        void publishResponse({
          userId: value.userId,
          conversationId,
          event: 'agent',
          agent,
        });
      };

      const subscription = this.aiService
        .processMessage(
          { ...value, conversationId },
          { onStatus: publishStatus, onAgentEvent: publishAgentEvent },
        )
        .subscribe({
          next: (chunk) => {
            if (!chunk) {
              return;
            }

            result += chunk;
            void publishResponse({
              userId: value.userId,
              conversationId,
              event: 'chunk',
              result: chunk,
            });
          },
          complete: () => {
            void publishResponse({
              userId: value.userId,
              conversationId,
              event: 'complete',
            })
              .then(() => {
                this.logger.log(
                  `Kafka AI_RESPONSE stream complete: userId=${value.userId}, conversationId=${conversationId}, resultLength=${result.length}`,
                  'AiModule',
                );
                resolve();
              })
              .catch(reject);
          },
          error: (error: unknown) => {
            // Surface the typed safeguard discriminator (e.g. 'token_budget')
            // as the error string when the run was aborted by a safeguard;
            // otherwise fall back to the error message.
            const message = isSafeguardError(error)
              ? error.reason
              : error instanceof Error
                ? error.message
                : String(error);
            void publishResponse({
              userId: value.userId,
              conversationId,
              event: 'error',
              error: message,
            })
              .then(() => reject(error))
              .catch(reject);
          },
        });

      publishQueue.catch((error) => {
        subscription.unsubscribe();
        reject(error);
      });
    });
  }
}
