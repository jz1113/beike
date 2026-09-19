#!/usr/bin/env node
/**
 * Tauri beforeDevCommand：复检 API / Vite 是否已由 tauri-dev 监督器拉起。
 */
import { readDesktopPort } from './desktop-port.mjs';
import { getRepoRoot, healthOk, viteOk } from './desktop-dev-shared.mjs';

const root = getRepoRoot();
const apiPort = readDesktopPort(root);

async function pollUntilOk(checkFn, maxAttempts = 15, delayMs = 300) {
  for (let i = 0; i < maxAttempts; i += 1) {
    if (await checkFn()) return true;
    if (i < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

const apiReady = await pollUntilOk(() => healthOk(apiPort));
const viteReady = await pollUntilOk(viteOk);

if (!apiReady) {
  console.error(`✗ API 未就绪：http://127.0.0.1:${apiPort}`);
  console.error('  请使用 npm run tauri:dev 启动，或先运行 npm run dev:desktop');
  process.exit(1);
}

if (!viteReady) {
  console.error('✗ Vite 未就绪：http://127.0.0.1:5173');
  console.error('  请使用 npm run tauri:dev 启动，或先运行 npm run dev:desktop');
  process.exit(1);
}

console.log(`✓ 开发服务已就绪（API :${apiPort} · Vite :5173）`);
process.exit(0);
