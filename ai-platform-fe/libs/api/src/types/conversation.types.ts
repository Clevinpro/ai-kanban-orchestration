import type { IChatMessage } from './chat.types';

export interface IConversation {
  id: string;
  title: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface IConversationList {
  id: string;
  title: string | null;
  messageCount: number;
  /** First message snippet when title is null (optional, from API). */
  preview?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IConversationWithMessages {
  conversation: IConversation;
  messages: IChatMessage[];
}
