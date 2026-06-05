import { AgentKilledError } from './errors';
import { KillSwitch } from './kill-switch';

describe('KillSwitch', () => {
  describe('pass path (not killed)', () => {
    it('does not throw on checkpoint before kill', () => {
      const sw = new KillSwitch();

      expect(() => sw.checkpoint()).not.toThrow();
    });

    it('allows repeated checkpoints while live', () => {
      const sw = new KillSwitch();

      expect(() => {
        sw.checkpoint();
        sw.checkpoint();
      }).not.toThrow();
    });
  });

  describe('throw path (killed)', () => {
    it('throws AgentKilledError on checkpoint after kill', () => {
      const sw = new KillSwitch();

      sw.kill();

      expect(() => sw.checkpoint()).toThrow(AgentKilledError);
    });

    it('stays killed across multiple kill calls and checkpoints', () => {
      const sw = new KillSwitch();

      sw.kill();
      sw.kill();

      expect(() => sw.checkpoint()).toThrow(AgentKilledError);
      expect(() => sw.checkpoint()).toThrow(AgentKilledError);
    });
  });
});
