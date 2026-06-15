import { Timeout } from './timeout';
import { TimeoutExceededError } from './errors';

/**
 * Deterministic fake clock: returns whatever `value` is set to, letting tests
 * advance wall-clock time without real timers or `setTimeout` waits.
 */
function fakeClock(initial: number): { now: () => number; set: (v: number) => void } {
  let value = initial;
  return {
    now: () => value,
    set: (v: number) => {
      value = v;
    },
  };
}

describe('Timeout', () => {
  it('does not throw before the limit is reached', () => {
    const clock = fakeClock(1000);
    const timeout = new Timeout(5000, clock.now);

    clock.set(1000 + 4999);

    expect(() => timeout.check()).not.toThrow();
  });

  it('throws TimeoutExceededError once the limit is reached', () => {
    const clock = fakeClock(1000);
    const timeout = new Timeout(5000, clock.now);

    clock.set(1000 + 5000);

    expect(() => timeout.check()).toThrow(TimeoutExceededError);
  });

  it('throws TimeoutExceededError once the limit is exceeded', () => {
    const clock = fakeClock(0);
    const timeout = new Timeout(100, clock.now);

    clock.set(250);

    expect(() => timeout.check()).toThrow(TimeoutExceededError);
  });

  it('exposes elapsed time via the elapsedMs getter', () => {
    const clock = fakeClock(2000);
    const timeout = new Timeout(5000, clock.now);

    expect(timeout.elapsedMs).toBe(0);

    clock.set(2000 + 1234);

    expect(timeout.elapsedMs).toBe(1234);
  });
});
