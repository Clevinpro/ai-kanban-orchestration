import type { Observable } from 'rxjs';

export type MessageRole = 'system' | 'user' | 'assistant';

export type AiEventType = 'status' | 'chunk' | 'complete' | 'error' | 'agent';

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
  // Present only on `event: 'agent'` frames. Carries typed agent-run progress.
  agent?: AgentEvent;
}

/**
 * Agent-run progress event. Emitted on `event: 'agent'` frames.
 * All fields are plain JSON so the payload round-trips over SSE unchanged.
 */
export interface AgentEvent {
  iteration: number;
  status: 'planning' | 'tool_call' | 'tool_result' | 'final';
  // Dynamic tool name (e.g. 'similaritySearch' or any future tool). Not a narrowed literal.
  tool?: string;
  input?: string;
  budget?: AgentBudget;
}

/**
 * Snapshot of agent-run resource consumption against configured limits.
 * Plain JSON only — no class instances, no Dates.
 */
export interface AgentBudget {
  iteration: number;
  tokensUsed: number;
  elapsedMs: number;
  maxIterations: number;
  tokenBudget: number;
  timeoutMs: number;
}

/**
 * Configuration for a single AI run. The unified tool-use flow no longer
 * distinguishes chat from agent runs; the loop runs the same way regardless.
 *
 * @deprecated `mode` is accepted-but-ignored by the unified flow. It is kept
 * optional only so the already-deployed gateway DTO and any in-flight clients
 * do not break. Do not branch on it. The three limit fields remain optional.
 */
export interface AgentRunConfig {
  /** @deprecated Accepted but ignored by the unified tool-use flow. */
  mode?: 'chat' | 'agent';
  maxIterations?: number;
  tokenBudget?: number;
  timeoutMs?: number;
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

/**
 * Per-call tuning for a single provider `chat()` invocation. All fields are
 * optional so existing single-arg callers and providers stay valid.
 */
export interface AiChatOptions {
  /** Hard cap on generated tokens for this call. */
  maxTokens?: number;
  /**
   * Ask the provider to suppress its reasoning/thinking channel so the answer
   * lands in `content`. Providers that ignore the flag fall back to the
   * `reasoning_effort:'low'` knob they do honor.
   */
  disableThinking?: boolean;
}

export interface IAIProvider {
  chat(message: AiChatMessage, options?: AiChatOptions): Observable<string>;
  getActiveModel?(): Promise<string>;
}

export interface IAIConfig {
  provider: 'claude' | 'ollama' | 'lmstudio';
  claudeApiKey?: string;
  ollamaUrl?: string;
  lmStudioUrl?: string;
}
