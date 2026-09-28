import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
// @ts-expect-error ffprobe-static has no type declarations
import ffprobeStatic from 'ffprobe-static';

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);

type FfmpegBinary = 'ffmpeg' | 'ffprobe';

export interface VideoProbeResult {
  duration: number;
  fps: number;
  width: number;
  height: number;
}

export interface FfmpegEnvStatus {
  ffmpeg: boolean;
  ffprobe: boolean;
  ffmpegPath: string;
  ffprobePath: string;
  detail: string;
}

function parseFps(rate?: string): number {
  if (!rate) return 24;
  const parts = rate.split('/');
  if (parts.length === 2) {
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    if (num > 0 && den > 0) return num / den;
  }
  const n = Number(rate);
  return Number.isFinite(n) && n > 0 ? n : 24;
}

function bundledFfmpegCandidates(): string[] {
  const candidates: string[] = [];
  try {
    const installer = require('@ffmpeg-installer/ffmpeg') as { path?: string };
    if (installer?.path) candidates.push(installer.path);
  } catch {
    /* optional dependency */
  }

  return candidates;
}

function bundledFfprobePath(): string {
  return (ffprobeStatic as { path?: string }).path || '';
}

async function resolveBinary(name: FfmpegBinary): Promise<string> {
  const envKey = name === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH';
  const fromEnv = process.env[envKey]?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  if (name === 'ffmpeg') {
    for (const candidate of bundledFfmpegCandidates()) {
      if (candidate && fs.existsSync(candidate)) return candidate;
    }
    return 'ffmpeg';
  }

  const ffprobe = bundledFfprobePath();
  if (ffprobe && fs.existsSync(ffprobe)) return ffprobe;
  return 'ffprobe';
}

async function canExecBinary(binary: string): Promise<boolean> {
  if (!binary || binary === 'ffmpeg' || binary === 'ffprobe') {
    return false;
  }
  try {
    await execFileAsync(binary, ['-version'], { timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

export async function getFfmpegEnvStatus(): Promise<FfmpegEnvStatus> {
  const ffmpegPath = await resolveBinary('ffmpeg');
  const ffprobePath = await resolveBinary('ffprobe');
  const ffmpeg = await canExecBinary(ffmpegPath);
  const ffprobe = await canExecBinary(ffprobePath);

  let detail = '深度视频环境已就绪';
  if (!ffmpeg && !ffprobe) {
    detail = '内置 FFmpeg 不可用，请重启 API 后重试，或执行 npm run setup:depth-env';
  } else if (!ffmpeg) {
    detail = 'FFmpeg 不可用，但 ffprobe 正常';
  } else if (!ffprobe) {
    detail = 'FFmpeg 可用，但 ffprobe 不可用';
  }

  return { ffmpeg, ffprobe, ffmpegPath, ffprobePath, detail };
}

export async function checkFfmpegAvailable(): Promise<boolean> {
  const status = await getFfmpegEnvStatus();
  return status.ffmpeg && status.ffprobe;
}

export async function probeVideo(inputPath: string): Promise<VideoProbeResult> {
  const ffprobe = await resolveBinary('ffprobe');
  const { stdout } = await execFileAsync(ffprobe, [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_streams',
    '-show_format',
    inputPath,
  ], { maxBuffer: 4 * 1024 * 1024 });

  const parsed = JSON.parse(stdout) as {
    streams?: Array<{ codec_type?: string; width?: number; height?: number; r_frame_rate?: string; avg_frame_rate?: string }>;
    format?: { duration?: string };
  };

  const videoStream = parsed.streams?.find((s) => s.codec_type === 'video');
  if (!videoStream) {
    throw new Error('未在视频中找到视频流');
  }

  const duration = Number(parsed.format?.duration || 0);
  const fps = parseFps(videoStream.avg_frame_rate || videoStream.r_frame_rate);

  return {
    duration: Number.isFinite(duration) ? duration : 0,
    fps: fps > 0 ? fps : 24,
    width: videoStream.width || 0,
    height: videoStream.height || 0,
  };
}

export async function extractFrames(
  inputPath: string,
  outDir: string,
  opts: { maxWidth?: number; maxDurationSec?: number } = {},
): Promise<{ frameCount: number; fps: number }> {
  const ffmpeg = await resolveBinary('ffmpeg');
  fs.mkdirSync(outDir, { recursive: true });

  const probe = await probeVideo(inputPath);
  const maxWidth = opts.maxWidth || 1280;
  const maxDurationSec = opts.maxDurationSec;

  const vfParts = [`scale='min(${maxWidth},iw)':-2`];
  const args = ['-y', '-i', inputPath];
  if (maxDurationSec && maxDurationSec > 0) {
    args.push('-t', String(maxDurationSec));
  }
  args.push('-vf', vfParts.join(','), '-vsync', '0', path.join(outDir, '%06d.png'));

  await execFileAsync(ffmpeg, args, { maxBuffer: 8 * 1024 * 1024 });

  const frameCount = fs.readdirSync(outDir).filter((name) => name.endsWith('.png')).length;
  if (frameCount === 0) {
    throw new Error('抽帧失败：未生成任何帧');
  }

  return { frameCount, fps: probe.fps };
}

export async function encodeVideoFromFrames(
  framesDir: string,
  fps: number,
  outputPath: string,
  opts: { crf?: number; preset?: string } = {},
): Promise<void> {
  const ffmpeg = await resolveBinary('ffmpeg');
  const pattern = path.join(framesDir, '%06d.png');
  const frameFiles = fs.readdirSync(framesDir).filter((name) => name.endsWith('.png'));
  if (frameFiles.length === 0) {
    throw new Error('编码失败：深度帧目录为空');
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const crf = opts.crf ?? 20;
  const preset = opts.preset ?? 'medium';

  await execFileAsync(ffmpeg, [
    '-y',
    '-framerate', String(Math.max(1, fps)),
    '-i', pattern,
    '-c:v', 'libx264',
    '-crf', String(crf),
    '-preset', preset,
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outputPath,
  ], { maxBuffer: 8 * 1024 * 1024 });
}
