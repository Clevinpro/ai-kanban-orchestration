import { TimeoutError } from './errors';

/**
 * Enforces a wall-clock time limit on an agent run.
 *
 * Pure class: no NestJS DI, no I/O. Records a start time on construction and
 * throws `TimeoutError` once the elapsed time strictly exceeds the configured
 * limit. Elapsed time is measured with `Date.now()`.
 */
export class Timeout {
  private readonly startedAt: number;

  constructor(private readonly ms: number) {
    this.startedAt = Date.now();
  }

  /**
   * Throw `TimeoutError` when the elapsed wall-clock time exceeds the limit.
   */
  check(): void {
    if (this.elapsed > this.ms) {
      throw new TimeoutError(`Operation timed out: limit ${this.ms}ms`);
    }
  }

  /**
   * Return the number of milliseconds elapsed since construction.
   */
  get elapsed(): number {
    return Date.now() - this.startedAt;
  }
}
