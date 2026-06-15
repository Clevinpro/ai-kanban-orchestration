import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ChatRequestDto } from './ai.dto';

const validate = (input: Record<string, unknown>) =>
  validateSync(plainToInstance(ChatRequestDto, input), { whitelist: true });

describe('ChatRequestDto validation', () => {
  it('accepts a minimal valid chat request without agent fields', () => {
    expect(validate({ message: 'hi' })).toHaveLength(0);
  });

  it('accepts valid mode and positive integer limits', () => {
    expect(
      validate({
        message: 'hi',
        mode: 'agent',
        maxIterations: 5,
        tokenBudget: 1000,
        timeoutMs: 30000,
      }),
    ).toHaveLength(0);
  });

  it('rejects an unknown mode', () => {
    const errors = validate({ message: 'hi', mode: 'turbo' });
    expect(errors.map((e) => e.property)).toContain('mode');
  });

  it('rejects a negative maxIterations', () => {
    const errors = validate({ message: 'hi', maxIterations: -1 });
    expect(errors.map((e) => e.property)).toContain('maxIterations');
  });

  it('rejects a zero tokenBudget', () => {
    const errors = validate({ message: 'hi', tokenBudget: 0 });
    expect(errors.map((e) => e.property)).toContain('tokenBudget');
  });

  it('rejects a non-integer timeoutMs', () => {
    const errors = validate({ message: 'hi', timeoutMs: 1.5 });
    expect(errors.map((e) => e.property)).toContain('timeoutMs');
  });
});
