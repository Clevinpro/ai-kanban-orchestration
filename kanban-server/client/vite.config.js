import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/events': {
        target: 'http://localhost:6111',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Connection', 'keep-alive');
          });
        },
      },
      '/tasks': {
        target: 'http://localhost:6111',
        changeOrigin: true,
      },
      '/epics': {
        target: 'http://localhost:6111',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:6111',
        changeOrigin: true,
      },
      '/stop': {
        target: 'http://localhost:6111',
        changeOrigin: true,
      },
    },
  },
});
