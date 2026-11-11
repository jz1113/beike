import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { depthEnvironmentPython, loadAppDataEnv, resolveAppDataDir } from '../web/web-shared.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, '../../..');
const pythonScript = path.join(workspaceRoot, 'tools/scripts/depth/infer_video_depth.py');
const requirements = path.join(workspaceRoot, 'tools/scripts/depth/requirements.txt');

function run(command, args, label, capture = false) {
  return new Promise((resolve, reject) => {
    console.log(`[setup:depth-model] ${label}: ${command} ${args.join(' ')}`);
    const child = spawn(command, args, { stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit', cwd: workspaceRoot });
    let output = '';
    child.stdout?.on('data', data => { output += data; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(output.trim());
      else reject(new Error(`${label} 失败 (exit ${code})`));
    });
  });
}

export async function setupDepthModel({ environment = process.env, runCommand = run, fileExists = existsSync } = {}) {
  const appDataDir = path.resolve(workspaceRoot, environment.AZHUO_DATA_DIR || resolveAppDataDir());
  const configured = environment.DEPTH_VIDEO_PYTHON?.trim();
  const python = configured || depthEnvironmentPython(appDataDir);
  if (!configured && !fileExists(python)) {
    const basePython = environment.DEPTH_SETUP_PYTHON?.trim() || (process.platform === 'win32' ? 'python' : 'python3');
    await runCommand(basePython, ['-m', 'venv', path.join(appDataDir, 'depth-runtime')], '创建独立 Python 环境');
  }
  const isolated = await runCommand(python, ['-c', 'import os, sys; print(int(sys.prefix != sys.base_prefix or os.path.isdir(os.path.join(sys.prefix, "conda-meta"))))'], '检查 Python 环境隔离', true);
  if (isolated !== '1') {
    throw new Error('深度依赖只安装到独立 venv/Conda 环境。请将 DEPTH_VIDEO_PYTHON 指向该环境，或取消此变量以创建专用环境；选择基础解释器请使用 DEPTH_SETUP_PYTHON。');
  }
  await runCommand(python, ['-m', 'pip', 'install', '-r', requirements], '安装 Python 依赖');
  await runCommand(python, [pythonScript, '--check-env'], '验证深度模型环境');
  console.log(`[setup:depth-model] Python：${python}`);
  console.log('[setup:depth-model] 完成。开发环境请重新运行 pnpm dev；生产环境请重启 beike 服务。');
  return python;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Promise.resolve().then(() => {
    loadAppDataEnv();
    return setupDepthModel();
  }).catch((error) => {
    console.error('[setup:depth-model] 失败:', error?.message || error);
    process.exitCode = 1;
  });
}
