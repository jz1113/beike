import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  type DepthInferenceMeta,
  type DepthQuality,
  type DepthVideoStyle,
} from '@beike/shared/depthVideo';
import { persistBufferToStorage } from '@beike/shared/persistDataUrl';
import type { StorageConfig } from '@beike/shared/storage';
import { runDepthPython } from './depthPythonRunner';

function cleanupDir(dir: string) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

export async function runDepthImageJob(options: {
  imageBuffer: Buffer;
  style: DepthVideoStyle;
  quality: DepthQuality;
  storageConfig?: StorageConfig;
}): Promise<{ resultUrl: string; meta?: DepthInferenceMeta }> {
  const workDir = path.join(os.tmpdir(), 'depth-image', `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const inputPath = path.join(workDir, 'input.jpg');
  const outputPath = path.join(workDir, 'output.png');

  try {
    fs.mkdirSync(workDir, { recursive: true });
    fs.writeFileSync(inputPath, options.imageBuffer);
    const meta = await runDepthPython({
      mode: 'image',
      inputPath,
      outputPath,
      style: options.style,
      quality: options.quality,
    });

    if (!fs.existsSync(outputPath)) {
      throw new Error('深度图片生成失败：无输出文件');
    }

    const outputBuffer = fs.readFileSync(outputPath);
    const resultUrl = await persistBufferToStorage(outputBuffer, 'image/png', {
      keyPrefix: 'images',
      customConfig: options.storageConfig,
      filename: `depth_${Date.now()}.png`,
    });
    return { resultUrl, meta };
  } finally {
    cleanupDir(workDir);
  }
}
