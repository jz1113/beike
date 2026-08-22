import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const root = dirname(fileURLToPath(import.meta.url));
const portFile = resolve(root, '.desktop-dev-port');
let apiPort = 3000;
try {
  const n = Number.parseInt(readFileSync(portFile, 'utf8').trim(), 10);
  if (Number.isFinite(n) && n > 0) apiPort = n;
} catch {
  /* default */
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(root, 'src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/xlsx')) return 'vendor-xlsx';
          if (id.includes('node_modules/jszip')) return 'vendor-jszip';
          if (id.includes('node_modules/gsap') || id.includes('node_modules/ogl')) return 'vendor-motion';
          if (id.includes('/features/hub/')) return 'view-hub';
          if (id.includes('/features/generate/')) return 'view-generate';
          if (id.includes('/features/buyer-show/')) return 'view-buyer-show';
          if (id.includes('/features/assets/')) return 'view-assets';
        },
      },
    },
  },
});
