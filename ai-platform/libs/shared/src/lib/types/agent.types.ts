/**
 * Agent runtime event types.
 *
 * String enum where each value equals its member name so the SSE JSON `type`
 * field round-trips cleanly to the frontend switch.
 */
export enum AgentEventType {
  AGENT_START = 'AGENT_START',
  STEP = 'STEP',
  TOOL_CALL = 'TOOL_CALL',
  TOOL_RESULT = 'TOOL_RESULT',
  BUDGET = 'BUDGET',
  TOKEN = 'TOKEN',
  AGENT_DONE = 'AGENT_DONE',
  AGENT_ERROR = 'AGENT_ERROR',
}

/**
 * Generic agent event emitted over the SSE stream.
 */
export interface IAgentEvent<T = unknown> {
  type: AgentEventType;
  data: T;
  timestamp: number;
}

/**
 * Static configuration bounding a single agent run.
 */
export interface IAgentConfig {
  maxIterations: number;
  tokenBudget: number;
  timeoutMs: number;
}

/**
 * Mutable budget state tracked across an agent run.
 */
export interface IBudgetState {
  iteration: number;
  tokensUsed: number;
  elapsedMs: number;
}

/**
 * A tool invocation requested by the agent.
 */
export interface IToolCall {
  tool: string;
  input: Record<string, unknown>;
}
