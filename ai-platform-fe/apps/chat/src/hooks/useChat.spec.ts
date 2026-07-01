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
// Capture the give-up callback passed to startIdleTimeout so a test can fire it
// to simulate the bounded reconnect window elapsing with no stream events.
let capturedIdleTimeout: (() => void) | null = null;
const startIdleTimeout = vi.fn((onTimeout: () => void) => {
  capturedIdleTimeout = onTimeout;
  return () => undefined;
});

vi.mock('./useStreamConnection', () => ({
  useStreamConnection: () => ({ connect, disconnect, startIdleTimeout }),
}));

vi.mock('./useStatusQueue', () => ({
  useStatusQueue: () => ({ enqueue: vi.fn(), cancel: vi.fn() }),
}));

describe('useChat', () => {
  beforeEach(() => {
    capturedHandlers = null;
    capturedIdleTimeout = null;
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

  it('newChat() resets in-flight state so sendMessage works immediately', async () => {
    const { result } = renderHook(() => useChat('conv-1'));

    // First send leaves the stream in-flight (no complete/error driven).
    await act(async () => {
      await result.current.sendMessage('first message');
    });
    expect(result.current.streaming).toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(1);

    // New Chat must tear down the in-flight stream and clear the prior marker.
    act(() => {
      result.current.newChat();
    });
    expect(result.current.streaming).toBe(false);
    expect(disconnect).toHaveBeenCalled();
    expect(pendingStreamStubs.clearPendingStream).toHaveBeenCalledWith('conv-1');
    expect(result.current.messages).toEqual([]);

    // The next send is NOT early-returned: it reaches the API again.
    await act(async () => {
      await result.current.sendMessage('second message');
    });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: 'second message' }),
    );
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

  it('completes with no streamed content: empty bubble becomes a terminal notice, not a stuck "thinking"', async () => {
    const { result } = renderHook(() => useChat('conv-1'));

    await act(async () => {
      await result.current.sendMessage('say something');
    });

    // The run completes without ever delivering a chunk (backend streamed an
    // empty final answer). The assistant placeholder must not stay empty.
    act(() => {
      capturedHandlers?.onComplete('conv-1');
    });

    const assistant = result.current.messages.find((m) => m.role === 'assistant');
    expect(assistant?.content.trim().length).toBeGreaterThan(0);
    expect(assistant?.content).toMatch(/empty response/i);
    expect(assistant?.status).toBeUndefined();
    await waitFor(() => expect(result.current.streaming).toBe(false));
  });

  it('reconnect give-up transitions to a terminal run-ended state and releases inFlight', async () => {
    // A pending stream for this conversation triggers the reconnect effect.
    // clearPendingStream must make subsequent reads return null so the reconnect
    // effect does not immediately re-attach after give-up (mirrors real storage).
    pendingStreamStubs.readPendingStream.mockReturnValue({
      conversationId: 'conv-1',
      createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    });
    pendingStreamStubs.clearPendingStream.mockImplementation(() => {
      pendingStreamStubs.readPendingStream.mockReturnValue(null);
    });

    const { result } = renderHook(() => useChat('conv-1'));

    // The reconnect effect attached and registered a give-up callback while it
    // streams an empty "Reconnecting to stream..." placeholder.
    await waitFor(() => expect(capturedIdleTimeout).not.toBeNull());
    expect(result.current.streaming).toBe(true);
    const placeholder = result.current.messages.find((m) => m.role === 'assistant');
    expect(placeholder?.status).toBe('Reconnecting to stream...');
    expect(placeholder?.content).toBe('');

    // Simulate the bounded window elapsing with no stream events.
    act(() => {
      capturedIdleTimeout?.();
    });

    // Terminal state: inFlight released (input re-enabled), pending marker
    // cleared, and the empty placeholder replaced by a run-ended message.
    await waitFor(() => expect(result.current.streaming).toBe(false));
    expect(pendingStreamStubs.clearPendingStream).toHaveBeenCalledWith('conv-1');

    expect(result.current.messages.some((m) => m.role === 'assistant' && m.content === '')).toBe(
      false,
    );
    const terminal = result.current.messages.find((m) => m.role === 'system');
    expect(terminal?.content).toMatch(/ended or timed out/i);

    // Input is usable again: a fresh send reaches the API rather than being
    // early-returned by a stuck inFlightRef.
    await act(async () => {
      await result.current.sendMessage('retry now');
    });
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'retry now', conversationId: 'conv-1' }),
    );
  });
});
