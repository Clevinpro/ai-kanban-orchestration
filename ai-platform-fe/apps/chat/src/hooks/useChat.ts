import { sendMessage as chatApiSendMessage, type IChatMessage } from '@libs/api';
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

export type UseChatOptions = {
  onConversationId?: (id: string) => void;
};

export function useChat(conversationId: string | null, options?: UseChatOptions) {
  const queryClient = useQueryClient();
  const onConversationIdRef = useRef(options?.onConversationId);
  onConversationIdRef.current = options?.onConversationId;

  const [messages, setMessages] = useState<IChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [localConversationId, setLocalConversationId] = useState<string | null>(null);

  const inFlightRef = useRef(false);
  const lastOptimisticResponseRef = useRef<{
    conversationId: string;
    assistantContent: string;
  } | null>(null);

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
      if (inFlightRef.current && pendingAssistant) {
        return [...conversationBundle.messages, pendingAssistant];
      }
      return conversationBundle.messages;
    });
  }, [conversationId, conversationBundle]);

  const rememberConversationId = useCallback(
    (nextConversationId: string) => {
      setLocalConversationId((prev) => prev ?? nextConversationId);
      onConversationIdRef.current?.(nextConversationId);
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.one(nextConversationId),
      });
    },
    [queryClient],
  );

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
            prev.map((msg) =>
              msg.id === pendingAssistantId
                ? { ...msg, status: undefined, responseSeconds: getElapsedSeconds(msg.createdAt) }
                : msg,
            ),
          );
          clearPendingStream(resolvedConvId);
          finishStream();
        },

        onError: (errorMessage) => {
          cancelStatusQueue();
          showReceiveError(errorMessage);
          finishStream();
        },

        onFallback: () => {
          cancelStatusQueue();
          finishStream();
        },
      });
    },
    [connect, disconnect, rememberConversationId, enqueueStatus, cancelStatusQueue],
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
                status: msg.status ?? 'Reconnecting to stream...',
                responseSeconds: getElapsedSeconds(msg.createdAt),
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
          createdAt: pending.createdAt,
          status: 'Reconnecting to stream...',
          responseSeconds: getElapsedSeconds(pending.createdAt),
        },
      ];
    });

    const clearIdleTimeout = startIdleTimeout(() => {
      clearPendingStream(conversationId);
      inFlightRef.current = false;
      setStreaming(false);
      setMessages((prev) =>
        prev.filter(
          (msg) =>
            !(
              msg.id === pendingAssistantId &&
              msg.role === 'assistant' &&
              msg.content.trim().length === 0
            ),
        ),
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
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || inFlightRef.current) return;

      const convForSend = effectiveConversationId ?? undefined;
      const userMessageId = crypto.randomUUID();
      const assistantMessageId = crypto.randomUUID();
      const createdAt = new Date().toISOString();

      inFlightRef.current = true;
      setStreaming(true);
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

  return { messages, streaming, loadingHistory, sendMessage };
}
