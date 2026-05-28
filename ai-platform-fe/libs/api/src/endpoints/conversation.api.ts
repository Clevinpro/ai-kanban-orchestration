import { apiClient } from '../client';
import type {
  IConversation,
  IConversationList,
  IConversationWithMessages,
} from '../types/conversation.types';

export async function listConversations(): Promise<IConversationList[]> {
  const { data } = await apiClient.get<IConversationList[]>('/conversations');
  return data;
}

export async function getConversation(id: string): Promise<IConversationWithMessages> {
  const { data } = await apiClient.get<IConversationWithMessages>(`/conversations/${id}`);
  return data;
}

export async function createConversation(title: string): Promise<IConversation> {
  const { data } = await apiClient.post<IConversation>('/conversations', { title });
  return data;
}

export async function deleteConversation(id: string): Promise<void> {
  await apiClient.delete(`/conversations/${id}`);
}
