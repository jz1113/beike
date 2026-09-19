#!/usr/bin/env node
/**
 * 独立启动 Hono API 与 Vite UI（detached 模式，供 `npm run dev:desktop` 使用）。
 */
import { readDesktopPort } from './desktop-port.mjs';
import { ensureDevServices, getRepoRoot } from './desktop-dev-shared.mjs';

const repoRoot = getRepoRoot();
const apiPort = readDesktopPort(repoRoot);

const result = await ensureDevServices({
  apiPort,
  mode: 'detached',
});

process.exit(result.ok ? 0 : 1);
