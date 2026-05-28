import type { IChatMessage } from '../types/chat.types';

const PENDING_STREAM_STORAGE_KEY = 'pendingChatStream';
const PENDING_STREAM_TTL_MS = 10 * 60 * 1000;

export type PendingChatStream = {
  conversationId: string;
  createdAt: string;
};

export function readPendingStream(): PendingChatStream | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(PENDING_STREAM_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingChatStream;
    return typeof parsed.conversationId === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function savePendingStream(conversationId: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    PENDING_STREAM_STORAGE_KEY,
    JSON.stringify({ conversationId, createdAt: new Date().toISOString() }),
  );
}

export function clearPendingStream(conversationId?: string | null): void {
  if (typeof window === 'undefined') return;
  const pending = readPendingStream();
  if (!conversationId || pending?.conversationId === conversationId) {
    window.localStorage.removeItem(PENDING_STREAM_STORAGE_KEY);
  }
}

export function isPendingStreamExpired(pending: PendingChatStream): boolean {
  const createdAt = getTimestamp(pending.createdAt);
  return createdAt !== null && Date.now() - createdAt > PENDING_STREAM_TTL_MS;
}

export function getTimestamp(value?: string): number | null {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? null : ts;
}

export function getElapsedSeconds(startedAt?: string): number | undefined {
  const ts = getTimestamp(startedAt);
  if (ts === null) return undefined;
  return Math.max(0, Math.round((Date.now() - ts) / 1000));
}

export function hasAssistantResponseForLatestUser(messages: IChatMessage[]): boolean {
  const latestUserIndex = messages.reduce(
    (lastIndex, msg, index) => (msg.role === 'user' ? index : lastIndex),
    -1,
  );
  return messages
    .slice(latestUserIndex + 1)
    .some((msg) => msg.role === 'assistant' && msg.content.trim().length > 0);
}
