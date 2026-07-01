import type { MessageRole } from '@ai-platform/shared';
import { ConversationService } from './conversation.service';

const ASSISTANT: MessageRole = 'assistant';
const USER: MessageRole = 'user';

// ---------------------------------------------------------------------------
// Fake Prisma client emulating the (runId, role) unique constraint, so we can
// prove saveMessage is idempotent on redelivery without a real database.
// ---------------------------------------------------------------------------

interface StoredMessage {
  conversationId: string;
  role: MessageRole;
  content: string;
  runId: string | null;
}

function makeFakePrisma() {
  const rows: StoredMessage[] = [];

  return {
    rows,
    message: {
      findMany: jest.fn(),
      create: jest.fn(
        async (args: {
          data: { conversationId: string; role: MessageRole; content: string; runId?: string };
        }) => {
          const { conversationId, role, content, runId } = args.data;
          rows.push({ conversationId, role, content, runId: runId ?? null });
          return {};
        },
      ),
      upsert: jest.fn(
        async (args: {
          where: { runId_role: { runId: string; role: MessageRole } };
          create: { conversationId: string; role: MessageRole; content: string; runId: string };
          update: Record<string, never>;
        }) => {
          const { runId, role } = args.where.runId_role;
          const existing = rows.find((r) => r.runId === runId && r.role === role);
          if (existing) {
            // update is a no-op ({}), matching the service contract
            return existing;
          }
          const { conversationId, content } = args.create;
          const created: StoredMessage = { conversationId, role, content, runId };
          rows.push(created);
          return created;
        },
      ),
    },
    conversation: { create: jest.fn() },
  };
}

const stubLogger = { log: jest.fn() } as never;

describe('ConversationService.saveMessage', () => {
  it('upserts keyed on (runId, role) and writes exactly one row across redelivery', async () => {
    const prisma = makeFakePrisma();
    const service = new ConversationService(prisma as never, stubLogger);

    const params = {
      conversationId: 'conv-1',
      role: ASSISTANT,
      content: 'final answer',
      runId: 'run-123',
    };

    await service.saveMessage(params);
    await service.saveMessage(params);

    expect(prisma.message.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(prisma.rows).toHaveLength(1);
    expect(prisma.rows[0]).toEqual({
      conversationId: 'conv-1',
      role: ASSISTANT,
      content: 'final answer',
      runId: 'run-123',
    });
    expect(prisma.message.upsert).toHaveBeenCalledWith({
      where: { runId_role: { runId: 'run-123', role: ASSISTANT } },
      create: {
        conversationId: 'conv-1',
        role: ASSISTANT,
        content: 'final answer',
        runId: 'run-123',
      },
      update: {},
    });
  });

  it('persists runId to the column when supplied', async () => {
    const prisma = makeFakePrisma();
    const service = new ConversationService(prisma as never, stubLogger);

    await service.saveMessage({
      conversationId: 'conv-1',
      role: USER,
      content: 'hello',
      runId: 'run-abc',
    });

    expect(prisma.rows[0].runId).toBe('run-abc');
  });

  it('falls back to create (one row, no throw) when runId is undefined', async () => {
    const prisma = makeFakePrisma();
    const service = new ConversationService(prisma as never, stubLogger);

    await expect(
      service.saveMessage({
        conversationId: 'conv-1',
        role: USER,
        content: 'hello',
      }),
    ).resolves.toBeUndefined();

    expect(prisma.message.create).toHaveBeenCalledTimes(1);
    expect(prisma.message.upsert).not.toHaveBeenCalled();
    expect(prisma.rows).toHaveLength(1);
    expect(prisma.rows[0].runId).toBeNull();
  });
});

describe('ConversationService.loadHistory', () => {
  it('queries newest MAX_HISTORY_MESSAGES (desc, take 10) and returns them oldest->newest', async () => {
    const prisma = makeFakePrisma();
    const service = new ConversationService(prisma as never, stubLogger);

    // 15 messages, content "m1".."m15" stored newest-first as the DB would return
    // for orderBy createdAt desc + take 10 (i.e. m15..m6).
    const newestFirst = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? ASSISTANT : USER,
      content: `m${15 - i}`,
    }));
    prisma.message.findMany.mockResolvedValueOnce([...newestFirst]);

    const result = await service.loadHistory('conv-1');

    // (a) selected the newest 10 via desc + take 10
    expect(prisma.message.findMany).toHaveBeenCalledWith({
      where: { conversationId: 'conv-1' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { role: true, content: true },
    });

    // (b) returned in chronological (oldest->newest) order: m6..m15
    expect(result).toHaveLength(10);
    expect(result.map((m) => m.content)).toEqual([
      'm6',
      'm7',
      'm8',
      'm9',
      'm10',
      'm11',
      'm12',
      'm13',
      'm14',
      'm15',
    ]);
    // guard against re-introducing the asc+take bug (oldest tail would start at m1)
    expect(result[0].content).not.toBe('m1');
  });
});
