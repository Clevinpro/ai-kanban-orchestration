import { AgentKilledError, BudgetExceededError, MaxIterationsError, TimeoutError } from './errors';

describe('agent safeguard errors', () => {
  const cases: ReadonlyArray<[new (message?: string) => Error, string]> = [
    [BudgetExceededError, 'BudgetExceededError'],
    [MaxIterationsError, 'MaxIterationsError'],
    [TimeoutError, 'TimeoutError'],
    [AgentKilledError, 'AgentKilledError'],
  ];

  it.each(cases)('%p is instanceof Error and carries name %s', (Ctor, name) => {
    const error = new Ctor('boom');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(Ctor);
    expect(error.name).toBe(name);
    expect(error.message).toBe('boom');
  });

  it.each(cases)('%p is throwable and catchable as %s', (Ctor) => {
    expect(() => {
      throw new Ctor('thrown');
    }).toThrow(Ctor);
  });
});
