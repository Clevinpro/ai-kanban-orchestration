import { MaxIterationsError } from './errors';
import { IterationCap } from './iteration-cap';

describe('IterationCap', () => {
  describe('pass path (count <= max)', () => {
    it('does not throw while incrementing below the max', () => {
      const cap = new IterationCap(3);

      expect(() => {
        cap.increment();
        cap.increment();
      }).not.toThrow();

      expect(cap.current).toBe(2);
    });

    it('allows incrementing up to exactly max', () => {
      const cap = new IterationCap(3);

      expect(() => {
        cap.increment();
        cap.increment();
        cap.increment();
      }).not.toThrow();

      expect(cap.current).toBe(3);
    });
  });

  describe('throw path (count > max)', () => {
    it('throws MaxIterationsError on the increment that would exceed max', () => {
      const cap = new IterationCap(2);

      cap.increment();
      cap.increment();

      expect(() => cap.increment()).toThrow(MaxIterationsError);
      // Count is unchanged after a rejected increment.
      expect(cap.current).toBe(2);
    });

    it('throws immediately when max is zero', () => {
      const cap = new IterationCap(0);

      expect(() => cap.increment()).toThrow(MaxIterationsError);
      expect(cap.current).toBe(0);
    });
  });
});
