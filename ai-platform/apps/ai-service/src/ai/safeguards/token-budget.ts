import { TokenBudgetExceededError } from './errors';

/**
 * Usage reported by a provider, or a raw text string to estimate from.
 *
 * - When a provider reports a `tokens` count, it is trusted and used directly.
 * - Otherwise (e.g. a raw string, or an object without `tokens`) a local
 *   estimate is derived from the text length. This keeps token accounting
 *   portable across providers that do not report usage (Ollama / LMStudio).
 */
export type TokenUsage = { tokens?: number; text?: string } | string;

/**
 * Divisor for the local token estimate. A common rough heuristic is ~4
 * characters per token for English-like text.
 */
const CHARS_PER_TOKEN = 4;

/**
 * Estimate token count from raw text length.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Accumulates token usage across agent loop iterations and throws once the
 * cumulative total exceeds the configured budget.
 *
 * Pure class: no NestJS DI, no I/O, no Observable. It is checked outside the
 * loop body by the agent loop.
 */
export class TokenBudget {
  private total = 0;

  /**
   * @param budget Maximum cumulative tokens permitted before the budget trips.
   */
  constructor(private readonly budget: number) {}

  /**
   * Running total of tokens consumed so far. Exposed for budget snapshots.
   */
  get tokensUsed(): number {
    return this.total;
  }

  /**
   * Add usage to the running total and throw if the budget is exceeded.
   *
   * Provider-reported `tokens` are used directly; otherwise the token count is
   * estimated locally from the text (`Math.ceil(text.length / 4)`).
   *
   * @throws {TokenBudgetExceededError} when cumulative tokens exceed `budget`.
   */
  track(usage: TokenUsage): void {
    this.total += this.resolveTokens(usage);

    if (this.total > this.budget) {
      throw new TokenBudgetExceededError(`Token budget exceeded: ${this.total} > ${this.budget}`);
    }
  }

  /**
   * Resolve a usage input into a concrete token count.
   */
  private resolveTokens(usage: TokenUsage): number {
    if (typeof usage === 'string') {
      return estimateTokens(usage);
    }

    if (typeof usage.tokens === 'number') {
      return usage.tokens;
    }

    if (typeof usage.text === 'string') {
      return estimateTokens(usage.text);
    }

    return 0;
  }
}
