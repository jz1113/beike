import { apiFetch, proxyMediaUrl } from '@client/shared/api/apiClient';
import { pollDepthVideoTask } from '@client/shared/api/generation/depthGeneration';
import { sleepWhilePolling } from '@client/shared/api/generation/generationAbort';

const STAGE_LABELS: Record<string, string> = {
  queued: '排队等待',
  probing: '检测视频',
  extracting: '抽取视频帧',
  inferring: '提取动作深度',
  encoding: '合成深度视频',
  uploading: '保存结果',
  done: '转换完成',
};

export async function readSalesDepthReceipt(video: boolean, operationId: string, signal: AbortSignal): Promise<{ taskId?: string; resultUrl?: string }> {
  const response = await apiFetch(`/api/generate/depth-${video ? 'video' : 'image'}?taskKey=${encodeURIComponent(operationId)}`, { signal });
  const data = await response.json();
  if (!response.ok || !data.success || (!data.taskId && !data.resultUrl)) throw new Error(data.error || '原转换任务结果待核对，请稍后继续查询');
  return data;
}

export async function waitSalesDepthVideo(taskId: string, signal: AbortSignal, onProgress: (text: string) => void): Promise<string> {
  const deadline = Date.now() + 30 * 60_000;
  while (!signal.aborted && Date.now() < deadline) {
    const result = await pollDepthVideoTask(taskId, signal);
    if (result.status === 'FAILURE') throw new Error(result.failReason || '深度视频转换失败');
    if (result.status === 'SUCCESS' && result.resultUrl) return result.resultUrl;
    const stageText = result.stage ? (STAGE_LABELS[result.stage] || result.stage) : '';
    onProgress(`深度视频转换中 ${result.progress || ''}${stageText ? ` · ${stageText}` : ''}`);
    await sleepWhilePolling(1000, () => signal.aborted);
  }
  throw new Error('等待已结束，可继续查询原转换任务');
}

export async function fetchSalesActionFile(url: string, video: boolean, signal: AbortSignal): Promise<File> {
  const response = await fetch(proxyMediaUrl(url, { asVideo: video }), { signal });
  if (!response.ok) throw new Error('读取动作原素材失败，请重新上传');
  const blob = await response.blob();
  const extension = new URL(url, window.location.href).pathname.split('.').pop();
  const suffix = extension && /^(mp4|webm|mov|m4v|jpe?g|png|webp|gif)$/i.test(extension) ? extension : video ? 'mp4' : 'png';
  return new File([blob], `action.${suffix}`, { type: blob.type || (video ? 'video/mp4' : 'image/png') });
}
