import { apiClient, getApiBaseURL } from '../client';
import type { IChatRequest, IChatSendResponse } from '../types/chat.types';

const CHAT_STREAM_PATH = '/ai/chat/stream';

export async function sendMessage(dto: IChatRequest): Promise<IChatSendResponse> {
  const { data } = await apiClient.post<IChatSendResponse>('/ai/chat', dto);
  return data;
}

export function streamMessage(conversationId?: string): EventSource {
  const base = getApiBaseURL().replace(/\/$/, '');
  const url = new URL(`${base}${CHAT_STREAM_PATH}`);
  if (conversationId) {
    url.searchParams.set('conversationId', conversationId);
  }
  return new EventSource(url.toString(), { withCredentials: true });
}
