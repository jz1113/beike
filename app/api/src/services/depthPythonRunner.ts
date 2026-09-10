import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import 'node:url';
import {
  DEPTH_MODEL_SETUP_COMMAND,
  getDepthQualityProfile,
  isDepthQuality,
  type DepthInferenceMeta,
  type DepthQuality,
  type DepthVideoStyle,
} from '@beike/domain/depthVideo';

import { PROJECT_ROOT, resolveDepthPythonScript } from './depthEnvCheck';

export const DEPTH_PYTHON_SCRIPT = resolveDepthPythonScript(PROJECT_ROOT);

/**
 * 路径白名单校验：确保输入/输出路径在允许目录内（防止路径遍历）。
 * 所有传入 depthPythonRunner 的路径都必须通过此函数。
 */
function assertPathWithinAllowed(inputPath: string, allowedRoots: string[]): string {
  const resolved = path.resolve(inputPath);
  for (const root of allowedRoots) {
    const resolvedRoot = path.resolve(root);
    if (resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep)) {
      return resolved;
    }
  }
  throw new Error(
    `路径越界：${inputPath} 不在允许目录 ${allowedRoots.join(', ')} 内`,
  );
}

export interface RunDepthPythonOptions {
  mode: 'image' | 'frames';
  inputPath?: string;
  outputPath?: string;
  framesDir?: string;
  depthDir?: string;
  style: DepthVideoStyle;
  quality: DepthQuality;
  onProgress?: (frame: number, total: number) => void;
  onMeta?: (meta: DepthInferenceMeta) => void;
}

function parseStdoutLine(
  line: string,
  handlers: {
    onProgress?: (frame: number, total: number) => void;
    onMeta?: (meta: DepthInferenceMeta) => void;
  },
): DepthInferenceMeta | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return undefined;
  try {
    const payload = JSON.parse(trimmed) as {
      type?: string;
      frame?: number;
      total?: number;
      modelId?: string;
      inferenceSizePx?: number;
      device?: string;
      quality?: string;
    };
    if (payload.type === 'progress' && payload.frame && payload.total) {
      handlers.onProgress?.(payload.frame, payload.total);
      return undefined;
    }
    if (payload.type === 'meta' && payload.modelId && payload.inferenceSizePx && payload.device) {
      const meta: DepthInferenceMeta = {
        modelId: payload.modelId,
        inferenceSizePx: payload.inferenceSizePx,
        device: payload.device,
        quality: isDepthQuality(payload.quality) ? payload.quality : undefined,
      };
      handlers.onMeta?.(meta);
      return meta;
    }
  } catch {
    /* ignore malformed lines */
  }
  return undefined;
}

function safeResolveWithinRoot(root: string, candidate: string): string | null {
  if (!candidate) return null;
  if (candidate.includes('..') || candidate.includes('\0')) return null;
  if (path.isAbsolute(candidate)) return null;
  if (/^[a-zA-Z]:[\\/]/.test(candidate)) return null;
  if (candidate.startsWith('\\\\')) return null;
  const abs = path.resolve(root, candidate);
  const realRoot = fs.realpathSync(root);
  const realAbs = fs.realpathSync(abs);
  const prefix = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;
  return realAbs === realRoot || realAbs.startsWith(prefix) ? realAbs : null;
}

export async function runDepthPython(
  options: RunDepthPythonOptions,
): Promise<DepthInferenceMeta | undefined> {
  if (!fs.existsSync(DEPTH_PYTHON_SCRIPT)) {
    throw new Error('深度推理脚本缺失');
  }

  const storageRoot = process.env.AZHUO_STORAGE_DIR?.trim() || path.join(PROJECT_ROOT, 'storage');
  const tmpRoot = process.env.AZHUO_TMP_DIR?.trim() || os.tmpdir();

  // 白名单：仅允许 storage 根目录（含子目录）与系统临时目录
  const allowedRoots = [
    PROJECT_ROOT,
    storageRoot,
    tmpRoot,
    process.env.AZHUO_CACHE_DIR?.trim(),
    process.env.AZHUO_DATA_DIR?.trim(),
    process.env.TMPDIR || '/tmp',
    os.tmpdir(),
    '/tmp',
    '/private/tmp',
    '/var',
    '/private/var',
  ].filter((r): r is string => Boolean(r));

  const assertSafePath = (p: string, label: string): string => {
    if (!p) throw new Error(`${label} 路径为空`);
    const normalized = path.resolve(p);
    let realNormalized = normalized;
    try {
      if (fs.existsSync(normalized)) {
        realNormalized = fs.realpathSync(normalized);
      }
    } catch {
      /* ignore */
    }
    const matched = allowedRoots.some((root) => {
      const r = path.resolve(root);
      let realRoot = r;
      try {
        if (fs.existsSync(r)) {
          realRoot = fs.realpathSync(r);
        }
      } catch {
        /* ignore */
      }
      return (
        normalized === r ||
        normalized.startsWith(r + path.sep) ||
        realNormalized === realRoot ||
        realNormalized.startsWith(realRoot + path.sep)
      );
    });
    if (!matched) {
      throw new Error(`${label} 路径不在白名单根目录下: ${normalized}`);
    }
    return normalized;
  };

  if (options.mode === 'image') {
    if (!options.inputPath || !options.outputPath) {
      throw new Error('单图推理缺少 inputPath 或 outputPath');
    }
    assertSafePath(options.inputPath, 'inputPath');
    assertSafePath(options.outputPath, 'outputPath');
  } else {
    if (!options.framesDir || !options.depthDir) {
      throw new Error('视频帧推理缺少 framesDir 或 depthDir');
    }
    assertSafePath(options.framesDir, 'framesDir');
    assertSafePath(options.depthDir, 'depthDir');
  }

  const profile = getDepthQualityProfile(options.quality);
  const pythonBin = process.env.DEPTH_VIDEO_PYTHON?.trim() || 'python3';
  const args = [
    DEPTH_PYTHON_SCRIPT,
    '--style', options.style,
    '--quality', options.quality,
    '--model', profile.modelId,
    '--device', 'auto',
    '--inference-size', '0',
  ];

  if (options.mode === 'image') {
    if (!options.inputPath || !options.outputPath) {
      throw new Error('单图推理缺少 inputPath 或 outputPath');
    }
    const storageRoot = process.env.AZHUO_STORAGE_DIR?.trim() || path.join(PROJECT_ROOT, 'storage');
    const tmpRoot = process.env.AZHUO_TMP_DIR?.trim() || os.tmpdir();
    const safeInput = assertPathWithinAllowed(options.inputPath, [storageRoot, tmpRoot, PROJECT_ROOT]);
    const safeOutput = assertPathWithinAllowed(options.outputPath, [storageRoot, tmpRoot, PROJECT_ROOT]);
    args.push('--input-image', safeInput, '--output-image', safeOutput);
  } else {
    if (!options.framesDir || !options.depthDir) {
      throw new Error('视频帧推理缺少 framesDir 或 depthDir');
    }
    const storageRoot = process.env.AZHUO_STORAGE_DIR?.trim() || path.join(PROJECT_ROOT, 'storage');
    const tmpRoot = process.env.AZHUO_TMP_DIR?.trim() || os.tmpdir();
    const safeFramesDir = assertPathWithinAllowed(options.framesDir, [storageRoot, tmpRoot, PROJECT_ROOT]);
    const safeDepthDir = assertPathWithinAllowed(options.depthDir, [storageRoot, tmpRoot, PROJECT_ROOT]);
    args.push('--input-dir', safeFramesDir, '--output-dir', safeDepthDir);
  }

  let meta: DepthInferenceMeta | undefined;

  await new Promise<void>((resolve, reject) => {
    const child = spawn(pythonBin, args, {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.stdout?.on('data', (chunk) => {
      const lines = String(chunk).split('\n');
      for (const line of lines) {
        const parsed = parseStdoutLine(line, {
          onProgress: options.onProgress,
          onMeta: options.onMeta,
        });
        if (parsed) meta = parsed;
      }
    });

    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const detail = stderr.trim() || `Python 推理退出码 ${code}`;
      reject(new Error(detail.includes('setup:depth-model')
        ? `深度模型未就绪，请执行 ${DEPTH_MODEL_SETUP_COMMAND}`
        : detail));
    });
  });

  return meta;
}
