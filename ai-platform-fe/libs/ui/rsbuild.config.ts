import { join } from 'path';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig({
  plugins: [pluginReact()],
  source: {
    // Resolve workspace `@libs/*` path aliases (defined in tsconfig.base.json)
    // so Storybook can bundle components that import sibling libs.
    tsconfigPath: join(__dirname, '../../tsconfig.base.json'),
  },
});
