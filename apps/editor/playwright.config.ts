import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// The pre-installed browser in some environments is older than the Playwright package; point
// at it explicitly when present so no download is needed.
const preinstalled = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = process.env['PW_CHROMIUM'] ?? (existsSync(preinstalled) ? preinstalled : undefined);

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1400, height: 900 },
    launchOptions: { ...(executablePath ? { executablePath } : {}), args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: [
    {
      command: 'pnpm exec vite preview --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173/projects',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      // The generation service with the deterministic fake provider.
      command: 'uv run --project ../api uvicorn beze_api.main:app --host 127.0.0.1 --port 8000',
      url: 'http://127.0.0.1:8000/api/healthz',
      reuseExistingServer: true,
      timeout: 60_000,
      env: { BEZE_AI_PROVIDER: 'fake' },
    },
  ],
});
