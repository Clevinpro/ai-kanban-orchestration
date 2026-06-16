import { ToolRegistry } from './tool-registry';
import type { Tool } from './tool.interface';

/** Build a minimal stub tool for registry tests. */
function makeTool(name: string, description = `desc-${name}`): Tool {
  return {
    name,
    description,
    run: jest.fn(async () => `ran-${name}`),
  };
}

describe('ToolRegistry', () => {
  it('registers a tool and resolves it by name', () => {
    const registry = new ToolRegistry();
    const tool = makeTool('search');

    registry.register(tool);

    expect(registry.get('search')).toBe(tool);
  });

  it('returns undefined for an unknown tool name', () => {
    const registry = new ToolRegistry();

    expect(registry.get('missing')).toBeUndefined();
  });

  it('lists registered tools in registration order', () => {
    const registry = new ToolRegistry();
    const first = makeTool('alpha');
    const second = makeTool('beta');

    registry.register(first);
    registry.register(second);

    expect(registry.list()).toEqual([first, second]);
  });

  it('throws on duplicate tool name', () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('search'));

    expect(() => registry.register(makeTool('search'))).toThrow('Tool already registered: search');
  });

  it('describe enumerates tools deterministically in registration order', () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('alpha', 'first tool'));
    registry.register(makeTool('beta', 'second tool'));

    expect(registry.describe()).toBe('alpha: first tool\nbeta: second tool');
  });

  it('describe returns an empty string when no tools are registered', () => {
    const registry = new ToolRegistry();

    expect(registry.describe()).toBe('');
  });
});
