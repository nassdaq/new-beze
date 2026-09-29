import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Builds the runtime as a single IIFE straight into the editor's public folder so the Play
// iframe and the static export share one artifact.
export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: 'BezeRuntime',
      formats: ['iife'],
      fileName: () => 'beze-runtime.js',
    },
    outDir: resolve(import.meta.dirname, '../../apps/editor/public/runtime'),
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
    target: 'es2020',
  },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  test: { include: ['test/**/*.test.ts'] },
});
