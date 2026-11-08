import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `SINGLE_FILE=1 vite build` inlines everything into one index.html that can be
// copied to a phone and opened with no server at all.
const single = process.env.SINGLE_FILE === '1';

export default defineConfig({
  base: './',
  plugins: [preact(), ...(single ? [viteSingleFile()] : [])],
  build: {
    outDir: single ? 'dist-single' : 'dist',
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
