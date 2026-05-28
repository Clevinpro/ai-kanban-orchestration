import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig, type UserConfig } from 'vitest/config';
import rootConfig from '../../vitest.config';

export default mergeConfig(
  rootConfig as UserConfig,
  defineConfig({
    root: path.dirname(fileURLToPath(import.meta.url)),
    test: {
      silent: false,
      reporters: ['default'],
      include: ['src/**/*.{spec,test}.{ts,tsx}'],
    },
  }),
);
