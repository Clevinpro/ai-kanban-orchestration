import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const workspaceRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  envDir: workspaceRoot,
  plugins: [react()],
  resolve: {
    alias: {
      '@libs/ui': path.join(workspaceRoot, 'libs/ui/src/index.ts'),
      '@libs/api': path.join(workspaceRoot, 'libs/api/src/index.ts'),
      '@libs/store': path.join(workspaceRoot, 'libs/store/src/index.ts'),
      'auth/Module': path.join(workspaceRoot, 'apps/auth/src/remote-entry.ts'),
      'chat/Module': path.join(workspaceRoot, 'apps/chat/src/remote-entry.ts'),
      'docs/Module': path.join(workspaceRoot, 'apps/docs/src/remote-entry.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['@testing-library/jest-dom/vitest'],
    coverage: {
      provider: 'v8',
      all: false,
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/*.d.ts', '**/remote-entry.ts', '**/*.{test,spec}.{ts,tsx}'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
