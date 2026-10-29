import { defineConfig } from 'vite';

// Library build: ES modules for the three entries, with icon catalogues and
// other lazily imported modules as separate chunks. Dependencies stay
// external (installed alongside octodraw); React is a peer dependency.
const external = [/^react($|\/)/, /^react-dom($|\/)/, /^yjs($|\/)/, /^y-protocols($|\/)/, /^elkjs($|\/)/, /^@eraserlabs\/layout($|\/)/, /^jspdf($|\/)/, /^svg2pdf\.js($|\/)/, /^fflate($|\/)/];

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
    lib: {
      entry: { index: 'src/index.ts', collab: 'src/collab/index.ts', prompt: 'src/ai/prompt.ts' },
      formats: ['es'],
    },
    rollupOptions: { external },
  },
});
