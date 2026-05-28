import { ConfigProvider } from 'antd';
import 'antd/dist/reset.css';
import { createElement } from 'react';
import type { Preview } from '@storybook/react';

const preview: Preview = {
  decorators: [
    (Story) =>
      createElement(
        ConfigProvider,
        {
          theme: {
            token: {
              borderRadius: 8,
              colorPrimary: '#1677ff',
            },
          },
        },
        createElement(Story),
      ),
  ],
  parameters: {
    a11y: {
      test: 'todo',
    },
    controls: {
      expanded: true,
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
