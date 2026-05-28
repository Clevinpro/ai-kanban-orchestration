import { Card } from 'antd';
import type { Meta, StoryObj } from '@storybook/react';

import { LoginForm } from './LoginForm';

const meta: Meta<typeof LoginForm> = {
  title: 'Shared/Auth/LoginForm',
  component: LoginForm,
  decorators: [
    (Story) => (
      <Card style={{ maxWidth: 420 }}>
        <Story />
      </Card>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof LoginForm>;

export const Default: Story = {
  args: {},
};

export const WithError: Story = {
  args: {
    error: 'Invalid email or password',
  },
};

export const Loading: Story = {
  args: {
    loading: true,
  },
};
