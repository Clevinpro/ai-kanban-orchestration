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

// No events yet -> renders nothing.
export const Empty: Story = {
  args: {
    steps: [],
  },
};

// Agent is mid-run: planned, called a tool, got a result, still iterating.
export const MidRun: Story = {
  args: {
    steps: [
      { iteration: 1, status: 'planning' },
      { iteration: 1, status: 'tool_call', tool: 'similaritySearch', input: 'budget thresholds' },
      { iteration: 1, status: 'tool_result', tool: 'similaritySearch' },
      { iteration: 2, status: 'planning' },
    ],
  },
};

// Full run ending in a final answer.
export const Completed: Story = {
  args: {
    steps: [
      { iteration: 1, status: 'planning' },
      { iteration: 1, status: 'tool_call', tool: 'tagFetch', input: 'release-notes' },
      { iteration: 1, status: 'tool_result', tool: 'tagFetch' },
      { iteration: 2, status: 'final' },
    ],
  },
};
