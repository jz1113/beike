import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generationTaskRepository } from '@server/repositories/generationTasks';
import {
  DEPTH_VIDEO_LIMITS,
  DEPTH_VIDEO_MODEL_ID,
  formatDepthVideoProgress,
  getDepthQualityProfile,
  type DepthInferenceMeta,
  type DepthQuality,
  type DepthVideoStyle,
} from '@shared/domain/media/depthVideo';
import { persistBufferToStorage } from '@server/infrastructure/storage/persistDataUrl';
import { extractStorageConfigFromRequest, type StorageConfig } from '@server/infrastructure/storage/storage';
import { runDepthPython } from './depthPythonRunner';
import { encodeVideoFromFrames, extractFrames, probeVideo } from '../media/videoFrames';

type TaskStage = 'queued' | 'probing' | 'extracting' | 'inferring' | 'encoding' | 'uploading' | 'done' | 'failed';

interface TaskRuntimeState {
  progress: string;
  stage: TaskStage;
  inferenceMeta?: DepthInferenceMeta;
}

const taskRuntimeState = new Map<string, TaskRuntimeState>();

export function getDepthVideoRuntimeState(taskId: string): TaskRuntimeState | undefined {
  return taskRuntimeState.get(taskId);
}

function setTaskRuntime(
  taskId: string,
  stage: TaskStage,
  progress: string,
  inferenceMeta?: DepthInferenceMeta,
) {
  const prev = taskRuntimeState.get(taskId);
  taskRuntimeState.set(taskId, {
    stage,
    progress,
    inferenceMeta: inferenceMeta ?? prev?.inferenceMeta,
  });
}

function cleanupDir(dir: string) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

async function writeInputVideo(
  workDir: string,
  source: { videoBuffer?: Buffer; videoDataUrl?: string; videoUrl?: string },
): Promise<string> {
  const inputPath = path.join(workDir, 'input.mp4');
  if (source.videoBuffer) {
    if (source.videoBuffer.byteLength > DEPTH_VIDEO_LIMITS.maxDataUrlBytes) {
      throw new Error(`视频过大，请控制在 ${Math.round(DEPTH_VIDEO_LIMITS.maxDataUrlBytes / 1024 / 1024)}MB 以内`);
    }
    fs.writeFileSync(inputPath, source.videoBuffer);
    return inputPath;
  }

  if (source.videoDataUrl?.startsWith('data:')) {
    const match = source.videoDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error('无效的视频 data URL');
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.byteLength > DEPTH_VIDEO_LIMITS.maxDataUrlBytes) {
      throw new Error(`视频过大，请控制在 ${Math.round(DEPTH_VIDEO_LIMITS.maxDataUrlBytes / 1024 / 1024)}MB 以内`);
    }
    fs.writeFileSync(inputPath, buffer);
    return inputPath;
  }

  if (source.videoUrl) {
    const maxBytes = DEPTH_VIDEO_LIMITS.maxDataUrlBytes;
    const res = await fetch(source.videoUrl, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`下载视频失败 (HTTP ${res.status})`);
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > maxBytes) {
      throw new Error(`视频过大，请控制在 ${Math.round(maxBytes / 1024 / 1024)}MB 以内`);
    }
    if (!res.body) {
      const arrayBuffer = await res.arrayBuffer();
      if (arrayBuffer.byteLength > maxBytes) {
        throw new Error(`视频过大，请控制在 ${Math.round(maxBytes / 1024 / 1024)}MB 以内`);
      }
      fs.writeFileSync(inputPath, Buffer.from(arrayBuffer));
      return inputPath;
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error(`视频过大，请控制在 ${Math.round(maxBytes / 1024 / 1024)}MB 以内`);
      }
      chunks.push(value);
    }
    fs.writeFileSync(inputPath, Buffer.concat(chunks));
    return inputPath;
  }

  throw new Error('缺少视频输入');
}

export async function runDepthVideoJob(options: {
  taskId: string;
  videoBuffer?: Buffer;
  videoDataUrl?: string;
  videoUrl?: string;
  style: DepthVideoStyle;
  quality: DepthQuality;
  storageConfig?: StorageConfig;
}): Promise<void> {
  const { taskId, style, quality, storageConfig } = options;
  const profile = getDepthQualityProfile(quality);
  const workDir = path.join(os.tmpdir(), 'depth-video', taskId);

  try {
    setTaskRuntime(taskId, 'queued', '5%');
    fs.mkdirSync(workDir, { recursive: true });

    setTaskRuntime(taskId, 'probing', '8%');
    const inputPath = await writeInputVideo(workDir, options);
    const probe = await probeVideo(inputPath);
    if (probe.duration > DEPTH_VIDEO_LIMITS.maxDurationSec) {
      throw new Error(`视频时长超过 ${DEPTH_VIDEO_LIMITS.maxDurationSec}s 限制`);
    }

    const framesDir = path.join(workDir, 'frames');
    const depthDir = path.join(workDir, 'depth');
    const outputPath = path.join(workDir, 'output.mp4');

    setTaskRuntime(taskId, 'extracting', '15%');
    const { frameCount, fps } = await extractFrames(inputPath, framesDir, {
      maxWidth: profile.maxWidthPx,
      maxDurationSec: DEPTH_VIDEO_LIMITS.maxDurationSec,
    });

    setTaskRuntime(taskId, 'inferring', '25%');
    let inferenceMeta: DepthInferenceMeta | undefined;
    const meta = await runDepthPython({
      mode: 'frames',
      framesDir,
      depthDir,
      style,
      quality,
      onMeta: (parsedMeta) => {
        inferenceMeta = parsedMeta;
        setTaskRuntime(taskId, 'inferring', taskRuntimeState.get(taskId)?.progress || '25%', parsedMeta);
      },
      onProgress: (frame, total) => {
        setTaskRuntime(taskId, 'inferring', formatDepthVideoProgress(frame, total), inferenceMeta);
      },
    });
    inferenceMeta = meta ?? inferenceMeta;

    const depthFrames = fs.readdirSync(depthDir).filter((name) => name.endsWith('.png'));
    if (depthFrames.length !== frameCount) {
      throw new Error(`深度帧数量不匹配（期望 ${frameCount}，实际 ${depthFrames.length}）`);
    }

    setTaskRuntime(taskId, 'encoding', '92%', inferenceMeta);
    await encodeVideoFromFrames(depthDir, fps, outputPath, {
      crf: profile.videoCrf,
      preset: profile.videoPreset,
    });

    setTaskRuntime(taskId, 'uploading', '96%', inferenceMeta);
    const outputBuffer = fs.readFileSync(outputPath);
    const resultUrl = await persistBufferToStorage(outputBuffer, 'video/mp4', {
      keyPrefix: 'videos',
      customConfig: storageConfig,
      filename: `depth_${taskId}.mp4`,
    });

    await generationTaskRepository.markDepthSuccess(taskId, resultUrl);

    setTaskRuntime(taskId, 'done', '100%', inferenceMeta);
  } catch (error: any) {
    const message = error?.message || String(error);
    await generationTaskRepository.markFailed(taskId, message).catch(() => undefined);
    setTaskRuntime(taskId, 'failed', '0%');
    console.error(`[深度动作捕捉] 任务 ${taskId} 失败:`, message);
  } finally {
    cleanupDir(workDir);
  }
}

interface DepthQueueItem {
  options: {
    taskId: string;
    videoBuffer?: Buffer;
    videoDataUrl?: string;
    videoUrl?: string;
    style: DepthVideoStyle;
    quality: DepthQuality;
    storageConfig?: StorageConfig;
  };
}

const depthJobQueue: DepthQueueItem[] = [];
let isProcessingDepthQueue = false;
let shuttingDownDepthQueue = false;
let currentDepthJob: Promise<void> | null = null;

async function processDepthQueue() {
  if (isProcessingDepthQueue) return;
  isProcessingDepthQueue = true;

  while (depthJobQueue.length > 0) {
    if (shuttingDownDepthQueue) break;
    const item = depthJobQueue.shift();
    if (!item) break;
    currentDepthJob = runDepthVideoJob(item.options).catch((err) => {
      console.error(`[深度动作捕捉队列] 任务 ${item.options.taskId} 执行出错:`, err);
    });
    await currentDepthJob;
    currentDepthJob = null;
  }

  isProcessingDepthQueue = false;
}

export function enqueueDepthVideoJob(options: DepthQueueItem['options']) {
  if (shuttingDownDepthQueue) {
    console.warn(`[深度动作捕捉队列] 服务正在关闭，拒绝入队 ${options.taskId}`);
    return;
  }
  setTaskRuntime(options.taskId, 'queued', '5%');
  depthJobQueue.push({ options });
  void processDepthQueue();
}

export async function drainDepthVideoQueue(timeoutMs: number): Promise<void> {
  shuttingDownDepthQueue = true;
  if (!currentDepthJob && !isProcessingDepthQueue) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      currentDepthJob ?? Promise.resolve(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function createDepthVideoTask(
  req: Request,
  body: {
    videoBuffer?: Buffer;
    videoDataUrl?: string;
    videoUrl?: string;
    style: DepthVideoStyle;
    quality: DepthQuality;
  },
): Promise<{ taskId: string; recordId: string }> {
  const storageConfig = extractStorageConfigFromRequest(req);
  const prompt = '深度动作捕捉';
  const taskId = `depth_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const record = await generationTaskRepository.createDepthTask(taskId, prompt, DEPTH_VIDEO_MODEL_ID, body.quality);

  // 严格入队串行处理，并发限制为 1，杜绝多路 Python + FFmpeg 撑爆系统内存
  enqueueDepthVideoJob({
    taskId: record.id,
    videoBuffer: body.videoBuffer,
    videoDataUrl: body.videoDataUrl,
    videoUrl: body.videoUrl,
    style: body.style,
    quality: body.quality,
    storageConfig,
  });

  return { taskId: record.id, recordId: record.id };
}
