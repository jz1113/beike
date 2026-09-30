import { getInternalApiHeaders, getInternalApiOrigin } from '../../auth/apiAuth';
import { formatToolError } from '../toolSafety';
import {
  inspectVideoMetadata,
  extractVideoStoryboards,
  extractVideoSegmentFrames,
} from '../../media/videoDeconstructService';
import { parseReversePromptSections } from './productTools';

export async function toolDeconstructImage(args: { image_url?: string }, _origin: string, signal?: AbortSignal): Promise<string> {
  void _origin;
  const imageUrl = String(args.image_url || '').trim();
  if (!imageUrl) return JSON.stringify({ success: false, error: '缺少 image_url' });

  try {
    const res = await fetch(`${getInternalApiOrigin()}/api/catalog/assets/deconstruct`, {
      method: 'POST',
      headers: getInternalApiHeaders(),
      redirect: 'error',
      body: JSON.stringify({ imageUrl, mode: 'single' }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000),
    });
    const data = await res.json();
    if (!data.success) {
      return JSON.stringify({ success: false, error: formatToolError(data.error || '反推失败') });
    }
    return JSON.stringify({
      success: true,
      reversePrompt: data.reversePrompt || data.prompt || '',
      title: data.title || '',
      sections: parseReversePromptSections(String(data.reversePrompt || data.prompt || '')),
    });
  } catch (e: unknown) {
    const msg = formatToolError(e, '反推请求失败');
    return JSON.stringify({ success: false, error: msg });
  }
}

export async function toolInspectVideoMedia(videoUrl: string, signal?: AbortSignal): Promise<string> {
  const target = videoUrl.trim();
  if (!target) return JSON.stringify({ success: false, error: '缺少 video_url 参数' });
  try {
    const meta = await inspectVideoMetadata(target, signal);
    return JSON.stringify({
      success: true,
      message: `视频物理参数探查完毕: 时长 ${meta.duration}秒, 分辨率 ${meta.width}x${meta.height}, 帧率 ${meta.fps}fps, 长宽比 ${meta.aspectRatio}`,
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
      fps: meta.fps,
      frameCount: meta.frameCount,
      aspectRatio: meta.aspectRatio,
      filename: meta.filename,
    });
  } catch (err: unknown) {
    return JSON.stringify({ success: false, error: formatToolError(err) });
  }
}

export async function toolExtractVideoStoryboard(videoUrl: string, sampleCount: number, signal?: AbortSignal): Promise<string> {
  const target = videoUrl.trim();
  if (!target) return JSON.stringify({ success: false, error: '缺少 video_url 参数' });
  try {
    const res = await extractVideoStoryboards(target, { sampleCount, signal });
    return JSON.stringify({
      success: true,
      message: `已成功对视频全片抽样 ${res.sampleCount} 帧并拼合为全景故事板九宫格`,
      dimensions: res.dimensions,
      duration: res.duration,
      aspectRatio: res.aspectRatio,
      contactSheetUrl: res.contactSheetUrl,
      sampleFrames: res.frameUrls,
      _visualImages: [
        { url: res.contactSheetUrl, label: `全景故事板九宫格 (${res.sampleCount}帧, ${res.duration}秒)` },
      ],
    });
  } catch (err: unknown) {
    return JSON.stringify({ success: false, error: formatToolError(err) });
  }
}

export async function toolExtractVideoDetailedFrames(
  videoUrl: string,
  startSec: number,
  endSec: number,
  frameCount: number,
  signal?: AbortSignal,
): Promise<string> {
  const target = videoUrl.trim();
  if (!target) return JSON.stringify({ success: false, error: '缺少 video_url 参数' });
  try {
    const res = await extractVideoSegmentFrames(target, {
      startSec,
      endSec,
      frameCount,
      signal,
    });
    return JSON.stringify({
      success: true,
      message: `已成功在区间 ${res.timeRange} 内深度截取 ${res.count} 张高清特写画面`,
      timeRange: res.timeRange,
      duration: res.duration,
      frameUrls: res.frameUrls,
      _visualImages: res.frameUrls.map((u, i) => ({
        url: u,
        label: `镜头特写帧 #${i + 1} (${res.timeRange})`,
      })),
    });
  } catch (err: unknown) {
    return JSON.stringify({ success: false, error: formatToolError(err) });
  }
}
