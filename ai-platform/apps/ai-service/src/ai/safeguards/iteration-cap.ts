import { IterationCapExceededError } from './errors';

/**
 * Counts reason→act iterations of the agent loop and throws once the cap is
 * reached, making an unbounded loop impossible.
 *
 * Pure class: no NestJS DI, no I/O, no Observable. It is driven by the agent
 * loop, which calls {@link increment} once per iteration.
 *
 * Boundary semantics (inclusive cap): exactly `maxIterations` iterations are
 * allowed. The counter starts at 0; the first `increment()` returns 1 and the
 * `maxIterations`-th returns `maxIterations` without throwing. The next call —
 * which would advance the counter past `maxIterations` — throws
 * {@link IterationCapExceededError}.
 */
export class IterationCap {
  private count = 0;

  /**
   * @param maxIterations Maximum number of iterations permitted before the cap
   *   trips. The `maxIterations`-th iteration is allowed; the one after throws.
   */
  constructor(private readonly maxIterations: number) {}

  /**
   * Current iteration number. Exposed for budget snapshots.
   */
  get current(): number {
    return this.count;
  }

  /**
   * Advance the iteration counter and return the new value.
   *
   * @returns The current iteration number after incrementing.
   * @throws {IterationCapExceededError} when the increment would advance the
   *   counter past `maxIterations`.
   */
  increment(): number {
    if (this.count + 1 > this.maxIterations) {
      throw new IterationCapExceededError(
        `Iteration cap exceeded: ${this.count + 1} > ${this.maxIterations}`,
      );
    }

    this.count += 1;

    return this.count;
  }
}
