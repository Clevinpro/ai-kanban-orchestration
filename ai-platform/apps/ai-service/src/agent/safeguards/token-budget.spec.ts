import { BudgetExceededError } from './errors';
import { TokenBudget } from './token-budget';

describe('TokenBudget', () => {
  describe('pass path (cumulative <= limit)', () => {
    it('does not throw while the cumulative total stays under the limit', () => {
      const budget = new TokenBudget(100);

      expect(() => {
        budget.track(30);
        budget.track(40);
      }).not.toThrow();

      expect(budget.getState()).toEqual({ used: 70, limit: 100 });
    });

    it('does not throw when the cumulative total equals the limit exactly', () => {
      const budget = new TokenBudget(100);

      expect(() => {
        budget.track(60);
        budget.track(40);
      }).not.toThrow();

      expect(budget.getState()).toEqual({ used: 100, limit: 100 });
    });
  });

  describe('throw path (cumulative > limit)', () => {
    it('throws BudgetExceededError when a single track exceeds the limit', () => {
      const budget = new TokenBudget(100);

      expect(() => budget.track(101)).toThrow(BudgetExceededError);
    });

    it('throws BudgetExceededError when the cumulative total exceeds the limit', () => {
      const budget = new TokenBudget(100);

      budget.track(80);

      expect(() => budget.track(21)).toThrow(BudgetExceededError);
      expect(budget.getState()).toEqual({ used: 101, limit: 100 });
    });
  });
});
