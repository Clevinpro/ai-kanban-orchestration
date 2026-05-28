import { Card } from 'antd';
import type { Meta, StoryObj } from '@storybook/react';

import { RegisterForm } from './RegisterForm';

const meta: Meta<typeof RegisterForm> = {
  title: 'Shared/Auth/RegisterForm',
  component: RegisterForm,
  decorators: [
    (Story) => (
      <Card style={{ maxWidth: 420 }}>
        <Story />
      </Card>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof RegisterForm>;

export const Default: Story = {
  args: {},
};

export const PasswordMismatch: Story = {
  args: {
    error: 'Passwords do not match',
    initialValues: {
      name: 'Jane Doe',
      email: 'user@example.com',
      password: 'password123',
      confirmPassword: 'password124',
    },
  },
};
