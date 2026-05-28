import type { StorybookConfig } from 'storybook-react-rsbuild';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: {
    name: 'storybook-react-rsbuild',
    options: {
      strictMode: true,
    },
  },
  core: {
    builder: {
      name: 'storybook-builder-rsbuild',
      options: {
        rsbuildConfigPath: 'libs/ui/rsbuild.config.ts',
        fsCache: true,
      },
    },
  },
  docs: {
    autodocs: true,
  },
  typescript: {
    reactDocgen: 'react-docgen-typescript',
    reactDocgenTypescriptOptions: {
      tsconfigPath: 'libs/ui/tsconfig.json',
    },
  },
};

export default config;
