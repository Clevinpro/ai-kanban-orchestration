import type { Meta, StoryObj } from '@storybook/react';

import { ToolCallList } from './ToolCallList';

const meta: Meta<typeof ToolCallList> = {
  title: 'Shared/ToolCallList',
  component: ToolCallList,
  parameters: {
    layout: 'padded',
  },
};

export default meta;

type Story = StoryObj<typeof ToolCallList>;

// No tool calls yet -> renders nothing.
export const Empty: Story = {
  args: {
    calls: [],
  },
};

// A single tool call still awaiting its result.
export const SingleCall: Story = {
  args: {
    calls: [{ tool: 'similaritySearch', input: 'budget thresholds', state: 'pending' }],
  },
};

// Multiple tool calls in mixed states.
export const MultiCall: Story = {
  args: {
    calls: [
      { tool: 'similaritySearch', input: 'budget thresholds', state: 'done' },
      { tool: 'tagFetch', input: 'release-notes', state: 'done' },
      { tool: 'customTool', input: 'still running', state: 'pending' },
    ],
  },
};
