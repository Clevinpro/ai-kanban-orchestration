/**
 * Typed error hierarchy for agent safeguards.
 *
 * Each safeguard error extends the native `Error`, sets `name` to its own
 * class name, and remains a valid `instanceof Error`. These are pure classes:
 * no NestJS DI, no I/O.
 */

/**
 * Thrown when an agent run exceeds its configured budget (e.g. token/cost cap).
 */
export class BudgetExceededError extends Error {
  constructor(message?: string) {
    super(message);
    // Restore the prototype chain: when TS downlevels `extends Error` to the
    // project's es2015 target, `super()` resets the prototype to Error.prototype,
    // breaking `instanceof` against this subclass. This is the canonical fix.
    Object.setPrototypeOf(this, BudgetExceededError.prototype);
    this.name = 'BudgetExceededError';
  }
}

/**
 * Thrown when an agent run exceeds its maximum allowed iterations.
 */
export class MaxIterationsError extends Error {
  constructor(message?: string) {
    super(message);
    Object.setPrototypeOf(this, MaxIterationsError.prototype);
    this.name = 'MaxIterationsError';
  }
}

/**
 * Thrown when an agent run exceeds its allotted wall-clock time.
 */
export class TimeoutError extends Error {
  constructor(message?: string) {
    super(message);
    Object.setPrototypeOf(this, TimeoutError.prototype);
    this.name = 'TimeoutError';
  }
}

/**
 * Thrown when an agent run is explicitly killed/cancelled.
 */
export class AgentKilledError extends Error {
  constructor(message?: string) {
    super(message);
    Object.setPrototypeOf(this, AgentKilledError.prototype);
    this.name = 'AgentKilledError';
  }
}
