import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    // The diagram route (packages/octodraw-server, `pnpm dev:server`) holds the Anthropic key.
    proxy: { '/api': 'http://localhost:5181' },
  },
});
