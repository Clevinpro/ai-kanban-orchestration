import type { Meta, StoryObj } from '@storybook/react';

import { ChatMessage } from './ChatMessage';

const meta: Meta<typeof ChatMessage> = {
  title: 'Shared/ChatMessage',
  component: ChatMessage,
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    role: {
      control: 'select',
      options: ['user', 'assistant'],
      description: 'Message author role.',
    },
    content: {
      control: 'text',
      description: 'Message text content.',
    },
  },
};

export default meta;

type Story = StoryObj<typeof ChatMessage>;

export const User: Story = {
  args: {
    role: 'user',
    content: 'Can you summarize this document?',
    createdAt: '2026-05-13T09:30:00.000Z',
  },
};

export const Assistant: Story = {
  args: {
    role: 'assistant',
    content: 'Here is a concise answer from the assistant.',
    createdAt: '2026-05-13T09:31:00.000Z',
    responseSeconds: 8,
  },
};

export const Streaming: Story = {
  args: {
    role: 'assistant',
    content: '',
    createdAt: '2026-05-13T09:32:00.000Z',
    status: 'Searching relevant context...',
    responseSeconds: 14,
  },
};
