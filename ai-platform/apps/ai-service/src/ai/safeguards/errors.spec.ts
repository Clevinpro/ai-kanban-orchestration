import {
  SafeguardError,
  TokenBudgetExceededError,
  IterationCapExceededError,
  TimeoutExceededError,
  KillSwitchTrippedError,
  isSafeguardError,
} from './errors';
import type { SafeguardReason } from './errors';

describe('safeguard errors', () => {
  const cases: Array<{
    name: string;
    create: () => SafeguardError;
    ctor: new (message?: string) => SafeguardError;
    reason: SafeguardReason;
  }> = [
    {
      name: 'TokenBudgetExceededError',
      create: () => new TokenBudgetExceededError(),
      ctor: TokenBudgetExceededError,
      reason: 'token_budget',
    },
    {
      name: 'IterationCapExceededError',
      create: () => new IterationCapExceededError(),
      ctor: IterationCapExceededError,
      reason: 'iteration_cap',
    },
    {
      name: 'TimeoutExceededError',
      create: () => new TimeoutExceededError(),
      ctor: TimeoutExceededError,
      reason: 'timeout',
    },
    {
      name: 'KillSwitchTrippedError',
      create: () => new KillSwitchTrippedError(),
      ctor: KillSwitchTrippedError,
      reason: 'kill_switch',
    },
  ];

  describe.each(cases)('$name', ({ name, create, ctor, reason }) => {
    it('is an instance of Error, SafeguardError, and its own class', () => {
      const err = create();
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(SafeguardError);
      expect(err).toBeInstanceOf(ctor);
    });

    it('carries the correct reason discriminator', () => {
      expect(create().reason).toBe(reason);
    });

    it('sets name to its class name', () => {
      expect(create().name).toBe(name);
    });

    it('is recognized by isSafeguardError', () => {
      expect(isSafeguardError(create())).toBe(true);
    });

    it('preserves a custom message', () => {
      const err = new ctor('custom');
      expect(err.message).toBe('custom');
    });
  });

  describe('isSafeguardError', () => {
    it('returns false for a plain Error', () => {
      expect(isSafeguardError(new Error('plain'))).toBe(false);
    });

    it('returns false for non-error values', () => {
      expect(isSafeguardError(null)).toBe(false);
      expect(isSafeguardError(undefined)).toBe(false);
      expect(isSafeguardError('token_budget')).toBe(false);
      expect(isSafeguardError({ reason: 'token_budget' })).toBe(false);
    });
  });
});
