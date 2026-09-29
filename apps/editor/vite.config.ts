import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: false },
  preview: { port: 4173 },
  build: { sourcemap: false, target: 'es2022' },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
