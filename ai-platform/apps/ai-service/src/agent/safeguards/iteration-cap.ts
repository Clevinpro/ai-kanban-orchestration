import { MaxIterationsError } from './errors';

/**
 * Tracks the number of loop iterations in an agent run and enforces a hard cap.
 *
 * Pure class: no NestJS DI, no I/O. Boundary semantics — incrementing the count
 * up to exactly `max` is allowed; the increment that would make the count
 * strictly **exceed** `max` (i.e. `current > max`) throws `MaxIterationsError`.
 */
export class IterationCap {
  private count = 0;

  constructor(private readonly max: number) {}

  /**
   * Increment the iteration count by one. Throws `MaxIterationsError` when the
   * increment would push the count beyond the configured maximum.
   */
  increment(): void {
    if (this.count + 1 > this.max) {
      throw new MaxIterationsError(`Maximum iterations exceeded: limit ${this.max}`);
    }

    this.count += 1;
  }

  /**
   * Return the current iteration count.
   */
  get current(): number {
    return this.count;
  }
}
