import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AgentSteps, type AgentStepItem, stepLabel } from './AgentSteps';

// antd's Timeline subscribes to responsive breakpoints via `window.matchMedia`,
// which jsdom does not implement. Provide a no-op stub before rendering.
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

// Vitest is not configured with `globals: true`, so RTL auto-cleanup does not
// run. Tear down the DOM after each test to avoid accumulated renders.
afterEach(() => {
  cleanup();
});

describe('stepLabel', () => {
  it('maps each status to a readable label', () => {
    expect(stepLabel({ iteration: 1, status: 'planning' })).toBe('Planning');
    expect(stepLabel({ iteration: 1, status: 'final' })).toBe('Final answer');
  });

  it('appends the dynamic tool name for tool steps', () => {
    expect(stepLabel({ iteration: 1, status: 'tool_call', tool: 'similaritySearch' })).toBe(
      'Tool call: similaritySearch',
    );
    expect(stepLabel({ iteration: 1, status: 'tool_result', tool: 'tagFetch' })).toBe(
      'Tool result: tagFetch',
    );
  });

  it('does not append a tool name to non-tool steps', () => {
    expect(stepLabel({ iteration: 1, status: 'planning', tool: 'ignored' })).toBe('Planning');
  });
});

describe('AgentSteps', () => {
  it('renders nothing for an empty list', () => {
    const { container } = render(<AgentSteps steps={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders steps in order with correct labels', () => {
    const steps: AgentStepItem[] = [
      { iteration: 1, status: 'planning' },
      { iteration: 1, status: 'tool_call', tool: 'similaritySearch', input: 'budget thresholds' },
      { iteration: 1, status: 'tool_result', tool: 'similaritySearch' },
      { iteration: 2, status: 'final' },
    ];

    render(<AgentSteps steps={steps} />);

    const rendered = screen.getAllByTestId(/^agent-step-\d+$/);
    expect(rendered).toHaveLength(4);

    const text = rendered.map((node) => node.textContent);
    expect(text[0]).toContain('Planning');
    expect(text[1]).toContain('Tool call: similaritySearch');
    expect(text[2]).toContain('Tool result: similaritySearch');
    expect(text[3]).toContain('Final answer');
  });

  it('renders the dynamic tool name rather than a hardcoded one', () => {
    render(<AgentSteps steps={[{ iteration: 1, status: 'tool_call', tool: 'customTool' }]} />);
    expect(screen.getByText('Tool call: customTool')).toBeInTheDocument();
  });

  it('renders the step input when present', () => {
    render(
      <AgentSteps
        steps={[{ iteration: 1, status: 'tool_call', tool: 'tagFetch', input: 'release-notes' }]}
      />,
    );
    expect(screen.getByText('release-notes')).toBeInTheDocument();
  });
});
