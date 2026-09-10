import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, '../../..');
const pythonScript = path.join(workspaceRoot, 'works/scripts/depth/infer_video_depth.py');
const requirements = path.join(workspaceRoot, 'works/scripts/depth/requirements.txt');

function run(command, args, label) {
  return new Promise((resolve, reject) => {
    console.log(`[setup:depth-model] ${label}: ${command} ${args.join(' ')}`);
    const child = spawn(command, args, { stdio: 'inherit', cwd: workspaceRoot });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`${label} 失败 (exit ${code})`));
    });
  });
}

async function main() {
  const python = process.env.DEPTH_VIDEO_PYTHON?.trim() || 'python3';
  await run(python, ['-m', 'pip', 'install', '--user', '-r', requirements], '安装 Python 依赖');
  await run(python, ['-m', 'pip', 'install', '--user', 'torch', 'transformers', 'accelerate'], '安装深度模型依赖');
  await run(python, [pythonScript, '--check-env'], '验证深度模型环境');
  console.log('[setup:depth-model] 完成。请重启 API：npm run dev:api');
}

main().catch((error) => {
  console.error('[setup:depth-model] 失败:', error?.message || error);
  process.exit(1);
});
