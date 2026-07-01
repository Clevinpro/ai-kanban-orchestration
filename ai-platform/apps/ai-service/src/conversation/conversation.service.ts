import { PrismaService } from '@ai-platform/database';
import { ChatMessage, LoggerService, MessageRole } from '@ai-platform/shared';
import { Inject, Injectable } from '@nestjs/common';

const MAX_HISTORY_MESSAGES = 10;

type ConversationPrismaClient = {
  message: {
    findMany(args: {
      where: { conversationId: string };
      orderBy: { createdAt: 'asc' | 'desc' };
      take: number;
      select: { role: true; content: true };
    }): Promise<ChatMessage[]>;
    create(args: {
      data: {
        conversationId: string;
        role: MessageRole;
        content: string;
        runId?: string;
      };
    }): Promise<unknown>;
    upsert(args: {
      where: { runId_role: { runId: string; role: MessageRole } };
      create: {
        conversationId: string;
        role: MessageRole;
        content: string;
        runId: string;
      };
      update: Record<string, never>;
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
    // Load the newest MAX_HISTORY_MESSAGES (desc), then reverse to chronological
    // (oldest->newest) order so the planner receives the live tail in natural order.
    const messages = await this.prismaService.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: MAX_HISTORY_MESSAGES,
      select: { role: true, content: true },
    });

    const chronological = messages.reverse();

    this.logger.log(
      `Loaded history: conversationId=${conversationId}, count=${chronological.length}`,
      'ConversationService',
    );

    return chronological;
  }

  async saveMessage(params: {
    conversationId: string;
    role: MessageRole;
    content: string;
    /**
     * Optional run correlation id. When supplied, the write is idempotent:
     * keyed on the (runId, role) unique constraint so a redelivered run
     * upserts a no-op/update instead of creating a duplicate row.
     */
    runId?: string;
  }): Promise<void> {
    const { conversationId, role, content, runId } = params;

    if (runId !== undefined) {
      await this.prismaService.message.upsert({
        where: { runId_role: { runId, role } },
        create: { conversationId, role, content, runId },
        update: {},
      });
      return;
    }

    await this.prismaService.message.create({
      data: { conversationId, role, content },
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
