import { KillSwitch } from './kill-switch';
import { KillSwitchTrippedError } from './errors';

describe('KillSwitch', () => {
  it('is not killed before kill is called', () => {
    const sw = new KillSwitch();

    expect(sw.isKilled).toBe(false);
  });

  it('checkpoint does not throw before kill', () => {
    const sw = new KillSwitch();

    expect(() => sw.checkpoint()).not.toThrow();
  });

  it('checkpoint throws KillSwitchTrippedError after kill', () => {
    const sw = new KillSwitch();

    sw.kill();

    expect(sw.isKilled).toBe(true);
    expect(() => sw.checkpoint()).toThrow(KillSwitchTrippedError);
  });

  it('kill is idempotent', () => {
    const sw = new KillSwitch();

    sw.kill();
    sw.kill();

    expect(sw.isKilled).toBe(true);
    expect(() => sw.checkpoint()).toThrow(KillSwitchTrippedError);
  });
});
