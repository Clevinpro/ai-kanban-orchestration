import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ToolCallList, type ToolCallItem } from './ToolCallList';

// antd's List subscribes to responsive breakpoints via `window.matchMedia`,
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

describe('ToolCallList', () => {
  it('renders nothing for an empty list', () => {
    const { container } = render(<ToolCallList calls={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one row per tool call', () => {
    const calls: ToolCallItem[] = [
      { tool: 'similaritySearch', input: 'budget thresholds', state: 'done' },
      { tool: 'tagFetch', input: 'release-notes', state: 'pending' },
    ];

    render(<ToolCallList calls={calls} />);

    expect(screen.getAllByTestId(/^tool-call-\d+$/)).toHaveLength(2);
  });

  it('renders the dynamic tool name and input rather than a hardcoded one', () => {
    render(<ToolCallList calls={[{ tool: 'customTool', input: 'my query', state: 'pending' }]} />);

    expect(screen.getByText('customTool')).toBeInTheDocument();
    expect(screen.getByText('my query')).toBeInTheDocument();
  });

  it('reflects the derived state with readable labels', () => {
    render(
      <ToolCallList
        calls={[
          { tool: 'a', state: 'pending' },
          { tool: 'b', state: 'done' },
        ]}
      />,
    );

    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });
});
