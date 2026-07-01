/**
 * Pluggable-tool contract for the agent loop.
 *
 * A tool is a self-contained capability the agent can invoke by name (e.g.
 * similarity search). The loop resolves tools from the {@link ToolRegistry} and
 * dispatches by name instead of hardcoding any single capability.
 *
 * Pure types: no NestJS DI, no I/O. Concrete tools are wired as providers later.
 */

/**
 * Per-invocation context handed to a tool's {@link Tool.run} method.
 *
 * Carries whatever the agent loop already has on hand for an invocation. Kept
 * intentionally minimal and optional so tools depend only on what they need.
 */
export interface ToolContext {
  /** Conversation the invocation belongs to, when available. */
  conversationId?: string;
}

/**
 * A named capability the agent loop can resolve and invoke.
 */
export interface Tool {
  /** Unique tool name used as the registry key and dispatch identifier. */
  name: string;

  /** Human-readable description consumed by the planner prompt. */
  description: string;

  /**
   * Execute the tool against the given input.
   *
   * @param input Raw tool input, as produced by the planner.
   * @param ctx Per-invocation context from the agent loop.
   * @returns The tool's result rendered as a string for the loop to consume.
   */
  run(input: string, ctx: ToolContext): Promise<string>;
}
