import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// BASE_PATH lets one build be hosted under a sub-path (GitHub Pages serves the repo at /new-beze/).
export default defineConfig({
  base: process.env['BASE_PATH'] ?? '/',
  plugins: [react()],
  server: { port: 5173, strictPort: false, proxy: { '/api': 'http://127.0.0.1:8000' } },
  preview: { port: 4173, proxy: { '/api': 'http://127.0.0.1:8000' } },
  build: { sourcemap: false, target: 'es2022' },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
