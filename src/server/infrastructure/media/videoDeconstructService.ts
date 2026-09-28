import { resolveStorageRoot, resolveStoredMediaPath } from '../storage/storagePaths';
import { assertSafeVideoPath } from './videoPathSecurity';
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
 * 将本地 /storage/... 路径或文件绝对路径转为多模态模型可读取的 data:image/...;base64 字符串
 */
export function localUrlToDataUrl(localUrl: string): string {
  if (!localUrl) return '';
  if (localUrl.startsWith('data:image/')) return localUrl;
  try {
    let absPath = localUrl;
    if (localUrl.startsWith('/storage/')) {
      absPath = resolveStoredMediaPath(localUrl.replace(/^\/storage\/?/, '')) || '';
    }
    if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
      const ext = path.extname(absPath).toLowerCase().replace('..', '') || 'jpeg';
      const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
      const b64 = fs.readFileSync(absPath).toString('base64');
      return `data:${mime};base64,${b64}`;
    }
  } catch {
    /* ignore */
  }
  return localUrl;
}

/**
 * 确保输入路径为本地可读取的文件路径
 * 若为 URL 或 /storage 相对路径，解析为实际本地文件
 */
export async function resolveLocalVideoPath(urlOrPath: string, signal?: AbortSignal): Promise<{ localPath: string; isTemp: boolean }> {
  signal?.throwIfAborted();
  const raw = assertSafeVideoPath(urlOrPath);

  // 1. 本地绝对路径
  if (path.isAbsolute(raw) && fs.existsSync(raw)) {
    return { localPath: raw, isTemp: false };
  }

  // 2. /storage/... 本地映射路径
  if (raw.startsWith('/storage/')) {
    const rel = raw.replace(/^\/storage\/?/, '');
    const abs = resolveStoredMediaPath(rel);
    if (abs) {
      return { localPath: abs, isTemp: false };
    }
  }

  // 3. 用户常用 Downloads 目录文件名容错
  if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
    const userDownloads = path.join(process.env.HOME || '/Users/huayuzulin', 'Downloads');
    const directDownloads = path.join(userDownloads, raw);
    if (fs.existsSync(directDownloads)) {
      return { localPath: directDownloads, isTemp: false };
    }

    // 模糊匹配文件名（处理全角半角符号差异）
    try {
      const files = fs.readdirSync(userDownloads);
      const cleanTarget = raw.replace(/[|｜\s_-]/g, '').toLowerCase();
      const matched = files.find((f) => f.replace(/[|｜\s_-]/g, '').toLowerCase().includes(cleanTarget));
      if (matched) {
        return { localPath: path.join(userDownloads, matched), isTemp: false };
      }
    } catch {
      /* ignore */
    }
  }

  // 4. 远程 HTTP(S) 链接：下载到临时缓存目录
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    const storageRoot = resolveStorageRoot();
    const tempDir = path.join(storageRoot, 'cache', 'video_downloads');
    fs.mkdirSync(tempDir, { recursive: true });

    const hash = crypto.createHash('md5').update(raw).digest('hex');
    const localFile = path.join(tempDir, `vid_${hash}.mp4`);

    if (fs.existsSync(localFile) && fs.statSync(localFile).size > 1024) {
      return { localPath: localFile, isTemp: false };
    }

    const resp = await fetch(raw, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000) });
    if (!resp.ok) {
      throw new Error(`下载远程视频失败: ${resp.status} ${resp.statusText}`);
    }
    const buffer = Buffer.from(await resp.arrayBuffer());
    signal?.throwIfAborted();
    fs.writeFileSync(localFile, buffer);
    return { localPath: localFile, isTemp: false };
  }

  throw new Error(`无法找到或读取视频文件: ${urlOrPath}`);
}

/**
 * 运行 Python 辅助脚本，执行 OpenCV / PIL 多媒体操作
 *
 * 安全：将内联脚本写入临时 `.py` 文件再以 `python3 <file> ...args` 方式调用，
 * 杜绝 `python3 -c "..."` 形式下 args 被注入到代码上下文的风险。
 * 临时文件存放在系统 tmp 目录（权限 0o600），运行结束后立即清理。
 */
async function runPythonScript(script: string, args: string[] = [], signal?: AbortSignal): Promise<any> {
  signal?.throwIfAborted();
  const os = await import('node:os');
  signal?.throwIfAborted();
  const scriptPath = path.join(
    os.tmpdir(),
    `azhuo_py_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.py`,
  );
  fs.writeFileSync(scriptPath, script, { mode: 0o600 });
  return new Promise((resolve, reject) => {
    const py = spawn('python3', [scriptPath, ...args], { signal, timeout: 120_000, killSignal: 'SIGKILL' });
    let stdout = '';
    let stderr = '';

    py.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    py.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    py.on('close', (code) => {
      // 清理临时脚本（无论成功失败）
      fs.unlink(scriptPath, () => {});
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
import cv2, json, os, sys

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

ar = "9:16" if h > w * 1.3 else ("16:9" if w > h * 1.3 else ("3:4" if h > w else "1:1"))
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
  const sampleCount = Math.max(4, Math.min(24, options.sampleCount || 12));
  const columns = Math.max(2, Math.min(6, options.columns || 4));

  const storageRoot = resolveStorageRoot();
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const batchId = `sb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const outDir = path.join(storageRoot, 'generated', 'images', yyyymm, batchId);
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

ar = "9:16" if h > w * 1.3 else ("16:9" if w > h * 1.3 else "1:1")
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

  const basePath = `/storage/generated/images/${yyyymm}/${batchId}`;
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
  const count = Math.max(1, Math.min(10, options.frameCount || 4));

  const storageRoot = resolveStorageRoot();
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const batchId = `seg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const outDir = path.join(storageRoot, 'generated', 'images', yyyymm, batchId);
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

  const basePath = `/storage/generated/images/${yyyymm}/${batchId}`;
  return {
    frameUrls: pyRes.frameFiles.map((f: string) => `${basePath}/${f}`),
    count: pyRes.count,
    timeRange: pyRes.timeRange,
    duration: pyRes.duration,
  };
}
