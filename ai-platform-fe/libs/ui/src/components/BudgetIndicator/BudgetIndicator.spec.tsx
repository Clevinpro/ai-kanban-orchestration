import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BudgetIndicator, fillPercent, thresholdColor } from './BudgetIndicator';

// Vitest is not configured with `globals: true`, so RTL auto-cleanup does not
// run. Tear down the DOM after each test to avoid accumulated renders.
afterEach(() => {
  cleanup();
});

describe('fillPercent', () => {
  it('computes used/limit as a percentage', () => {
    expect(fillPercent(5, 10)).toBe(50);
    expect(fillPercent(35, 100)).toBe(35);
  });

  it('clamps to 100 when usage exceeds the limit', () => {
    expect(fillPercent(15, 10)).toBe(100);
  });

  it('clamps to 0 for negative usage', () => {
    expect(fillPercent(-5, 10)).toBe(0);
  });

  it('returns 0 for a zero or invalid limit', () => {
    expect(fillPercent(5, 0)).toBe(0);
    expect(fillPercent(5, -10)).toBe(0);
  });
});

describe('thresholdColor', () => {
  it('is green below 70%', () => {
    expect(thresholdColor(0)).toBe('#52c41a');
    expect(thresholdColor(69.9)).toBe('#52c41a');
  });

  it('is yellow in the 70-90% band', () => {
    expect(thresholdColor(70)).toBe('#faad14');
    expect(thresholdColor(90)).toBe('#faad14');
  });

  it('is red above 90%', () => {
    expect(thresholdColor(90.1)).toBe('#f5222d');
    expect(thresholdColor(100)).toBe('#f5222d');
  });
});

describe('BudgetIndicator', () => {
  it('renders three budget bars', () => {
    render(
      <BudgetIndicator
        iteration={1}
        tokensUsed={500}
        elapsedMs={2_000}
        maxIterations={10}
        tokenBudget={8_000}
        timeoutMs={30_000}
      />,
    );

    expect(screen.getByTestId('budget-bar-iterations')).toBeInTheDocument();
    expect(screen.getByTestId('budget-bar-tokens')).toBeInTheDocument();
    expect(screen.getByTestId('budget-bar-time')).toBeInTheDocument();
  });

  it('renders fill % aria-valuenow for each bar', () => {
    render(
      <BudgetIndicator
        iteration={5}
        tokensUsed={4_000}
        elapsedMs={15_000}
        maxIterations={10}
        tokenBudget={8_000}
        timeoutMs={30_000}
      />,
    );

    // All three bars are at 50% usage.
    const bars = screen.getAllByRole('progressbar');
    expect(bars).toHaveLength(3);
    bars.forEach((bar) => {
      expect(bar).toHaveAttribute('aria-valuenow', '50');
    });
  });

  it('clamps an over-budget bar at 100%', () => {
    render(
      <BudgetIndicator
        iteration={12}
        tokensUsed={500}
        elapsedMs={2_000}
        maxIterations={10}
        tokenBudget={8_000}
        timeoutMs={30_000}
      />,
    );

    const iterationsBar = screen
      .getByTestId('budget-bar-iterations')
      .querySelector('[role="progressbar"]');
    expect(iterationsBar).toHaveAttribute('aria-valuenow', '100');
  });

  it('renders the used / limit caption per bar', () => {
    render(
      <BudgetIndicator
        iteration={3}
        tokensUsed={1_200}
        elapsedMs={5_000}
        maxIterations={10}
        tokenBudget={8_000}
        timeoutMs={30_000}
      />,
    );

    expect(screen.getByText('3 / 10')).toBeInTheDocument();
    expect(screen.getByText('1200 / 8000')).toBeInTheDocument();
    expect(screen.getByText('5.0s / 30.0s')).toBeInTheDocument();
  });
});
