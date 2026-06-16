import type { Tool } from './tool.interface';

/**
 * In-memory registry of agent {@link Tool}s, keyed by unique tool name.
 *
 * Lets the agent loop resolve and dispatch tools by name instead of hardcoding
 * any single capability. Insertion order is preserved so {@link describe}
 * output is deterministic (consumed by the planner prompt).
 *
 * Pure class: no NestJS DI, no I/O. It is wired as a provider later.
 */
export class ToolRegistry {
  /** Registered tools, keyed by name. A `Map` preserves insertion order. */
  private readonly tools = new Map<string, Tool>();

  /**
   * Register a tool under its name.
   *
   * @param tool The tool to register.
   * @throws {Error} when a tool with the same name is already registered.
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }

    this.tools.set(tool.name, tool);
  }

  /**
   * Resolve a tool by name.
   *
   * @param name The tool name to look up.
   * @returns The registered tool, or `undefined` when no tool matches.
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * List all registered tools in registration order.
   *
   * @returns A new array of the registered tools.
   */
  list(): Tool[] {
    return [...this.tools.values()];
  }

  /**
   * Render a planner-friendly enumeration of registered tools.
   *
   * Deterministic: tools are listed in registration order, one per line, as
   * `name: description`.
   *
   * @returns The formatted tool listing.
   */
  describe(): string {
    return this.list()
      .map((tool) => `${tool.name}: ${tool.description}`)
      .join('\n');
  }
}
