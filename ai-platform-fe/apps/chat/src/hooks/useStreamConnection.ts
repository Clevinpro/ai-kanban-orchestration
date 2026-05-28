import { streamMessage } from '@libs/api';
import { useCallback, useEffect, useRef } from 'react';

const RECONNECT_IDLE_TIMEOUT_MS = 45_000;

type AiSsePayload = {
  userId?: string;
  event?: 'status' | 'chunk' | 'complete' | 'error';
  stage?: string;
  message?: string;
  result?: string;
  conversationId?: string;
  error?: string;
};

export type StreamHandlers = {
  onStatus: (stage: string, message: string) => void;
  onChunk: (piece: string, resolvedConversationId: string | null) => void;
  onComplete: (resolvedConversationId: string | null) => void;
  onError: (message?: string) => void;
  onConversationId: (id: string) => void;
  onFallback: () => void;
};

export function useStreamConnection() {
  const esRef = useRef<EventSource | null>(null);
  const lastEventAtRef = useRef<number | null>(null);

  const disconnect = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    lastEventAtRef.current = null;
  }, []);

  const connect = useCallback((convId: string | null, handlers: StreamHandlers): Promise<void> => {
    esRef.current?.close();

    const es = streamMessage(convId ?? undefined);
    esRef.current = es;
    let streamOpened = false;
    let conversationIdFired = false;
    let resolveReady!: () => void;
    let rejectReady!: (reason?: unknown) => void;
    const ready = new Promise<void>((res, rej) => {
      resolveReady = res;
      rejectReady = rej;
    });

    const parsePayload = (event: MessageEvent<string>): AiSsePayload => {
      try {
        return JSON.parse(event.data) as AiSsePayload;
      } catch {
        return { result: typeof event.data === 'string' ? event.data : '' };
      }
    };

    es.onopen = () => {
      streamOpened = true;
      resolveReady();
    };

    es.onmessage = (event: MessageEvent<string>) => {
      lastEventAtRef.current = Date.now();
      const payload = parsePayload(event);
      const resolvedConvId = payload.conversationId ?? convId;

      if (resolvedConvId && !conversationIdFired) {
        conversationIdFired = true;
        handlers.onConversationId(resolvedConvId);
      }

      if (payload.event === 'status') {
        handlers.onStatus(payload.stage ?? '', payload.message ?? '');
        return;
      }

      if (payload.event === 'complete') {
        handlers.onComplete(resolvedConvId);
        return;
      }

      if (payload.event === 'error') {
        handlers.onError(payload.error);
        return;
      }

      const piece = typeof payload.result === 'string' ? payload.result : '';
      if (piece) {
        handlers.onChunk(piece, resolvedConvId);
      }

      if (!payload.event) {
        handlers.onFallback();
      }
    };

    es.onerror = () => {
      handlers.onError();
      if (!streamOpened) {
        rejectReady(new Error('Could not connect to stream'));
      }
    };

    return ready;
  }, []);

  // Starts a 1s interval that fires onTimeout when no event arrives for
  // RECONNECT_IDLE_TIMEOUT_MS. Returns a cleanup (clearInterval) function.
  const startIdleTimeout = useCallback((onTimeout: () => void): (() => void) => {
    const id = window.setInterval(() => {
      const lastEventAt = lastEventAtRef.current;
      if (lastEventAt === null) {
        window.clearInterval(id);
        return;
      }
      if (Date.now() - lastEventAt < RECONNECT_IDLE_TIMEOUT_MS) {
        return;
      }
      window.clearInterval(id);
      onTimeout();
    }, 1000);

    return () => window.clearInterval(id);
  }, []);

  useEffect(() => disconnect, [disconnect]);

  return { connect, disconnect, startIdleTimeout };
}
