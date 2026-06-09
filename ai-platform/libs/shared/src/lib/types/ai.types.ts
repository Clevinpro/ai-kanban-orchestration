import type { Observable } from 'rxjs';

export type MessageRole = 'system' | 'user' | 'assistant';

export type AiEventType = 'status' | 'chunk' | 'complete' | 'error';

export type AiStatusStage =
  | 'init'
  | 'rag_search'
  | 'rag_found'
  | 'prompt_build'
  | 'history_load'
  | 'save_message'
  | 'llm_start'
  | 'llm_generating'
  | 'save_response';

export interface AiResponsePayload {
  userId: string;
  conversationId: string;
  event: AiEventType;
  stage?: AiStatusStage;
  message?: string;
  result?: string;
  error?: string;
}

export interface ChatMessage {
  role: MessageRole;
  content: string;
}

/**
 * Message format for LLM providers:
 * - string — single user message (backward compat)
 * - { system, user } — system + user (backward compat)
 * - ChatMessage[] — full chat history with roles
 */
export type AiChatMessage = string | { system: string; user: string } | ChatMessage[];

export interface IAIProvider {
  chat(message: AiChatMessage): Observable<string>;
  getActiveModel?(): Promise<string>;
}

export interface IAIConfig {
  provider: 'claude' | 'ollama' | 'lmstudio';
  claudeApiKey?: string;
  ollamaUrl?: string;
  lmStudioUrl?: string;
}
