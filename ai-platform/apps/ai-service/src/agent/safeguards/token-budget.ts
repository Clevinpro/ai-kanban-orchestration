import { BudgetExceededError } from './errors';

/**
 * Accumulates token usage across an agent run and enforces a hard cap.
 *
 * Pure class: no NestJS DI, no I/O. Boundary semantics — the budget is
 * considered exceeded only when the cumulative total strictly **exceeds**
 * the configured limit (reaching the limit exactly is allowed).
 */
export class TokenBudget {
  private used = 0;

  constructor(private readonly limit: number) {}

  /**
   * Add `tokens` to the running total. Throws `BudgetExceededError` when the
   * cumulative total exceeds the configured limit.
   */
  track(tokens: number): void {
    this.used += tokens;

    if (this.used > this.limit) {
      throw new BudgetExceededError(`Token budget exceeded: used ${this.used} of ${this.limit}`);
    }
  }

  /**
   * Return the current usage and the configured limit.
   */
  getState(): { used: number; limit: number } {
    return { used: this.used, limit: this.limit };
  }
}
