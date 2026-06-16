import { apiClient, getApiBaseURL } from '../client';
import type { IChatRequest, IChatSendResponse } from '../types/chat.types';

const CHAT_STREAM_PATH = '/ai/chat/stream';

export async function sendMessage(dto: IChatRequest): Promise<IChatSendResponse> {
  const { message, conversationId, maxIterations, tokenBudget, timeoutMs } = dto;
  const payload: IChatRequest = { message };
  if (conversationId !== undefined) payload.conversationId = conversationId;
  // Forward safeguard limits only when provided so the request matches the
  // legacy shape when they are omitted.
  if (maxIterations !== undefined) payload.maxIterations = maxIterations;
  if (tokenBudget !== undefined) payload.tokenBudget = tokenBudget;
  if (timeoutMs !== undefined) payload.timeoutMs = timeoutMs;

  const { data } = await apiClient.post<IChatSendResponse>('/ai/chat', payload);
  return data;
}

// Cancels the in-flight tool-use loop for a conversation (FE stop control).
export async function cancelMessage(conversationId: string): Promise<void> {
  await apiClient.post('/ai/chat/cancel', { conversationId });
}

export function streamMessage(conversationId?: string): EventSource {
  const base = getApiBaseURL().replace(/\/$/, '');
  const url = new URL(`${base}${CHAT_STREAM_PATH}`);
  if (conversationId) {
    url.searchParams.set('conversationId', conversationId);
  }
  return new EventSource(url.toString(), { withCredentials: true });
}
