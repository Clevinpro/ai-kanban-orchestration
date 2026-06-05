import { AgentKilledError } from './errors';

/**
 * Manual abort mechanism for an agent run.
 *
 * Pure class: no NestJS DI, no I/O. Once `kill()` is called the switch latches
 * into the killed state permanently; every subsequent `checkpoint()` throws
 * `AgentKilledError`. The runner's Observable teardown trips this on
 * unsubscribe so in-flight work can bail out at the next checkpoint.
 */
export class KillSwitch {
  private killed = false;

  /**
   * Latch the switch into the killed state. Idempotent — calling it more than
   * once has no additional effect.
   */
  kill(): void {
    this.killed = true;
  }

  /**
   * Return normally while the switch is live. Throws `AgentKilledError` once
   * `kill()` has been called.
   */
  checkpoint(): void {
    if (this.killed) {
      throw new AgentKilledError('Agent run was killed');
    }
  }
}
