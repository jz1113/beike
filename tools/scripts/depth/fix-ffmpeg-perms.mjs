import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function chmodIfExists(target) {
  if (!target || !fs.existsSync(target)) return;
  try {
    fs.chmodSync(target, 0o755);
    console.log('[depth-env] chmod +x', target);
  } catch (error) {
    console.warn('[depth-env] chmod failed:', target, error?.message || error);
  }
}

for (const packageName of ['@ffmpeg-installer/ffmpeg', '@ffprobe-installer/ffprobe']) {
  try {
    chmodIfExists(require(packageName).path);
  } catch (error) {
    console.warn(`[depth-env] ${packageName} 不可用：`, error?.message || error);
  }
}
