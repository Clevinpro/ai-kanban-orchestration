import type { Meta, StoryObj } from '@storybook/react';

import { BudgetIndicator } from './BudgetIndicator';

const meta: Meta<typeof BudgetIndicator> = {
  title: 'Shared/BudgetIndicator',
  component: BudgetIndicator,
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    iteration: { control: 'number', description: 'Iterations used so far.' },
    tokensUsed: { control: 'number', description: 'Tokens consumed so far.' },
    elapsedMs: { control: 'number', description: 'Elapsed time in milliseconds.' },
    maxIterations: { control: 'number', description: 'Iteration limit.' },
    tokenBudget: { control: 'number', description: 'Token budget limit.' },
    timeoutMs: { control: 'number', description: 'Time limit in milliseconds.' },
  },
};

export default meta;

type Story = StoryObj<typeof BudgetIndicator>;

// All bars well under 70% -> green.
export const Low: Story = {
  args: {
    iteration: 1,
    tokensUsed: 500,
    elapsedMs: 2_000,
    maxIterations: 10,
    tokenBudget: 8_000,
    timeoutMs: 30_000,
  },
};

// All bars in the 70-90% band -> yellow.
export const Mid: Story = {
  args: {
    iteration: 8,
    tokensUsed: 6_400,
    elapsedMs: 24_000,
    maxIterations: 10,
    tokenBudget: 8_000,
    timeoutMs: 30_000,
  },
};

// All bars over 90% and clamped at the limit -> red.
export const OverBudget: Story = {
  args: {
    iteration: 12,
    tokensUsed: 9_500,
    elapsedMs: 35_000,
    maxIterations: 10,
    tokenBudget: 8_000,
    timeoutMs: 30_000,
  },
};
