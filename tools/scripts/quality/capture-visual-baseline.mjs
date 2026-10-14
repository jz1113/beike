#!/usr/bin/env node
/** Capture the current UI into .local/visual-baseline for later Vue migration diffs. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const base = process.env.BEIKE_UI_URL || 'http://127.0.0.1:5173';
const out = path.join(root, '.local/visual-baseline');
const chrome = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const routes = ['/', '/generate', '/assets', '/workshop', '/settings'];

if (!fs.existsSync(chrome)) {
  console.error(`未找到 Chrome：${chrome}`);
  process.exit(1);
}
const probe = spawnSync('curl', ['-fsS', '-o', '/dev/null', '--max-time', '3', base], { encoding: 'utf8' });
if (probe.status !== 0) {
  console.error(`界面未在 ${base} 响应。先启动 pnpm dev:web，或设置 BEIKE_UI_URL。`);
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });
for (const route of routes) {
  const name = route === '/' ? 'home' : route.slice(1).replace(/\//g, '-');
  const target = path.join(out, `${name}.png`);
  const result = spawnSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--window-size=1440,900',
    '--virtual-time-budget=8000',
    `--screenshot=${target}`,
    base + route,
  ], { encoding: 'utf8' });
  if (result.status !== 0 || !fs.existsSync(target)) {
    console.error(result.stderr || `截图失败 ${route}`);
    process.exit(result.status || 1);
  }
  console.log(`[visual] ${target}`);
}
