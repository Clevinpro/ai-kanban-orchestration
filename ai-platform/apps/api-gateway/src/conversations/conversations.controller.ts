import { PrismaService } from '@ai-platform/database';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CreateConversationDto } from './dto/create-conversation.dto';

type AuthenticatedRequest = {
  user: {
    id?: string;
    sub?: string;
    userId?: string;
  };
};

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly prisma: PrismaService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    const userId = this.getUserId(req);
    const rows = await this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: 'asc' },
          select: { content: true },
        },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      messageCount: r._count.messages,
      preview: r.messages[0]?.content?.slice(0, 80) ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = this.getUserId(req);
    const row = await this.prisma.conversation.findFirst({
      where: { id, userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, role: true, content: true, createdAt: true },
        },
      },
    });

    if (!row) {
      throw new NotFoundException();
    }

    return {
      conversation: {
        id: row.id,
        title: row.title,
        userId: row.userId,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
      messages: row.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateConversationDto) {
    const userId = this.getUserId(req);
    const title = dto.title.trim() === '' ? null : dto.title.trim();
    const row = await this.prisma.conversation.create({
      data: { userId, title },
    });

    return {
      id: row.id,
      title: row.title,
      userId: row.userId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = this.getUserId(req);
    await this.prisma.conversation.deleteMany({
      where: { id, userId },
    });
  }

  private getUserId(req: AuthenticatedRequest): string {
    return req.user.id ?? req.user.sub ?? req.user.userId ?? '';
  }
}
