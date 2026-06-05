import type { Meta, StoryObj } from '@storybook/react';

import { BudgetIndicator } from './BudgetIndicator';

const meta: Meta<typeof BudgetIndicator> = {
  title: 'Shared/BudgetIndicator',
  component: BudgetIndicator,
  parameters: {
    layout: 'padded',
  },
};

export default meta;

type Story = StoryObj<typeof BudgetIndicator>;

export const Low: Story = {
  args: {
    iteration: 2,
    maxIterations: 10,
    tokensUsed: 1500,
    tokenBudget: 10000,
    elapsedMs: 4000,
    timeoutMs: 30000,
  },
};

export const Medium: Story = {
  args: {
    iteration: 7,
    maxIterations: 10,
    tokensUsed: 7000,
    tokenBudget: 10000,
    elapsedMs: 21000,
    timeoutMs: 30000,
  },
};

export const NearLimit: Story = {
  args: {
    iteration: 9,
    maxIterations: 10,
    tokensUsed: 9200,
    tokenBudget: 10000,
    elapsedMs: 28000,
    timeoutMs: 30000,
  },
};
