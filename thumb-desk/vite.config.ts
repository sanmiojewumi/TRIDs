import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'es2022',
  },
  server: { host: true, port: 4173 },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
