import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

import type { ServerResponse } from 'node:http';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDir, '../..');
const clientRoot = resolve(workspaceRoot, 'src/client');

// 开发启动器把实际 API 端口写在 `.local/api-port`（兼容旧根目录 `.local-api-port`）。
// API 跑在 3001–3099 时仍读死 3000，整批生图会在提交前直接收到 502。
const portFilePaths = [
  resolve(workspaceRoot, '.local/api-port'),
  resolve(workspaceRoot, '.local-api-port'),
];
const launchPort = Number(process.env.BEIKE_DEV_API_PORT);
const hasLaunchPort = Number.isInteger(launchPort) && launchPort > 0 && launchPort <= 65535;
let apiPort = hasLaunchPort ? launchPort : 3000;
try {
  for (const portFilePath of portFilePaths) {
    if (hasLaunchPort || !existsSync(portFilePath)) continue;
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
  root: clientRoot,
  envDir: workspaceRoot,
  plugins: [react(), tailwindcss()],
  publicDir: resolve(clientRoot, 'public'),
  resolve: {
    alias: {
      '@client': clientRoot,
      '@shared': resolve(workspaceRoot, 'src/shared'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    fs: {
      allow: [workspaceRoot],
    },
    // Backend hot restarts must not refresh the browser and interrupt local drafts.
    // Shared rules and client code remain watched; generated/data files do not.
    watch: {
      ignored: ['**/database/**', '**/docs/**', '**/.local/**', '**/tools/build/**'],
    },
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
    outDir: resolve(workspaceRoot, 'tools/build/ui'),
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
