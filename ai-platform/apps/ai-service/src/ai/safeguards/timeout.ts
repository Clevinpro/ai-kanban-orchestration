import { TimeoutExceededError } from './errors';

/**
 * Enforces a wall-clock limit on the agent run and throws once the elapsed time
 * since construction reaches or exceeds `timeoutMs`.
 *
 * Pure class: no NestJS DI, no I/O, no real timers. It is driven by the agent
 * loop, which calls {@link check} at safe checkpoints. Time is read through an
 * injectable clock so tests can advance time deterministically.
 *
 * Boundary semantics: the limit is inclusive — `check()` throws once
 * `now - start >= timeoutMs`.
 */
export class Timeout {
  /** Wall-clock timestamp captured at construction. */
  private readonly start: number;

  /**
   * @param timeoutMs Maximum wall-clock duration permitted, in milliseconds.
   * @param now Clock function returning the current time in milliseconds.
   *   Defaults to `Date.now`; override in tests for deterministic time.
   */
  constructor(
    private readonly timeoutMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.start = this.now();
  }

  /**
   * Elapsed wall-clock time since construction, in milliseconds. Exposed for
   * budget snapshots.
   */
  get elapsedMs(): number {
    return this.now() - this.start;
  }

  /**
   * Assert that the run has not yet exceeded its wall-clock budget.
   *
   * @throws {TimeoutExceededError} when `now - start >= timeoutMs`.
   */
  check(): void {
    const elapsed = this.elapsedMs;

    if (elapsed >= this.timeoutMs) {
      throw new TimeoutExceededError(`Timeout exceeded: ${elapsed}ms >= ${this.timeoutMs}ms`);
    }
  }
}
