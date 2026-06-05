import type { Meta, StoryObj } from '@storybook/react';

import { AgentSteps } from './AgentSteps';

const meta: Meta<typeof AgentSteps> = {
  title: 'Shared/AgentSteps',
  component: AgentSteps,
  parameters: {
    layout: 'padded',
  },
};

export default meta;

type Story = StoryObj<typeof AgentSteps>;

export const Running: Story = {
  args: {
    steps: [
      { iteration: 1, status: 'completed', label: 'Plan the task' },
      { iteration: 2, status: 'completed', label: 'Search knowledge base' },
      { iteration: 3, status: 'running', label: 'Call documents tool' },
    ],
  },
};

export const Completed: Story = {
  args: {
    steps: [
      { iteration: 1, status: 'completed', label: 'Plan the task' },
      { iteration: 2, status: 'completed', label: 'Search knowledge base' },
      { iteration: 3, status: 'completed', label: 'Compose final answer' },
    ],
  },
};

export const WithError: Story = {
  args: {
    steps: [
      { iteration: 1, status: 'completed', label: 'Plan the task' },
      { iteration: 2, status: 'completed', label: 'Search knowledge base' },
      { iteration: 3, status: 'error', label: 'Call documents tool' },
    ],
  },
};
