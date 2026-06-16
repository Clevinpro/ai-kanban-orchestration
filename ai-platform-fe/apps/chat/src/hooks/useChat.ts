import {
  cancelMessage as chatApiCancelMessage,
  sendMessage as chatApiSendMessage,
  type AgentBudget,
  type AgentEvent,
  type IChatMessage,
} from '@libs/api';
import {
  clearPendingStream,
  getElapsedSeconds,
  hasAssistantResponseForLatestUser,
  isPendingStreamExpired,
  readPendingStream,
  savePendingStream,
} from '@libs/api';
import { queryKeys, useConversation } from '@libs/store';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStatusQueue } from './useStatusQueue';
import { useStreamConnection } from './useStreamConnection';

const RESPONSE_RECEIVE_ERROR_MESSAGE = 'Could not receive AI response. Please try again.';
const RESPONSE_SEND_ERROR_MESSAGE = 'Could not send message. Please try again.';
const RECONNECT_GAVE_UP_MESSAGE =
  'The previous run ended or timed out. Please send your message again.';
const EMPTY_RESPONSE_MESSAGE = 'The model returned an empty response. Please try again.';

export type UseChatOptions = {
  onConversationId?: (id: string) => void;
};

// Optional safeguard limits forwarded to the tool-use chat loop.
export type SendMessageLimits = {
  maxIterations?: number;
  tokenBudget?: number;
  timeoutMs?: number;
};

// A tool invocation surfaced in the UI, derived from tool_call / tool_result
// agent events. `input` carries the call arguments; `output` is filled in when
// the matching tool_result for the same iteration arrives.
export type ToolCall = {
  iteration: number;
  tool: string;
  input?: string;
  output?: string;
  status: 'tool_call' | 'tool_result';
};

export function useChat(conversationId: string | null, options?: UseChatOptions) {
  const queryClient = useQueryClient();
  const onConversationIdRef = useRef(options?.onConversationId);
  onConversationIdRef.current = options?.onConversationId;

  const [messages, setMessages] = useState<IChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [localConversationId, setLocalConversationId] = useState<string | null>(null);

  // Tool-use progress state, accumulated from `agent` stream events.
  const [steps, setSteps] = useState<AgentEvent[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [budget, setBudget] = useState<AgentBudget | null>(null);

  const inFlightRef = useRef(false);
  const lastOptimisticResponseRef = useRef<{
    conversationId: string;
    assistantContent: string;
  } | null>(null);
  const pendingResponseSecondsRef = useRef<number | undefined>(undefined);

  const effectiveConversationId = conversationId ?? localConversationId;

  const { connect, disconnect, startIdleTimeout } = useStreamConnection();
  const { enqueue: enqueueStatus, cancel: cancelStatusQueue } = useStatusQueue();

  const { data: conversationBundle, isLoading: loadingHistory } = useConversation(conversationId);

  // Reset local state when the active conversation changes externally.
  useEffect(() => {
    if (inFlightRef.current) {
      setLocalConversationId(null);
      return;
    }
    setLocalConversationId(null);
    disconnect();
    inFlightRef.current = false;
    setStreaming(false);
  }, [disconnect, conversationId]);

  // Sync server history into local messages state.
  useEffect(() => {
    if (!conversationId) {
      if (!inFlightRef.current) setMessages([]);
      return;
    }
    if (!conversationBundle?.messages) return;

    const pending = readPendingStream();
    if (
      pending?.conversationId === conversationId &&
      (isPendingStreamExpired(pending) ||
        hasAssistantResponseForLatestUser(conversationBundle.messages))
    ) {
      clearPendingStream(conversationId);
    }

    const optimisticResponse = lastOptimisticResponseRef.current;
    const historyHasOptimistic =
      optimisticResponse?.conversationId === conversationId &&
      conversationBundle.messages.some(
        (msg) => msg.role === 'assistant' && msg.content === optimisticResponse.assistantContent,
      );

    if (optimisticResponse?.conversationId === conversationId && !historyHasOptimistic) return;
    if (historyHasOptimistic) lastOptimisticResponseRef.current = null;

    setMessages((prev) => {
      const pendingAssistant = prev.find(
        (msg) => msg.role === 'assistant' && msg.content.trim().length === 0,
      );
      const baseMessages =
        inFlightRef.current && pendingAssistant
          ? [...conversationBundle.messages, pendingAssistant]
          : conversationBundle.messages;

      const savedSeconds = pendingResponseSecondsRef.current;
      if (typeof savedSeconds === 'number') {
        pendingResponseSecondsRef.current = undefined;
        const lastAssistantIdx = baseMessages.reduce(
          (last, m, i) => (m.role === 'assistant' ? i : last),
          -1,
        );
        if (
          lastAssistantIdx >= 0 &&
          typeof baseMessages[lastAssistantIdx].responseSeconds !== 'number'
        ) {
          const result = [...baseMessages];
          result[lastAssistantIdx] = { ...result[lastAssistantIdx], responseSeconds: savedSeconds };
          return result;
        }
      }

      return baseMessages;
    });
  }, [conversationId, conversationBundle]);

  const rememberConversationId = useCallback((nextConversationId: string) => {
    setLocalConversationId((prev) => prev ?? nextConversationId);
    onConversationIdRef.current?.(nextConversationId);
  }, []);

  const connectStream = useCallback(
    (convIdForFilter: string | null, pendingAssistantId: string): Promise<void> => {
      const finishStream = () => {
        disconnect();
        inFlightRef.current = false;
        setStreaming(false);
      };

      const showReceiveError = (content = RESPONSE_RECEIVE_ERROR_MESSAGE) => {
        setMessages((prev) => [
          ...prev.filter((msg) => msg.id !== pendingAssistantId),
          {
            role: 'system',
            content,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
          },
        ]);
      };

      return connect(convIdForFilter, {
        onConversationId: rememberConversationId,

        onStatus: (_stage, message) => {
          if (!message) return;
          enqueueStatus(message, (text) => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === pendingAssistantId && msg.content.trim().length === 0
                  ? { ...msg, status: text, responseSeconds: getElapsedSeconds(msg.createdAt) }
                  : msg,
              ),
            );
          });
        },

        onChunk: (piece, resolvedConvId) => {
          cancelStatusQueue();
          setMessages((prev) => {
            let assistantContent = piece;
            const next = prev.map((msg) => {
              if (msg.id !== pendingAssistantId) return msg;
              assistantContent = `${msg.content}${piece}`;
              return {
                ...msg,
                content: assistantContent,
                status: undefined,
                responseSeconds: getElapsedSeconds(msg.createdAt),
              };
            });
            if (resolvedConvId) {
              lastOptimisticResponseRef.current = {
                conversationId: resolvedConvId,
                assistantContent,
              };
            }
            return next;
          });
        },

        onComplete: (resolvedConvId) => {
          cancelStatusQueue();
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id !== pendingAssistantId) return msg;
              const responseSeconds = getElapsedSeconds(msg.createdAt);
              pendingResponseSecondsRef.current = responseSeconds;
              // Safety net: a completed run with no streamed content would
              // otherwise stay on the "Model is thinking..." placeholder forever
              // (the bubble shows it whenever assistant content is empty). Fill a
              // terminal notice so input is clearly usable again.
              const content =
                msg.content.trim().length === 0 ? EMPTY_RESPONSE_MESSAGE : msg.content;
              return { ...msg, content, status: undefined, responseSeconds };
            }),
          );
          clearPendingStream(resolvedConvId);
          finishStream();
          void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
          if (resolvedConvId) {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.conversations.one(resolvedConvId),
            });
          }
        },

        onError: (errorMessage) => {
          cancelStatusQueue();
          showReceiveError(errorMessage);
          finishStream();
        },

        // Agent tool/budget progress: accumulate each event as a step, derive
        // tool calls from tool_call / tool_result events, and keep the latest
        // budget snapshot.
        onAgentEvent: (event) => {
          setSteps((prev) => [...prev, event]);

          if (event.budget) {
            setBudget(event.budget);
          }

          if (event.status === 'tool_call' && event.tool) {
            setToolCalls((prev) => [
              ...prev,
              {
                iteration: event.iteration,
                tool: event.tool as string,
                input: event.input,
                status: 'tool_call',
              },
            ]);
          } else if (event.status === 'tool_result' && event.tool) {
            setToolCalls((prev) => {
              // Match the pending tool_call for the same iteration/tool and fill
              // in its output; fall back to appending if no match is found.
              const matchIdx = prev.findIndex(
                (call) =>
                  call.iteration === event.iteration &&
                  call.tool === event.tool &&
                  call.status === 'tool_call',
              );
              if (matchIdx === -1) {
                return [
                  ...prev,
                  {
                    iteration: event.iteration,
                    tool: event.tool as string,
                    output: event.input,
                    status: 'tool_result',
                  },
                ];
              }
              const next = [...prev];
              next[matchIdx] = {
                ...next[matchIdx],
                output: event.input,
                status: 'tool_result',
              };
              return next;
            });
          }
        },

        onFallback: () => {
          cancelStatusQueue();
          finishStream();
        },
      });
    },
    [connect, disconnect, rememberConversationId, enqueueStatus, cancelStatusQueue, queryClient],
  );

  // Reconnect to an in-progress stream after a page reload.
  useEffect(() => {
    if (!conversationId || loadingHistory || inFlightRef.current) return;

    const pending = readPendingStream();
    if (pending?.conversationId !== conversationId) return;
    if (
      isPendingStreamExpired(pending) ||
      hasAssistantResponseForLatestUser(conversationBundle?.messages ?? [])
    ) {
      clearPendingStream(conversationId);
      return;
    }

    const pendingAssistantId = crypto.randomUUID();
    // Anchor the elapsed counter to when this reconnect begins, not the original
    // message's createdAt — otherwise a fresh reconnect is reported as minutes
    // old (the run may have started long before the reload).
    const reconnectStartedAt = new Date().toISOString();
    inFlightRef.current = true;
    setStreaming(true);
    setMessages((prev) => {
      const hasPending = prev.some(
        (msg) => msg.role === 'assistant' && msg.content.trim().length === 0,
      );
      if (hasPending) {
        return prev.map((msg) =>
          msg.role === 'assistant' && msg.content.trim().length === 0
            ? {
                ...msg,
                id: pendingAssistantId,
                createdAt: reconnectStartedAt,
                status: msg.status ?? 'Reconnecting to stream...',
                responseSeconds: getElapsedSeconds(reconnectStartedAt),
              }
            : msg,
        );
      }
      return [
        ...prev,
        {
          role: 'assistant',
          content: '',
          id: pendingAssistantId,
          createdAt: reconnectStartedAt,
          status: 'Reconnecting to stream...',
          responseSeconds: getElapsedSeconds(reconnectStartedAt),
        },
      ];
    });

    // Give-up: when the reconnect produces no events within the bounded window,
    // transition to a terminal state — clear the pending marker, release
    // inFlightRef (re-enabling input), and replace the empty placeholder with a
    // terminal "run ended / timed out" message instead of a perpetual
    // "Reconnecting to stream...".
    const clearIdleTimeout = startIdleTimeout(() => {
      clearPendingStream(conversationId);
      inFlightRef.current = false;
      setStreaming(false);
      setMessages((prev) =>
        prev.flatMap((msg) => {
          const isEmptyPlaceholder =
            msg.id === pendingAssistantId &&
            msg.role === 'assistant' &&
            msg.content.trim().length === 0;
          if (!isEmptyPlaceholder) return [msg];
          return [
            {
              role: 'system' as const,
              content: RECONNECT_GAVE_UP_MESSAGE,
              id: crypto.randomUUID(),
              createdAt: new Date().toISOString(),
            },
          ];
        }),
      );
    });

    void connectStream(conversationId, pendingAssistantId).catch(() => {
      clearPendingStream(conversationId);
      inFlightRef.current = false;
      setStreaming(false);
      clearIdleTimeout();
    });

    return clearIdleTimeout;
  }, [connectStream, conversationId, loadingHistory, startIdleTimeout]);

  const sendMessage = useCallback(
    async (text: string, limits?: SendMessageLimits) => {
      const trimmed = text.trim();
      if (!trimmed || inFlightRef.current) return;

      const convForSend = effectiveConversationId ?? undefined;
      const userMessageId = crypto.randomUUID();
      const assistantMessageId = crypto.randomUUID();
      const createdAt = new Date().toISOString();

      inFlightRef.current = true;
      setStreaming(true);
      // Reset tool-use progress for the new run.
      setSteps([]);
      setToolCalls([]);
      setBudget(null);
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: trimmed, id: userMessageId, createdAt },
        {
          role: 'assistant',
          content: '',
          id: assistantMessageId,
          createdAt,
          status: 'Waiting for response...',
          responseSeconds: 0,
        },
      ]);
      if (convForSend) savePendingStream(convForSend);

      try {
        await connectStream(effectiveConversationId, assistantMessageId);
        const response = await chatApiSendMessage({
          message: trimmed,
          conversationId: convForSend,
          // Forward safeguard limits only when provided so the legacy request
          // shape is preserved when they are omitted.
          ...(limits?.maxIterations !== undefined && { maxIterations: limits.maxIterations }),
          ...(limits?.tokenBudget !== undefined && { tokenBudget: limits.tokenBudget }),
          ...(limits?.timeoutMs !== undefined && { timeoutMs: limits.timeoutMs }),
        });
        const nextConversationId = response.conversationId ?? convForSend;
        if (nextConversationId) {
          rememberConversationId(nextConversationId);
          savePendingStream(nextConversationId);
        }
      } catch {
        cancelStatusQueue();
        clearPendingStream(convForSend);
        disconnect();
        inFlightRef.current = false;
        setStreaming(false);
        setMessages((prev) => [
          ...prev.filter((msg) => msg.id !== userMessageId && msg.id !== assistantMessageId),
          {
            role: 'system',
            content: RESPONSE_SEND_ERROR_MESSAGE,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    },
    [cancelStatusQueue, connectStream, disconnect, effectiveConversationId, rememberConversationId],
  );

  // Resets in-flight stream state so a brand-new chat can send a message
  // immediately. A prior run may have left `inFlightRef` set (e.g. the reconnect
  // effect attaching to a now-dead stream after a reload), which would make
  // `sendMessage` early-return and silently drop the first message. Tear down
  // the live connection, clear the pending-stream marker for the prior
  // conversation, and reset local state before the caller creates the new chat.
  const newChat = useCallback(() => {
    const priorConversationId = effectiveConversationId ?? undefined;

    cancelStatusQueue();
    disconnect();
    inFlightRef.current = false;
    setStreaming(false);
    if (priorConversationId) clearPendingStream(priorConversationId);

    lastOptimisticResponseRef.current = null;
    pendingResponseSecondsRef.current = undefined;
    setLocalConversationId(null);
    setMessages([]);
    setSteps([]);
    setToolCalls([]);
    setBudget(null);
  }, [cancelStatusQueue, disconnect, effectiveConversationId]);

  // Cancels the active tool-use run for the current conversation and tears down
  // the in-flight stream/state cleanly.
  const stop = useCallback(async () => {
    if (!inFlightRef.current) return;

    const convToCancel = effectiveConversationId ?? undefined;

    // Tear down local stream state first so the UI stops immediately, even if
    // the cancel request is slow or fails.
    cancelStatusQueue();
    disconnect();
    inFlightRef.current = false;
    setStreaming(false);
    if (convToCancel) clearPendingStream(convToCancel);

    if (!convToCancel) return;
    try {
      await chatApiCancelMessage(convToCancel);
    } catch {
      // Best-effort: the local stream is already torn down regardless.
    }
  }, [cancelStatusQueue, disconnect, effectiveConversationId]);

  return {
    messages,
    streaming,
    loadingHistory,
    sendMessage,
    steps,
    toolCalls,
    budget,
    stop,
    newChat,
  };
}
