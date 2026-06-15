import { PrismaService } from '@ai-platform/database';
import { KafkaConsumerService, KafkaProducerService } from '@ai-platform/kafka';
import { AiResponsePayload, KAFKA_TOPICS, LoggerService } from '@ai-platform/shared';
import { Body, Controller, MessageEvent, Post, Query, Req, Sse, UseGuards } from '@nestjs/common';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/auth.guard';
import { ChatRequestDto } from './ai.dto';

type AuthenticatedRequest = {
  user: {
    id?: string;
    sub?: string;
  };
};

@Controller('ai')
export class AiController {
  constructor(
    private readonly kafkaProducer: KafkaProducerService,
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('chat')
  async chat(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ChatRequestDto,
  ): Promise<{ status: 'processing'; conversationId?: string }> {
    const userId = this.getUserId(req);
    const conversationId =
      dto.conversationId ?? (await this.createConversation(userId, dto.message));

    this.logger.log('AI chat request received', AiController.name, {
      userId,
      conversationId,
    });

    // Additive payload: forward agent fields only when provided so that an
    // omitted mode publishes the exact same shape as before.
    const value: Record<string, unknown> = {
      userId,
      message: dto.message,
      conversationId,
    };

    if (dto.mode !== undefined) {
      value.mode = dto.mode;
    }
    if (dto.maxIterations !== undefined) {
      value.maxIterations = dto.maxIterations;
    }
    if (dto.tokenBudget !== undefined) {
      value.tokenBudget = dto.tokenBudget;
    }
    if (dto.timeoutMs !== undefined) {
      value.timeoutMs = dto.timeoutMs;
    }

    await this.kafkaProducer.publish(KAFKA_TOPICS.AI_REQUEST, {
      topic: KAFKA_TOPICS.AI_REQUEST,
      value,
    });

    this.logger.log('AI chat request queued', AiController.name, {
      userId,
      conversationId,
    });

    return {
      status: 'processing',
      conversationId,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Sse('chat/stream')
  stream(
    @Req() req: AuthenticatedRequest,
    @Query('conversationId') streamConversationId?: string,
  ): Observable<MessageEvent> {
    const userId = this.getUserId(req);
    this.logger.log('AI chat stream opened', AiController.name, { userId, streamConversationId });

    return new Observable<MessageEvent>((subscriber) => {
      const handler = async (message: { value: AiResponsePayload }) => {
        if (message.value.userId !== userId) {
          return;
        }

        if (streamConversationId && message.value.conversationId !== streamConversationId) {
          return;
        }

        subscriber.next({
          data: JSON.stringify(message.value),
        });
      };

      void this.kafkaConsumer.subscribe<AiResponsePayload>(KAFKA_TOPICS.AI_RESPONSE, handler);

      // Cleanup: remove handler when SSE connection closes
      return () => {
        this.kafkaConsumer.unsubscribe(KAFKA_TOPICS.AI_RESPONSE, handler);
      };
    });
  }

  private getUserId(req: AuthenticatedRequest): string {
    return req.user.id ?? req.user.sub ?? '';
  }

  private async createConversation(userId: string, message: string): Promise<string> {
    const title = message.trim().slice(0, 80) || null;
    const conversation = await this.prisma.conversation.create({
      data: { userId, title },
      select: { id: true },
    });

    return conversation.id;
  }
}
