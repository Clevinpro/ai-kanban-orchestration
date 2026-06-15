/**
 * Typed error hierarchy for agent safeguards.
 *
 * Each safeguard breach surfaces as a distinct, identifiable error so the loop
 * can catch it and emit an `error` event carrying a stable, typed `reason`
 * discriminator. These are pure classes: no NestJS DI, no I/O.
 */

/**
 * Stable discriminator strings for each safeguard breach. Used in the `error`
 * event payload so consumers can branch on a typed reason instead of parsing
 * messages.
 */
export type SafeguardReason = 'token_budget' | 'iteration_cap' | 'timeout' | 'kill_switch';

/**
 * Base class for all safeguard breaches. Extends the native `Error` and exposes
 * a `reason` discriminator identifying which safeguard tripped.
 */
export abstract class SafeguardError extends Error {
  /** Stable discriminator identifying the breached safeguard. */
  abstract readonly reason: SafeguardReason;

  protected constructor(message?: string) {
    super(message);
    // Restore the prototype chain: when TS downlevels `extends Error` to the
    // project's target, `super()` resets the prototype to Error.prototype,
    // breaking `instanceof` against this subclass. This is the canonical fix.
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = new.target.name;
  }
}

/**
 * Thrown when an agent run exceeds its configured token budget.
 */
export class TokenBudgetExceededError extends SafeguardError {
  readonly reason = 'token_budget';

  constructor(message = 'Token budget exceeded') {
    super(message);
  }
}

/**
 * Thrown when an agent run exceeds its maximum allowed iterations.
 */
export class IterationCapExceededError extends SafeguardError {
  readonly reason = 'iteration_cap';

  constructor(message = 'Iteration cap exceeded') {
    super(message);
  }
}

/**
 * Thrown when an agent run exceeds its allotted wall-clock time.
 */
export class TimeoutExceededError extends SafeguardError {
  readonly reason = 'timeout';

  constructor(message = 'Timeout exceeded') {
    super(message);
  }
}

/**
 * Thrown when an agent run is explicitly killed via the kill switch.
 */
export class KillSwitchTrippedError extends SafeguardError {
  readonly reason = 'kill_switch';

  constructor(message = 'Kill switch tripped') {
    super(message);
  }
}

/**
 * Type guard narrowing an unknown value to a `SafeguardError`.
 */
export function isSafeguardError(err: unknown): err is SafeguardError {
  return err instanceof SafeguardError;
}
