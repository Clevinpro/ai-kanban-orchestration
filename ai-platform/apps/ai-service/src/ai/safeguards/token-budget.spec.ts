import { TokenBudget } from './token-budget';
import { TokenBudgetExceededError } from './errors';

describe('TokenBudget', () => {
  it('does not throw while under budget', () => {
    const budget = new TokenBudget(100);

    expect(() => budget.track({ tokens: 30 })).not.toThrow();
    expect(() => budget.track({ tokens: 40 })).not.toThrow();
    expect(budget.tokensUsed).toBe(70);
  });

  it('uses provider-reported tokens directly', () => {
    const budget = new TokenBudget(1000);

    budget.track({ tokens: 250 });

    expect(budget.tokensUsed).toBe(250);
  });

  it('estimates tokens locally from a raw string (ceil length / 4)', () => {
    const budget = new TokenBudget(1000);

    // 10 chars -> ceil(10 / 4) = 3 tokens
    budget.track('abcdefghij');

    expect(budget.tokensUsed).toBe(3);
  });

  it('estimates tokens locally from an object text field when tokens absent', () => {
    const budget = new TokenBudget(1000);

    // 7 chars -> ceil(7 / 4) = 2 tokens
    budget.track({ text: 'abcdefg' });

    expect(budget.tokensUsed).toBe(2);
  });

  it('throws TokenBudgetExceededError once cumulative tokens exceed budget', () => {
    const budget = new TokenBudget(50);

    budget.track({ tokens: 30 });

    expect(() => budget.track({ tokens: 25 })).toThrow(TokenBudgetExceededError);
    expect(budget.tokensUsed).toBe(55);
  });

  it('does not throw when total exactly equals the budget', () => {
    const budget = new TokenBudget(50);

    expect(() => budget.track({ tokens: 50 })).not.toThrow();
    expect(budget.tokensUsed).toBe(50);
  });
});
