import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

import type { ServerResponse } from 'node:http';

const webRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(webRoot, '../..');
// Web 与桌面开发启动器曾分别写入不同的端口文件：前者是
// `.local-api-port`，后者是 `.desktop-dev-port`。代理只读后者时，API
// 实际跑在 3001–3099 的场景仍会被错误转发至 3000，整批生图便会在提交前
// 直接收到 502。优先读取 Web 启动器的文件；桌面开发没有该文件时再回退。
const portFilePaths = [
  resolve(workspaceRoot, '.local-api-port'),
  resolve(workspaceRoot, '.desktop-dev-port'),
];
let apiPort = 3000;
try {
  for (const portFilePath of portFilePaths) {
    if (!existsSync(portFilePath)) continue;
    const n = Number.parseInt(readFileSync(portFilePath, 'utf8').trim(), 10);
    if (Number.isFinite(n) && n > 0) {
      apiPort = n;
      break;
    }
  }
} catch {
  /* default */
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(webRoot, 'src'),
      '@beike/domain': resolve(workspaceRoot, 'packages/domain/src'),
      '@beike/contracts': resolve(workspaceRoot, 'packages/contracts/src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    headers: {
      // 防御性响应头：仅开发服务器配置，生产构建由部署网关/桌面壳负责
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
    },
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            const serverRes = res as ServerResponse | undefined;
            if (serverRes && 'writeHead' in serverRes && !serverRes.headersSent) {
              serverRes.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
              serverRes.end(
                JSON.stringify({
                  success: false,
                  error: `本地后台服务未连接 (127.0.0.1:${apiPort})，请确认后台服务正常运行`,
                }),
              );
            }
          });
        },
      },
      '/storage': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false, // 生产构建不输出 source map，避免源码泄露
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/zustand/')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/@tanstack/')) {
            return 'vendor-query';
          }
          if (id.includes('node_modules/gsap/')) {
            return 'vendor-gsap';
          }
          if (id.includes('node_modules/xlsx/')) return 'vendor-xlsx';
          if (id.includes('node_modules/jszip/')) return 'vendor-jszip';
          if (id.includes('node_modules/lucide-react/')) return 'vendor-icons';
          if (id.includes('node_modules/@tauri-apps/')) return 'vendor-tauri';
        },
      },
    },
  },
});
