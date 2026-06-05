import { AiResponsePayload, AiStatusStage, KAFKA_TOPICS, LoggerService } from '@ai-platform/shared';
import { KafkaConsumerService, KafkaProducerService } from '@ai-platform/kafka';
import { Module, OnModuleInit } from '@nestjs/common';
import { ConversationService } from '../conversation/conversation.service';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { SearchModule } from '../search/search.module';
import { AiProvidersModule } from './ai-providers.module';
import { AiService } from './ai.service';
import { CapabilityDetectorService } from './capability-detector.service';

interface AiRequestPayload {
  userId: string;
  conversationId?: string;
  message: string;
}

@Module({
  imports: [EmbeddingsModule, SearchModule, AiProvidersModule],
  providers: [AiService, CapabilityDetectorService, ConversationService],
  exports: [AiService, AiProvidersModule],
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

      const subscription = this.aiService
        .processMessage({ ...value, conversationId }, { onStatus: publishStatus })
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
            const message = error instanceof Error ? error.message : String(error);
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
