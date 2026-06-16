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
  // Optional safeguard limits for the tool-use chat loop.
  maxIterations?: number;
  tokenBudget?: number;
  timeoutMs?: number;
}

// Budget snapshot reported by the backend agent loop.
export interface AgentBudget {
  iteration: number;
  tokensUsed: number;
  elapsedMs: number;
  maxIterations: number;
  tokenBudget: number;
  timeoutMs: number;
}

// A single agent/tool event emitted on the `event: 'agent'` stream channel.
export interface AgentEvent {
  iteration: number;
  status: 'planning' | 'tool_call' | 'tool_result' | 'final';
  // Dynamic tool name (only present for tool_call / tool_result).
  tool?: string;
  input?: string;
  budget?: AgentBudget;
}

export interface IChatSendResponse {
  status: 'processing';
  conversationId?: string;
}

export interface IChatStreamEvent {
  userId: string;
  conversationId: string;
  event?: 'status' | 'chunk' | 'complete' | 'error' | 'agent';
  stage?: string;
  message?: string;
  result?: string;
  error?: string;
  // Present when `event === 'agent'`: carries the tool-use progress payload.
  agent?: AgentEvent;
}
