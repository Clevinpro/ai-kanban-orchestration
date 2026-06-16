import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentBudget, AgentEvent } from '@libs/api';
import type { ToolCall } from '../hooks/useChat';
import { ChatPage } from './chat';

// --- Hook / store mocks -----------------------------------------------------

const sendMessage = vi.fn();
const stop = vi.fn();

type ChatState = {
  messages: unknown[];
  streaming: boolean;
  loadingHistory: boolean;
  steps: AgentEvent[];
  toolCalls: ToolCall[];
  budget: AgentBudget | null;
};

let chatState: ChatState;

vi.mock('../hooks/useChat', () => ({
  useChat: () => ({
    ...chatState,
    sendMessage,
    stop,
  }),
}));

vi.mock('../hooks/useScrollToBottom', () => ({
  useScrollToBottom: () => ({ current: null }),
}));

vi.mock('@libs/store', () => ({
  useActiveConversation: () => ({
    activeId: null,
    selectConversation: vi.fn(),
    clearActiveConversation: vi.fn(),
  }),
  useConversations: () => ({ data: [], isPending: false }),
  useDeleteConversation: () => ({ mutate: vi.fn() }),
}));

// antd components need ResizeObserver / matchMedia, which jsdom lacks.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

beforeEach(() => {
  sendMessage.mockReset();
  stop.mockReset();
  chatState = {
    messages: [],
    streaming: false,
    loadingHistory: false,
    steps: [],
    toolCalls: [],
    budget: null,
  };
});

afterEach(() => {
  cleanup();
});

describe('ChatPage', () => {
  it('renders limit inputs and no mode toggle', () => {
    render(<ChatPage />);

    fireEvent.click(screen.getByText('Limits (optional)'));

    expect(screen.getByLabelText('Max iterations')).toBeInTheDocument();
    expect(screen.getByLabelText('Token budget')).toBeInTheDocument();
    expect(screen.getByLabelText('Timeout (ms)')).toBeInTheDocument();
    expect(screen.queryByText(/mode/i)).not.toBeInTheDocument();
  });

  it('sends a plain message with no limits when none are set', () => {
    render(<ChatPage />);

    fireEvent.change(screen.getByPlaceholderText('Type a message...'), {
      target: { value: 'hello' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(sendMessage).toHaveBeenCalledWith('hello', undefined);
  });

  it('forwards only the limits the user set', () => {
    render(<ChatPage />);

    fireEvent.click(screen.getByText('Limits (optional)'));
    fireEvent.change(screen.getByLabelText('Max iterations'), { target: { value: '5' } });

    fireEvent.change(screen.getByPlaceholderText('Type a message...'), {
      target: { value: 'do work' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(sendMessage).toHaveBeenCalledWith('do work', { maxIterations: 5 });
  });

  it('stays quiet (no agent panels) for a plain answer with no events', () => {
    render(<ChatPage />);

    expect(screen.queryByTestId('agent-panels')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agent-steps')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tool-call-list')).not.toBeInTheDocument();
  });

  it('renders the agent panels when agent events arrive', () => {
    chatState.steps = [{ iteration: 1, status: 'tool_call', tool: 'similaritySearch', input: 'q' }];
    chatState.toolCalls = [
      { iteration: 1, tool: 'similaritySearch', input: 'q', status: 'tool_call' },
    ];
    chatState.budget = {
      iteration: 1,
      tokensUsed: 100,
      elapsedMs: 500,
      maxIterations: 8,
      tokenBudget: 4000,
      timeoutMs: 30000,
    };

    render(<ChatPage />);

    expect(screen.getByTestId('agent-panels')).toBeInTheDocument();
    expect(screen.getByTestId('agent-steps')).toBeInTheDocument();
    expect(screen.getByTestId('tool-call-list')).toBeInTheDocument();
    expect(screen.getByText('similaritySearch')).toBeInTheDocument();
  });

  it('shows the stop button only while streaming and calls stop()', () => {
    chatState.streaming = false;
    const { rerender } = render(<ChatPage />);
    expect(screen.queryByTestId('stop-button')).not.toBeInTheDocument();

    chatState.streaming = true;
    rerender(<ChatPage />);

    const stopButton = screen.getByTestId('stop-button');
    expect(stopButton).toBeInTheDocument();
    fireEvent.click(stopButton);
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
