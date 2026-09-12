import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  retries: 0,
  workers: 1,
  use: { baseURL: 'http://localhost:5173/recroom-planner/', headless: true },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173/recroom-planner/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
