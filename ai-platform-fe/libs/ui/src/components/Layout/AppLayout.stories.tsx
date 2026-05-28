import { Card, Menu, Typography } from 'antd';
import type { Meta, StoryObj } from '@storybook/react';

import { AppLayout } from './AppLayout';

const meta: Meta<typeof AppLayout> = {
  title: 'Shared/AppLayout',
  component: AppLayout,
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    header: {
      control: 'text',
      description: 'Top bar content.',
    },
    sidebar: {
      control: 'text',
      description: 'Left navigation content.',
    },
    children: {
      control: 'text',
      description: 'Main page body.',
    },
  },
};

export default meta;

type Story = StoryObj<typeof AppLayout>;

export const Primary: Story = {
  args: {
    header: 'AI Platform',
    sidebar: 'Dashboard',
    children: 'Shared workspace content',
  },
  render: ({ header, sidebar, children }) => (
    <AppLayout
      header={
        <Typography.Title level={4} style={{ color: '#fff', margin: 0 }}>
          {header}
        </Typography.Title>
      }
      sidebar={
        <Menu
          mode="inline"
          selectedKeys={['dashboard']}
          items={[{ key: 'dashboard', label: sidebar }]}
        />
      }
    >
      <Card>
        <Typography.Paragraph style={{ marginBottom: 0 }}>{children}</Typography.Paragraph>
      </Card>
    </AppLayout>
  ),
};
