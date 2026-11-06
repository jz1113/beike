import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'beike-browser-'));
const results = mkdtempSync(join(tmpdir(), 'beike-browser-results-'));
try {
  const cli = import.meta.resolve('@playwright/test/cli');
  const result = spawnSync(process.execPath, [fileURLToPath(cli), 'test', '--config', 'tools/configs/playwright.config.ts', ...process.argv.slice(2)], {
    env: { ...process.env, BEIKE_BROWSER_DATA_DIR: dir, BEIKE_BROWSER_RESULTS: results },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
  if (process.exitCode) console.error('Playwright traces: ' + results);
  else rmSync(results, { recursive: true, force: true });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
