import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAppDataDir } from '../web/web-shared.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const environment = path.join(process.env.AZHUO_DATA_DIR || resolveAppDataDir(), 'ocr-runtime');
const python = process.env.OCR_PYTHON?.trim() || path.join(environment, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`OCR 环境准备失败（退出码 ${code}）`)));
  });
}
try {
  if (!process.env.OCR_PYTHON?.trim() && !existsSync(python)) {
    mkdirSync(path.dirname(environment), { recursive: true });
    await run(process.env.OCR_SETUP_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-m', 'venv', environment]);
  }
  await run(python, ['-m', 'pip', 'install', '-r', 'tools/scripts/ocr/requirements.txt']);
  await run(python, ['tools/scripts/ocr/recognize.py', '--check-env']);
  console.log('[ocr] 中文识别环境已就绪，无需 OCR API Key。');
} catch (error) {
  console.error('[ocr]', error.message);
  process.exitCode = 1;
}
