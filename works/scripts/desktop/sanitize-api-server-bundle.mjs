#!/usr/bin/env node
/**
 * 清理桌面端 api-server 资源中的 npm CLI 符号链接（.bin）与失效软链，
 * 避免 Tauri build 在打包 resources 时因目标不存在而失败。
 */
/**
 * 清理桌面端 api-server 资源中的 npm CLI 符号链接（.bin）与失效软链，
 * 避免 Tauri build 在打包 resources 时因目标不存在而失败。
 */
import { existsSync, readdirSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export function sanitizeBundledNodeModules(root) {
  if (!existsSync(root)) return 0;

  let removed = 0;

  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = join(dir, entry.name);

      if (entry.isSymbolicLink()) {
        if (!existsSync(full)) {
          unlinkSync(full);
          removed += 1;
        }
        continue;
      }

      if (!entry.isDirectory()) continue;

      if (entry.name === '.bin') {
        rmSync(full, { recursive: true, force: true });
        removed += 1;
        continue;
      }

      walk(full);
    }
  }

  walk(root);
  return removed;
}
