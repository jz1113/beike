import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

import type { ServerResponse } from 'node:http';

const webRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(webRoot, '../..');
// 开发启动器把实际 API 端口写在 `.local-api-port`。API 跑在 3001–3099 时
// 仍读死 3000，整批生图会在提交前直接收到 502。
const portFilePaths = [
  resolve(workspaceRoot, '.local-api-port'),
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
      // 防御性响应头：仅开发服务器配置，生产由部署网关负责
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
        },
      },
    },
  },
});
