import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentEvent } from '@libs/api';
import type { StreamHandlers } from './useStreamConnection';
import { useChat } from './useChat';

// --- @libs/api mocks --------------------------------------------------------

const { sendMessage, cancelMessage, pendingStreamStubs } = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  cancelMessage: vi.fn(),
  pendingStreamStubs: {
    savePendingStream: vi.fn(),
    clearPendingStream: vi.fn(),
    readPendingStream: vi.fn(() => null),
    isPendingStreamExpired: vi.fn(() => false),
    hasAssistantResponseForLatestUser: vi.fn(() => false),
    getElapsedSeconds: vi.fn(() => 0),
  },
}));

vi.mock('@libs/api', () => ({
  sendMessage,
  cancelMessage,
  ...pendingStreamStubs,
}));

// --- @libs/store mocks ------------------------------------------------------

vi.mock('@libs/store', () => ({
  queryKeys: {
    conversations: {
      all: ['conversations'],
      one: (id: string) => ['conversations', id],
    },
  },
  useConversation: () => ({ data: undefined, isLoading: false }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

// --- Sub-hook mocks ---------------------------------------------------------

// Capture the handlers passed to connect() so the test can drive stream events.
let capturedHandlers: StreamHandlers | null = null;
const connect = vi.fn((_convId: string | null, handlers: StreamHandlers) => {
  capturedHandlers = handlers;
  return Promise.resolve();
});
const disconnect = vi.fn();
const startIdleTimeout = vi.fn(() => () => undefined);

vi.mock('./useStreamConnection', () => ({
  useStreamConnection: () => ({ connect, disconnect, startIdleTimeout }),
}));

vi.mock('./useStatusQueue', () => ({
  useStatusQueue: () => ({ enqueue: vi.fn(), cancel: vi.fn() }),
}));

describe('useChat', () => {
  beforeEach(() => {
    capturedHandlers = null;
    connect.mockClear();
    disconnect.mockClear();
    startIdleTimeout.mockClear();
    sendMessage.mockReset();
    sendMessage.mockResolvedValue({ status: 'processing', conversationId: 'conv-1' });
    cancelMessage.mockReset();
    cancelMessage.mockResolvedValue(undefined);
    pendingStreamStubs.readPendingStream.mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('accumulates agent events into steps, toolCalls, and budget', async () => {
    const { result } = renderHook(() => useChat('conv-1'));

    await act(async () => {
      await result.current.sendMessage('do work', { maxIterations: 5 });
    });

    expect(capturedHandlers).not.toBeNull();

    const toolCall: AgentEvent = {
      iteration: 1,
      status: 'tool_call',
      tool: 'similaritySearch',
      input: 'query',
      budget: {
        iteration: 1,
        tokensUsed: 100,
        elapsedMs: 500,
        maxIterations: 5,
        tokenBudget: 4000,
        timeoutMs: 30000,
      },
    };
    const toolResult: AgentEvent = {
      iteration: 1,
      status: 'tool_result',
      tool: 'similaritySearch',
      input: 'matched docs',
    };

    act(() => {
      capturedHandlers?.onAgentEvent(toolCall);
      capturedHandlers?.onAgentEvent(toolResult);
    });

    expect(result.current.steps).toHaveLength(2);
    expect(result.current.budget?.tokensUsed).toBe(100);
    // tool_call + tool_result for the same iteration/tool collapse into one entry.
    expect(result.current.toolCalls).toHaveLength(1);
    expect(result.current.toolCalls[0]).toMatchObject({
      tool: 'similaritySearch',
      input: 'query',
      output: 'matched docs',
      status: 'tool_result',
    });

    // Forwarded safeguard limits reach the API.
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'do work', maxIterations: 5 }),
    );
  });

  it('stop() calls cancelMessage and tears down cleanly', async () => {
    const { result } = renderHook(() => useChat('conv-1'));

    await act(async () => {
      await result.current.sendMessage('do work');
    });

    expect(result.current.streaming).toBe(true);

    await act(async () => {
      await result.current.stop();
    });

    expect(cancelMessage).toHaveBeenCalledWith('conv-1');
    expect(disconnect).toHaveBeenCalled();
    await waitFor(() => expect(result.current.streaming).toBe(false));
  });

  it('regression: a plain chat with no limits and no agent events behaves as today', async () => {
    const { result } = renderHook(() => useChat('conv-1'));

    await act(async () => {
      await result.current.sendMessage('hello');
    });

    // No safeguard limits are forwarded when none are supplied.
    expect(sendMessage).toHaveBeenCalledWith({ message: 'hello', conversationId: 'conv-1' });
    expect(sendMessage.mock.calls[0][0]).not.toHaveProperty('maxIterations');

    // Drive a normal status -> chunk -> complete sequence with no agent events.
    act(() => {
      capturedHandlers?.onChunk('hi there', 'conv-1');
    });

    act(() => {
      capturedHandlers?.onComplete('conv-1');
    });

    // Agent panels stay empty for a plain answer.
    expect(result.current.steps).toEqual([]);
    expect(result.current.toolCalls).toEqual([]);
    expect(result.current.budget).toBeNull();

    const assistant = result.current.messages.find((m) => m.role === 'assistant');
    expect(assistant?.content).toBe('hi there');
    await waitFor(() => expect(result.current.streaming).toBe(false));
  });
});
