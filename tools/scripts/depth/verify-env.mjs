import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;

const execFileAsync = promisify(execFile);
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const pythonScript = path.join(workspaceRoot, 'tools/scripts/depth/infer_video_depth.py');
const python = process.env.DEPTH_VIDEO_PYTHON?.trim() || 'python3';

async function main() {
  const ffmpeg = ffmpegPath;
  const ffprobe = ffprobePath;
  console.log('[ffmpeg]', ffmpeg, fs.existsSync(ffmpeg || '') ? 'OK' : 'MISSING');
  console.log('[ffprobe]', ffprobe, fs.existsSync(ffprobe) ? 'OK' : 'MISSING');

  for (const [name, binary] of [['ffmpeg', ffmpeg], ['ffprobe', ffprobe]]) {
    const { stdout } = await execFileAsync(binary, ['-version'], { timeout: 5000 });
    console.log(`[${name} version]`, stdout.split('\n')[0]);
  }

  let pyEnv = '';
  try {
    const { stdout } = await execFileAsync(python, [pythonScript, '--check-env']);
    pyEnv = stdout.trim();
  } catch (error) {
    pyEnv = String(error?.stdout || '').trim() || String(error?.message || error);
  }
  console.log('[python depth env]', pyEnv);

  const depthReady = pyEnv.includes('"depthModelReady": true');
  const inferMode = depthReady ? 'auto' : 'stub';
  if (!depthReady) {
    console.log('[python depth infer]', 'model not ready, using stub mode for ffmpeg smoke test');
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'depth-verify-'));
  const input = path.join(dir, 'input.mp4');
  await execFileAsync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'color=c=red:s=320x240:d=1', '-c:v', 'libx264', input]);
  const framesIn = path.join(dir, 'frames');
  const framesOut = path.join(dir, 'depth');
  fs.mkdirSync(framesIn);
  await execFileAsync(ffmpeg, ['-y', '-i', input, '-vf', 'scale=320:-2', path.join(framesIn, '%06d.png')]);
  await execFileAsync(python, [
    pythonScript,
    '--input-dir', framesIn,
    '--output-dir', framesOut,
    '--style', 'mocap',
    '--mode', inferMode,
  ]);
  const outMp4 = path.join(dir, 'out.mp4');
  await execFileAsync(ffmpeg, ['-y', '-framerate', '25', '-i', path.join(framesOut, '%06d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', outMp4]);
  console.log('[pipeline]', 'OK', 'output bytes =', fs.statSync(outMp4).size);
  const { stdout } = await execFileAsync(ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', outMp4], { timeout: 10000 });
  const probe = JSON.parse(stdout);
  if (!probe.streams?.some(stream => stream.codec_type === 'video') || !(Number(probe.format?.duration) > 0)) {
    throw new Error('ffprobe 未读取到有效视频');
  }
  console.log('[probe]', 'OK', 'duration =', probe.format.duration);
  fs.rmSync(dir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error('[verify failed]', err?.message || err);
  process.exit(1);
});
