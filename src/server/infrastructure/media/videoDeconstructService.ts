import { resolveStorageRoot, toWorkspaceStorageKey } from '../storage/storagePaths';
import { resolveLocalVideoPath } from './videoResources';
export { resolveLocalVideoPath, localUrlToDataUrl } from './videoResources';
import fs from 'node:fs';
import path from 'node:path';
import 'node:os';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

export interface VideoMetadata {
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  duration: number;
  aspectRatio: string;
  filename?: string;
  sizeBytes?: number;
}

export interface StoryboardResult {
  contactSheetUrl: string;
  frameUrls: string[];
  sampleCount: number;
  duration: number;
  dimensions: string;
  aspectRatio: string;
}

export interface SegmentFramesResult {
  frameUrls: string[];
  count: number;
  timeRange: string;
  duration: number;
}

/**
 * 运行 Python 辅助脚本，执行 OpenCV / PIL 多媒体操作
 *
 * 安全：将内联脚本写入临时 `.py` 文件再以 `python3 <file> ...args` 方式调用，
 * 杜绝 `python3 -c "..."` 形式下 args 被注入到代码上下文的风险。
 * 临时文件存放在系统 tmp 目录（权限 0o600），运行结束后立即清理。
 */
async function runPythonScript(script: string, args: string[] = [], signal?: AbortSignal): Promise<any> {
  const os = await import('node:os');
  const scriptPath = path.join(
    os.tmpdir(),
    `azhuo_py_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.py`,
  );
  fs.writeFileSync(scriptPath, script, { mode: 0o600 });
  return new Promise((resolve, reject) => {
    const py = spawn('python3', [scriptPath, ...args]);
    const runSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(90000)]) : AbortSignal.timeout(90000);
    const onAbort = () => { py.kill('SIGKILL'); };
    runSignal.addEventListener('abort', onAbort, { once: true });
    if (runSignal.aborted) onAbort();
    let stdout = '';
    let stderr = '';

    py.stdout.on('data', (data) => {
      stdout += data.toString();
      if (stdout.length > 2_000_000) py.kill('SIGKILL');
    });

    py.stderr.on('data', (data) => {
      stderr += data.toString();
      if (stderr.length > 100_000) py.kill('SIGKILL');
    });

    py.on('close', (code) => {
      runSignal.removeEventListener('abort', onAbort);
      // 清理临时脚本（无论成功失败）
      fs.unlink(scriptPath, () => {});
      if (runSignal.aborted) return reject(runSignal.reason);
      if (code !== 0) {
        return reject(new Error(`Python 脚本执行失败(code ${code}): ${stderr || stdout}`));
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(parsed);
      } catch (err) {
        reject(new Error(`解析 Python 输出失败: ${stdout}, 错误: ${err instanceof Error ? err.message : String(err)}`));
      }
    });

    py.on('error', (err) => {
      runSignal.removeEventListener('abort', onAbort);
      fs.unlink(scriptPath, () => {});
      reject(err);
    });
  });
}

/**
 * 1. 探查视频容器元数据 (时长、精确分辨率、帧率、长宽比)
 */
export async function inspectVideoMetadata(urlOrPath: string, signal?: AbortSignal): Promise<VideoMetadata> {
  const { localPath } = await resolveLocalVideoPath(urlOrPath, signal);
  const sizeBytes = fs.existsSync(localPath) ? fs.statSync(localPath).size : undefined;

  const script = `
import cv2, json, os, sys, math

path = sys.argv[1]
cap = cv2.VideoCapture(path)
if not cap.isOpened():
    print(json.dumps({"error": f"Cannot open video {path}"}))
    sys.exit(1)

w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
dur = frames / fps if fps > 0 else 0
cap.release()

divisor = math.gcd(w, h) or 1
ar = f"{w // divisor}:{h // divisor}"
res = {
    "width": w,
    "height": h,
    "fps": round(fps, 2),
    "frameCount": frames,
    "duration": round(dur, 2),
    "aspectRatio": ar
}
print(json.dumps(res, ensure_ascii=False))
`;

  const meta = await runPythonScript(script, [localPath], signal);
  if (![meta.width, meta.height, meta.fps, meta.duration].every(value => Number.isFinite(value) && value > 0)) throw new Error('无法可靠读取视频规格，请确认文件可播放');
  return {
    ...meta,
    filename: path.basename(localPath),
    sizeBytes,
  };
}

/**
 * 2. 提取全片故事板九宫格 (Contact Sheet) 及关键帧列表
 */
export async function extractVideoStoryboards(
  urlOrPath: string,
  options: { sampleCount?: number; columns?: number; signal?: AbortSignal } = {},
): Promise<StoryboardResult> {
  const { localPath } = await resolveLocalVideoPath(urlOrPath, options.signal);
  const sampleCount = Math.floor(Math.max(4, Math.min(24, options.sampleCount || 12)));
  const columns = Math.floor(Math.max(2, Math.min(6, options.columns || 4)));

  const storageRoot = resolveStorageRoot();
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const batchId = `sb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const outputKey = toWorkspaceStorageKey(`generated/images/${yyyymm}/${batchId}`);
  const outDir = path.join(storageRoot, outputKey);
  fs.mkdirSync(outDir, { recursive: true });

  const script = `
import cv2, json, os, sys, math
from PIL import Image

video_path = sys.argv[1]
out_dir = sys.argv[2]
sample_count = int(sys.argv[3])
cols = int(sys.argv[4])

cap = cv2.VideoCapture(video_path)
if not cap.isOpened():
    print(json.dumps({"error": f"Cannot open video {video_path}"}))
    sys.exit(1)

w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
duration = total_frames / fps if fps > 0 else 0

indices = [int(i * (total_frames - 1) / (sample_count - 1)) for i in range(sample_count)] if total_frames > sample_count else list(range(total_frames))
extracted_files = []
thumbs = []

for idx_pos, frame_idx in enumerate(indices):
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
    ret, frame = cap.read()
    if not ret:
        continue
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    im = Image.fromarray(rgb)
    
    # 保存单帧原图
    frame_fname = f"frame_{idx_pos+1:02d}_t{frame_idx/fps:.1f}s.jpg"
    frame_fpath = os.path.join(out_dir, frame_fname)
    im.save(frame_fpath, quality=88)
    extracted_files.append(frame_fname)
    
    # 制作小缩略图用于拼合
    t = im.copy()
    t.thumbnail((240, 320))
    thumbs.append(t)

cap.release()

if not thumbs:
    print(json.dumps({"error": "No frames extracted"}))
    sys.exit(1)

rows = math.ceil(len(thumbs) / cols)
cell_w, cell_h = thumbs[0].size
contact_sheet = Image.new('RGB', (cell_w * cols, cell_h * rows), (18, 18, 22))

for i, thumb in enumerate(thumbs):
    r = i // cols
    c = i % cols
    # 居中粘贴
    x_offset = c * cell_w + (cell_w - thumb.size[0]) // 2
    y_offset = r * cell_h + (cell_h - thumb.size[1]) // 2
    contact_sheet.paste(thumb, (x_offset, y_offset))

sheet_fname = "storyboard_grid.jpg"
sheet_fpath = os.path.join(out_dir, sheet_fname)
contact_sheet.save(sheet_fpath, quality=86)

divisor = math.gcd(w, h) or 1
ar = f"{w // divisor}:{h // divisor}"
print(json.dumps({
    "contactSheetFile": sheet_fname,
    "frameFiles": extracted_files,
    "sampleCount": len(extracted_files),
    "duration": round(duration, 2),
    "dimensions": f"{w}x{h}",
    "aspectRatio": ar
}, ensure_ascii=False))
`;

  const pyRes = await runPythonScript(script, [localPath, outDir, String(sampleCount), String(columns)], options.signal);
  if (!Array.isArray(pyRes.frameFiles) || !pyRes.frameFiles.length || !pyRes.contactSheetFile) throw new Error('未能提取可用的视频画面');

  const basePath = `/storage/${outputKey}`;
  return {
    contactSheetUrl: `${basePath}/${pyRes.contactSheetFile}`,
    frameUrls: pyRes.frameFiles.map((f: string) => `${basePath}/${f}`),
    sampleCount: pyRes.sampleCount,
    duration: pyRes.duration,
    dimensions: pyRes.dimensions,
    aspectRatio: pyRes.aspectRatio,
  };
}

/**
 * 3. 截取特定区间的高清连续特写画面 (例如前3秒、特定转场瞬间)
 */
export async function extractVideoSegmentFrames(
  urlOrPath: string,
  options: { startSec: number; endSec: number; frameCount?: number; signal?: AbortSignal },
): Promise<SegmentFramesResult> {
  const { localPath } = await resolveLocalVideoPath(urlOrPath, options.signal);
  const startSec = Math.max(0, options.startSec || 0);
  const endSec = Math.max(startSec + 0.1, options.endSec || 3);
  const count = Math.floor(Math.max(1, Math.min(10, options.frameCount || 4)));

  const storageRoot = resolveStorageRoot();
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const batchId = `seg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const outputKey = toWorkspaceStorageKey(`generated/images/${yyyymm}/${batchId}`);
  const outDir = path.join(storageRoot, outputKey);
  fs.mkdirSync(outDir, { recursive: true });

  const script = `
import cv2, json, os, sys
from PIL import Image

video_path = sys.argv[1]
out_dir = sys.argv[2]
start_sec = float(sys.argv[3])
end_sec = float(sys.argv[4])
count = int(sys.argv[5])

cap = cv2.VideoCapture(video_path)
if not cap.isOpened():
    print(json.dumps({"error": f"Cannot open video {video_path}"}))
    sys.exit(1)

fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
max_sec = total_frames / fps if fps > 0 else 0

start_sec = min(start_sec, max_sec)
end_sec = min(end_sec, max_sec)
duration = max(0.1, end_sec - start_sec)

timestamps = [start_sec + i * duration / max(1, count - 1) for i in range(count)] if count > 1 else [start_sec]
extracted_files = []

for i, ts in enumerate(timestamps):
    frame_idx = min(int(ts * fps), max(0, total_frames - 1))
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
    ret, frame = cap.read()
    if not ret:
        continue
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    im = Image.fromarray(rgb)
    fname = f"closeup_{i+1:02d}_{ts:.2f}s.jpg"
    fpath = os.path.join(out_dir, fname)
    im.save(fpath, quality=92)
    extracted_files.append(fname)

cap.release()
print(json.dumps({
    "frameFiles": extracted_files,
    "count": len(extracted_files),
    "timeRange": f"{start_sec:.1f}s - {end_sec:.1f}s",
    "duration": round(duration, 2)
}, ensure_ascii=False))
`;

  const pyRes = await runPythonScript(script, [
    localPath,
    outDir,
    String(startSec),
    String(endSec),
    String(count),
  ], options.signal);
  if (!Array.isArray(pyRes.frameFiles) || !pyRes.frameFiles.length) throw new Error('指定区间没有可读取的视频画面');

  const basePath = `/storage/${outputKey}`;
  return {
    frameUrls: pyRes.frameFiles.map((f: string) => `${basePath}/${f}`),
    count: pyRes.count,
    timeRange: pyRes.timeRange,
    duration: pyRes.duration,
  };
}
