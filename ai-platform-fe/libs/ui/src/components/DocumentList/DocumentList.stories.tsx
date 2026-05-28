import { fn } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react';

import { DocumentList } from './DocumentList';

const meta: Meta<typeof DocumentList> = {
  title: 'Shared/DocumentList',
  component: DocumentList,
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    documents: {
      control: 'object',
      description: 'Documents rendered in the list.',
    },
    onRemove: {
      action: 'removed',
      description: 'Called when user removes a document from the list.',
    },
  },
};

export default meta;

type Story = StoryObj<typeof DocumentList>;

export const Primary: Story = {
  args: {
    documents: [
      { id: 'doc-1', name: 'Product requirements.pdf' },
      { id: 'doc-2', name: 'Architecture notes.md' },
      { id: 'doc-3', name: 'Release checklist.txt' },
    ],
    onRemove: fn(),
  },
};
