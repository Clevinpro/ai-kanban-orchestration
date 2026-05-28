import type { Meta, StoryObj } from '@storybook/react';

import { ChatMessageList } from './ChatMessageList';

const meta: Meta<typeof ChatMessageList> = {
  title: 'Shared/ChatMessageList',
  component: ChatMessageList,
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    messages: {
      control: 'object',
      description: 'Messages rendered in order.',
    },
  },
};

export default meta;

type Story = StoryObj<typeof ChatMessageList>;

export const Empty: Story = {
  args: {
    messages: [],
  },
};

export const WithMessages: Story = {
  args: {
    messages: [
      {
        id: '1',
        role: 'user',
        content: 'Can you explain this upload?',
        createdAt: '2026-05-13T09:30:00.000Z',
      },
      {
        id: '2',
        role: 'assistant',
        content: 'Sure. It contains the product requirements and the release notes.',
        createdAt: '2026-05-13T09:31:00.000Z',
        responseSeconds: 8,
      },
      {
        id: '3',
        role: 'user',
        content: 'Give me the short version.',
        createdAt: '2026-05-13T09:32:00.000Z',
      },
      {
        id: '4',
        role: 'assistant',
        content: 'The document describes scope, risks, and rollout steps for the release.',
        createdAt: '2026-05-13T09:33:00.000Z',
        responseSeconds: 26,
      },
    ],
  },
};

export const Streaming: Story = {
  args: {
    messages: [
      {
        id: '1',
        role: 'user',
        content: 'Draft a reply for the customer.',
        createdAt: '2026-05-13T09:34:00.000Z',
      },
      {
        id: '2',
        role: 'assistant',
        content: '',
        createdAt: '2026-05-13T09:34:00.000Z',
        status: 'Sending request to the model...',
        responseSeconds: 38,
      },
    ],
  },
};
