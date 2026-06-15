import { IterationCap } from './iteration-cap';
import { IterationCapExceededError } from './errors';

describe('IterationCap', () => {
  it('starts at zero before any increment', () => {
    const cap = new IterationCap(3);

    expect(cap.current).toBe(0);
  });

  it('increments up to the cap without throwing', () => {
    const cap = new IterationCap(3);

    expect(cap.increment()).toBe(1);
    expect(cap.increment()).toBe(2);
    expect(cap.increment()).toBe(3);
    expect(cap.current).toBe(3);
  });

  it('throws IterationCapExceededError once the cap is exceeded', () => {
    const cap = new IterationCap(2);

    cap.increment();
    cap.increment();

    expect(() => cap.increment()).toThrow(IterationCapExceededError);
  });

  it('does not advance the counter when the cap is exceeded', () => {
    const cap = new IterationCap(1);

    cap.increment();

    expect(() => cap.increment()).toThrow(IterationCapExceededError);
    expect(cap.current).toBe(1);
  });
});
