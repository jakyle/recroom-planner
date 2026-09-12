import { defineConfig } from '@playwright/test';

const baseURL = process.env.PW_BASE_URL ?? 'http://localhost:5173/recroom-planner/';
const remote = Boolean(process.env.PW_BASE_URL);

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  retries: 0,
  workers: 1,
  use: { baseURL, headless: true },
  webServer: remote ? undefined : {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173/recroom-planner/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
