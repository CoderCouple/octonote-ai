import { defineConfig } from 'vite';

// Server library build (Node / edge runtimes): the handler only; dev.ts is for local use.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'node20',
    ssr: true,
    lib: { entry: { index: 'src/index.ts' }, formats: ['es'] },
    rollupOptions: { external: [/^@anthropic-ai\/sdk($|\/)/, /^octodraw($|\/)/, /^node:/] },
  },
});
