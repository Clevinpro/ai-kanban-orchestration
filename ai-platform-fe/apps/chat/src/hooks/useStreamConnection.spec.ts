import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamHandlers } from './useStreamConnection';
import { useStreamConnection } from './useStreamConnection';

// Mock the SSE factory so connect() receives a controllable fake EventSource.
const { streamMessage } = vi.hoisted(() => ({ streamMessage: vi.fn() }));

vi.mock('@libs/api', () => ({
  streamMessage,
}));

// Minimal EventSource stand-in: lets the test drive onopen/onmessage directly.
class FakeEventSource {
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();

  open() {
    this.onopen?.();
  }

  emit(data: unknown) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    this.onmessage?.({ data: payload } as MessageEvent<string>);
  }
}

function makeHandlers(): StreamHandlers {
  return {
    onStatus: vi.fn(),
    onChunk: vi.fn(),
    onComplete: vi.fn(),
    onError: vi.fn(),
    onConversationId: vi.fn(),
    onAgentEvent: vi.fn(),
    onFallback: vi.fn(),
  };
}

describe('useStreamConnection', () => {
  let fakeEs: FakeEventSource;

  beforeEach(() => {
    fakeEs = new FakeEventSource();
    streamMessage.mockReset();
    streamMessage.mockReturnValue(fakeEs);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("routes an event: 'agent' payload to onAgentEvent and not to the chunk path", () => {
    const { result } = renderHook(() => useStreamConnection());
    const handlers = makeHandlers();

    act(() => {
      void result.current.connect('conv-1', handlers);
      fakeEs.open();
    });

    const agentPayload = {
      iteration: 1,
      status: 'tool_call' as const,
      tool: 'similaritySearch',
      input: 'query',
    };

    act(() => {
      fakeEs.emit({ event: 'agent', conversationId: 'conv-1', agent: agentPayload });
    });

    expect(handlers.onAgentEvent).toHaveBeenCalledTimes(1);
    expect(handlers.onAgentEvent).toHaveBeenCalledWith(agentPayload);
    // The agent payload must never leak into the plain-chunk handler.
    expect(handlers.onChunk).not.toHaveBeenCalled();
    expect(handlers.onFallback).not.toHaveBeenCalled();
  });

  it('does not call onAgentEvent when an agent event carries no body', () => {
    const { result } = renderHook(() => useStreamConnection());
    const handlers = makeHandlers();

    act(() => {
      void result.current.connect('conv-1', handlers);
      fakeEs.open();
    });

    act(() => {
      fakeEs.emit({ event: 'agent', conversationId: 'conv-1' });
    });

    expect(handlers.onAgentEvent).not.toHaveBeenCalled();
    expect(handlers.onChunk).not.toHaveBeenCalled();
  });

  it('routes a plain chunk payload to onChunk (regression: chunk path intact)', () => {
    const { result } = renderHook(() => useStreamConnection());
    const handlers = makeHandlers();

    act(() => {
      void result.current.connect('conv-1', handlers);
      fakeEs.open();
    });

    act(() => {
      fakeEs.emit({ event: 'chunk', conversationId: 'conv-1', result: 'hello' });
    });

    expect(handlers.onChunk).toHaveBeenCalledWith('hello', 'conv-1');
    expect(handlers.onAgentEvent).not.toHaveBeenCalled();
  });
});
