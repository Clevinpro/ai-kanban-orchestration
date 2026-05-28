import { PrismaService } from '@ai-platform/database';
import { ChatMessage, LoggerService, MessageRole } from '@ai-platform/shared';
import { Inject, Injectable } from '@nestjs/common';

const MAX_HISTORY_MESSAGES = 10;

type ConversationPrismaClient = {
  message: {
    findMany(args: {
      where: { conversationId: string };
      orderBy: { createdAt: 'asc' };
      take: number;
      select: { role: true; content: true };
    }): Promise<ChatMessage[]>;
    create(args: {
      data: { conversationId: string; role: MessageRole; content: string };
    }): Promise<unknown>;
  };
  conversation: {
    create(args: {
      data: { userId: string; title?: string };
      select: { id: true };
    }): Promise<{ id: string }>;
  };
};

@Injectable()
export class ConversationService {
  constructor(
    @Inject(PrismaService)
    private readonly prismaService: ConversationPrismaClient,
    private readonly logger: LoggerService,
  ) {}

  async loadHistory(conversationId: string): Promise<ChatMessage[]> {
    const messages = await this.prismaService.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: MAX_HISTORY_MESSAGES,
      select: { role: true, content: true },
    });

    this.logger.log(
      `Loaded history: conversationId=${conversationId}, count=${messages.length}`,
      'ConversationService',
    );

    return messages;
  }

  async saveMessage(params: {
    conversationId: string;
    role: MessageRole;
    content: string;
  }): Promise<void> {
    await this.prismaService.message.create({
      data: {
        conversationId: params.conversationId,
        role: params.role,
        content: params.content,
      },
    });
  }

  async createConversation(userId: string, title?: string): Promise<string> {
    const conversation = await this.prismaService.conversation.create({
      data: { userId, title },
      select: { id: true },
    });
    return conversation.id;
  }
}
