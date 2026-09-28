import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { DEPTH_MODEL_SETUP_COMMAND } from '@shared/domain/media/depthVideo';

const execFileAsync = promisify(execFile);

const API_SERVICES_DIR = path.dirname(fileURLToPath(import.meta.url));

function findProjectRoot(): string {
  let cur = API_SERVICES_DIR;
  for (let i = 0; i < 6; i++) {
    if (
      fs.existsSync(path.join(cur, 'tools/scripts/depth/infer_video_depth.py')) ||
      (fs.existsSync(path.join(cur, 'package.json')) && fs.existsSync(path.join(cur, 'tools')))
    ) {
      return cur;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return path.resolve(API_SERVICES_DIR, '../../../..');
}

export const PROJECT_ROOT = findProjectRoot();

export function resolveDepthPythonScript(root = PROJECT_ROOT): string {
  return path.join(root, 'tools/scripts/depth/infer_video_depth.py');
}

export const PYTHON_SCRIPT = resolveDepthPythonScript(PROJECT_ROOT);

export interface DepthEnvDetails {
  opencv: boolean;
  numpy: boolean;
  scipy: boolean;
  torch: boolean;
  transformers: boolean;
  depthModelReady: boolean;
}

export interface DepthEnvStatus extends DepthEnvDetails {
  pythonDetail: string;
}

function getPythonBin(): string {
  return process.env.DEPTH_VIDEO_PYTHON?.trim() || 'python3';
}

export async function getDepthEnvStatus(): Promise<DepthEnvStatus> {
  const pythonBin = getPythonBin();
  const fallback: DepthEnvStatus = {
    opencv: false,
    numpy: false,
    scipy: false,
    torch: false,
    transformers: false,
    depthModelReady: false,
    pythonDetail: 'Python 深度环境未检测',
  };

  if (!fs.existsSync(PYTHON_SCRIPT)) {
    return { ...fallback, pythonDetail: '推理脚本缺失' };
  }

  try {
    const result = await execFileAsync(
      pythonBin,
      [PYTHON_SCRIPT, '--check-env'],
      {
        timeout: 20000,
        cwd: PROJECT_ROOT,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, PYTHONWARNINGS: 'ignore' },
      },
    );
    return parseDepthEnvStdout(result.stdout);
  } catch (error: any) {
    const stdout = error?.stdout ? String(error.stdout) : '';
    if (stdout.includes('{') && stdout.includes('}')) {
      return parseDepthEnvStdout(stdout);
    }
    const stderr = String(error?.stderr || error?.message || error).slice(0, 300);
    return { ...fallback, pythonDetail: stderr || 'Python 深度环境检测失败' };
  }
}

function parseDepthEnvStdout(stdout: string): DepthEnvStatus {
  let parsed: Partial<DepthEnvDetails> = {};
  try {
    const lines = stdout.split('\n');
    let jsonLine = '';
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('{') && line.endsWith('}')) {
        jsonLine = line;
        break;
      }
    }
    if (!jsonLine) {
      const match = stdout.match(/\{[\s\S]*"depthModelReady"[\s\S]*\}/);
      if (match) jsonLine = match[0];
    }
    if (jsonLine) {
      parsed = JSON.parse(jsonLine);
    }
  } catch {
    /* fallback to empty */
  }
  return {
    opencv: Boolean(parsed.opencv),
    numpy: Boolean(parsed.numpy),
    scipy: Boolean(parsed.scipy),
    torch: Boolean(parsed.torch),
    transformers: Boolean(parsed.transformers),
    depthModelReady: Boolean(parsed.depthModelReady),
    pythonDetail: parsed.depthModelReady
      ? '深度模型已就绪'
      : `深度模型未就绪，请执行 ${DEPTH_MODEL_SETUP_COMMAND}`,
  };
}

export async function checkDepthModelReady(): Promise<boolean> {
  const status = await getDepthEnvStatus();
  return status.depthModelReady;
}
