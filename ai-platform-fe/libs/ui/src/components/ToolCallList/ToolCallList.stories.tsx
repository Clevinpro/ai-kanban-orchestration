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

export const Empty: Story = {
  args: {
    toolCalls: [],
  },
};

export const WithCalls: Story = {
  args: {
    toolCalls: [
      {
        tool: 'searchKnowledgeBase',
        input: { query: 'invoice policy', topK: 5 },
        resolved: true,
      },
      {
        tool: 'getDocument',
        input: { documentId: 'doc_123' },
        resolved: true,
      },
      {
        tool: 'summarize',
        input: { length: 'short' },
        resolved: false,
      },
    ],
  },
};
