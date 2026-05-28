import { fn } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react';

import { ChatInput } from './ChatInput';

const meta: Meta<typeof ChatInput> = {
  title: 'Shared/ChatInput',
  component: ChatInput,
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    onSend: {
      action: 'sent',
      description: 'Called when the user submits a message.',
    },
    isLoading: {
      control: 'boolean',
      description: 'Shows the loading state and prevents sending.',
    },
  },
};

export default meta;

type Story = StoryObj<typeof ChatInput>;

export const Default: Story = {
  args: {
    isLoading: false,
    onSend: fn(),
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
    onSend: fn(),
  },
};
