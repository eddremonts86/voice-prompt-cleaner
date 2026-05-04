import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config for Voice Prompt Cleaner.
 *
 * Strategy:
 *  - Run only Chromium — Web Speech API needs a real browser, but the suite
 *    mocks `SpeechRecognition` so cross-browser parity isn't valuable here.
 *  - Use the dev server on port 5180. Reuses an already-running `pnpm dev`
 *    when available; otherwise Playwright starts one.
 *  - Hermetic: every spec must mock `/chat/completions`. Real network calls
 *    are caught by the global `route` handler in fixtures.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // shared dev server + localStorage state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5180',
    trace: 'on-first-retry',
    actionTimeout: 5_000,
    navigationTimeout: 15_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev --port 5180',
    url: 'http://localhost:5180',
    reuseExistingServer: true,
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: 30_000,
  },
});
