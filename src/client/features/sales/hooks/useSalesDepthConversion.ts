import { useEffect, useRef, useState } from 'react';
import { getWorkspaceSecret } from '@client/shared/api/workspaceClient';
import { submitDepthImage, submitDepthVideo } from '@client/shared/api/generation/depthGeneration';
import type { DepthQuality, DepthVideoStyle } from '@shared/domain/media/depthVideo';
import { createSalesMaterial } from '../api/salesMaterials';
import { fetchSalesActionFile, readSalesDepthReceipt, waitSalesDepthVideo } from '../api/salesDepth';
import { depthFileError } from '../model/salesActionMedia';
import { cleanActionTags } from '../model/salesMaterialCatalog';

const STORAGE_KEY = 'beike_sales_depth_job_v1';
export interface DepthJob {
  operationId: string; video: boolean; sourceUrl: string; name: string; description: string;
  style: DepthVideoStyle; quality: DepthQuality; taskId?: string; resultUrl?: string;
  width?: number; height?: number; durationSec?: number; tags?: string;
}
function readJob(): DepthJob | null {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    const job = saved?.job;
    return saved?.workspace === getWorkspaceSecret() && job && typeof job.operationId === 'string' && typeof job.sourceUrl === 'string'
      && typeof job.name === 'string' && typeof job.description === 'string' && typeof job.video === 'boolean'
      && ['mocap', 'raw', 'turbo'].includes(job.style) && ['fast', 'standard', 'high'].includes(job.quality) ? job : null;
  } catch { return null; }
}

export function useSalesDepthConversion(onSaved: () => void) {
  const [job, setJob] = useState<DepthJob | null>(readJob);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);
  const jobRef = useRef(job);
  useEffect(() => () => abort.current?.abort(), []);
  const persist = (next: DepthJob | null) => {
    jobRef.current = next;
    setJob(next);
    try {
      if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify({ workspace: getWorkspaceSecret(), job: next }));
      else localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch {
      setError('本机保存失败，请保留当前页面；转换结果仍可查询或保存到资产库。');
      return false;
    }
  };
  const finish = async (current: DepthJob, controller: AbortController) => {
    const resultUrl = current.resultUrl || (current.taskId ? await waitSalesDepthVideo(current.taskId, controller.signal, (text) => {
      if (!controller.signal.aborted && abort.current === controller) setProgress(text);
    }) : '');
    if (!resultUrl) throw new Error('转换结果暂未返回，请继续查询原任务');
    if (!controller.signal.aborted) { persist({ ...current, resultUrl }); setProgress('转换完成，确认预览后保存到动作资产'); }
  };
  const start = async (input: {
    file?: File; sourceUrl?: string; video: boolean; name: string; description: string;
    style: DepthVideoStyle; quality: DepthQuality; width?: number; height?: number; durationSec?: number; tags?: string;
  }) => {
    if (abort.current || jobRef.current) return;
    const controller = new AbortController(); abort.current = controller;
    setBusy(true); setError(''); setProgress('正在准备原素材…');
    try {
      const file = input.file || await fetchSalesActionFile(input.sourceUrl || '', input.video, controller.signal);
      if (controller.signal.aborted) return;
      const message = depthFileError(file, input.video);
      if (message) throw new Error(message);
      const operationId = `sales_depth_${crypto.randomUUID()}`;
      const baseJob: DepthJob = {
        operationId, video: input.video, sourceUrl: input.sourceUrl || '', name: input.name.trim(),
        description: input.description.trim(), style: input.style, quality: input.quality,
        width: input.width, height: input.height, durationSec: input.durationSec, tags: input.tags || '',
      };
      // Save the recovery key before submitting: a lost response must not create a second job.
      if (!persist(baseJob)) {
        jobRef.current = null; setJob(null);
        throw new Error('无法保存转换任务，尚未提交；请释放本机存储空间后重试。');
      }
      setProgress(input.video ? '正在提交深度视频转换…' : '正在生成深度图片…');
      const result = input.video
        ? await submitDepthVideo(file, input.style, input.quality, controller.signal, operationId)
        : await submitDepthImage(file, input.style, input.quality, controller.signal, operationId);
      if (controller.signal.aborted) return;
      const accepted = { ...baseJob, ...result }; persist(accepted);
      await finish(accepted, controller);
    } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '深度转换失败'); }
    finally { if (abort.current === controller) { abort.current = null; setBusy(false); } }
  };
  const resume = async () => {
    const current = jobRef.current;
    if (!current || abort.current) return;
    const controller = new AbortController(); abort.current = controller;
    setBusy(true); setError(''); setProgress('正在核对原转换任务…');
    try {
      const accepted = current.taskId || current.resultUrl ? current : { ...current, ...await readSalesDepthReceipt(current.video, current.operationId, controller.signal) };
      if (controller.signal.aborted) return;
      persist(accepted); await finish(accepted, controller);
    } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '查询失败'); }
    finally { if (abort.current === controller) { abort.current = null; setBusy(false); } }
  };
  const save = async (options?: { categoryId?: string; name?: string; tags?: string }) => {
    const current = jobRef.current;
    if (!current?.resultUrl || abort.current) return;
    const controller = new AbortController(); abort.current = controller;
    setBusy(true); setError('');
    try {
      const finalName = (options?.name ?? current.name).trim() || '1';
      const cleanedTags = cleanActionTags(options?.tags ?? current.tags ?? '').join('，');
      const categoryId = options?.categoryId || '';
      await createSalesMaterial('action', {
        clientTaskId: current.operationId,
        title: finalName,
        action: current.description,
        shotType: '',
        camera: '',
        mediaType: current.video ? 'depth-video' : 'depth-image',
        mediaUrl: current.resultUrl,
        sourceUrl: '',
        coverUrl: current.video ? '' : current.resultUrl,
        tags: cleanedTags,
        productCategoryIds: categoryId ? [categoryId] : [],
      }, controller.signal);
      if (!controller.signal.aborted) { persist(null); setProgress('深度资产已保存'); onSaved(); }
    } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '保存失败，转换结果已保留'); }
    finally { if (abort.current === controller) { abort.current = null; setBusy(false); } }
  };
  const reset = () => {
    abort.current?.abort();
    abort.current = null;
    setBusy(false);
    setError('');
    persist(null);
    setProgress('');
  };
  return { job, busy, progress, error, start, resume, save, reset };
}
