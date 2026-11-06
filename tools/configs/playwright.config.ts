import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const baseURL = 'http://127.0.0.1:' + (process.env.BEIKE_BROWSER_PORT || '3199');

export default defineConfig({
  testDir: '../scripts/web',
  testMatch: '*.browser.test.ts',
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: { baseURL, browserName: 'chromium', serviceWorkers: 'block', trace: 'retain-on-failure' },
  outputDir: process.env.BEIKE_BROWSER_RESULTS || join(tmpdir(), 'beike-browser-results'),
  webServer: {
    command: 'node tools/scripts/web/browser-server.mjs',
    cwd: root,
    url: baseURL + '/api/health',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
