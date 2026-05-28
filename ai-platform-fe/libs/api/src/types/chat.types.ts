export interface IChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: string;
  status?: string;
  responseSeconds?: number;
}

export interface IChatRequest {
  message: string;
  conversationId?: string;
}

export interface IChatSendResponse {
  status: 'processing';
  conversationId?: string;
}

export interface IChatStreamEvent {
  userId: string;
  conversationId: string;
  event?: 'status' | 'chunk' | 'complete' | 'error';
  stage?: string;
  message?: string;
  result?: string;
  error?: string;
}
