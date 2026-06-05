import { TimeoutError } from './errors';
import { Timeout } from './timeout';

describe('Timeout', () => {
  let nowSpy: jest.SpyInstance<number, []>;

  afterEach(() => {
    nowSpy?.mockRestore();
  });

  /**
   * Drive `Date.now()` deterministically: the first call (construction) returns
   * `start`; every subsequent call returns `start + offset`. This simulates
   * elapsed wall-clock time without real timers or sleeping.
   */
  const mockClock = (start: number, offset: number): void => {
    nowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValueOnce(start)
      .mockReturnValue(start + offset);
  };

  describe('pass path (within limit)', () => {
    it('does not throw when elapsed is below the limit', () => {
      mockClock(1_000, 500);
      const timeout = new Timeout(1_000);

      expect(() => timeout.check()).not.toThrow();
      expect(timeout.elapsed).toBe(500);
    });

    it('does not throw when elapsed equals the limit', () => {
      mockClock(1_000, 1_000);
      const timeout = new Timeout(1_000);

      expect(() => timeout.check()).not.toThrow();
      expect(timeout.elapsed).toBe(1_000);
    });
  });

  describe('throw path (over limit)', () => {
    it('throws TimeoutError when elapsed exceeds the limit', () => {
      mockClock(1_000, 1_500);
      const timeout = new Timeout(1_000);

      expect(() => timeout.check()).toThrow(TimeoutError);
      expect(timeout.elapsed).toBe(1_500);
    });

    it('throws immediately when the limit is zero and time has advanced', () => {
      mockClock(1_000, 1);
      const timeout = new Timeout(0);

      expect(() => timeout.check()).toThrow(TimeoutError);
    });
  });
});
