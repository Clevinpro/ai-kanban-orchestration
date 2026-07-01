import { KillSwitchTrippedError } from './errors';

/**
 * Cooperative cancellation flag for an agent run.
 *
 * Pure class: no NestJS DI, no I/O, no Observable. The agent loop calls
 * {@link checkpoint} at each iteration boundary; an external `AI_CANCEL`
 * consumer calls {@link kill} to abort the run promptly.
 *
 * Instance-per-run: the cancel consumer keeps a `Map<conversationId, KillSwitch>`
 * so a cancel targets the right run. This class stays state-only; the registry
 * lives in the module.
 */
export class KillSwitch {
  private killed = false;

  /**
   * Whether this switch has been tripped.
   */
  get isKilled(): boolean {
    return this.killed;
  }

  /**
   * Trip the switch. Idempotent: repeated calls leave it killed.
   */
  kill(): void {
    this.killed = true;
  }

  /**
   * Abort the run if the switch has been tripped.
   *
   * @throws {KillSwitchTrippedError} when the switch is killed; otherwise
   *   returns without effect.
   */
  checkpoint(): void {
    if (this.killed) {
      throw new KillSwitchTrippedError();
    }
  }
}
