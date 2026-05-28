import { Card, Typography } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import type { Meta, StoryObj } from '@storybook/react';

import { ProtectedRoute } from './ProtectedRoute';

const meta: Meta<typeof ProtectedRoute> = {
  title: 'Shared/ProtectedRoute',
  component: ProtectedRoute,
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/protected']}>
        <Story />
      </MemoryRouter>
    ),
  ],
  argTypes: {
    isAuthenticated: {
      control: 'boolean',
      description: 'Whether protected content should be rendered.',
    },
    loginPath: {
      control: 'text',
      description: 'Redirect target when unauthenticated.',
    },
    children: {
      control: 'text',
      description: 'Protected content.',
    },
  },
};

export default meta;

type Story = StoryObj<typeof ProtectedRoute>;

export const Primary: Story = {
  args: {
    isAuthenticated: true,
    loginPath: '/login',
    children: 'Authenticated content is visible.',
  },
  render: (args) => (
    <ProtectedRoute {...args}>
      <Card>
        <Typography.Text>{args.children}</Typography.Text>
      </Card>
    </ProtectedRoute>
  ),
};
