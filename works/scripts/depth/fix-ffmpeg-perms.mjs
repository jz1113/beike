import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function chmodIfExists(target) {
  if (!target || !fs.existsSync(target)) return;
  try {
    fs.chmodSync(target, 0o755);
    console.log('[depth-env] chmod +x', target);
  } catch (error) {
    console.warn('[depth-env] chmod failed:', target, error?.message || error);
  }
}

try {
  const installer = require('@ffmpeg-installer/ffmpeg');
  chmodIfExists(installer?.path);
} catch {
  /* optional */
}

chmodIfExists(path.join(workspaceRoot, 'node_modules/ffmpeg-static/ffmpeg'));

const ffprobeRoot = path.join(workspaceRoot, 'node_modules/ffprobe-static/bin');
if (fs.existsSync(ffprobeRoot)) {
  for (const platform of fs.readdirSync(ffprobeRoot)) {
    const archDir = path.join(ffprobeRoot, platform);
    if (!fs.statSync(archDir).isDirectory()) continue;
    for (const arch of fs.readdirSync(archDir)) {
      chmodIfExists(path.join(archDir, arch, platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'));
    }
  }
}
