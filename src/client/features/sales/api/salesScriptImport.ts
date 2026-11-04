import { submitDepthVideo } from '@client/shared/api/generation/depthGeneration';
import { requiresGenerationRecovery } from '@client/shared/api/generation/generationRecovery';
import { DEPTH_VIDEO_LIMITS } from '@shared/domain/media/depthVideo';
import {
  analyzeReferenceVideo, fetchSalesScript, patchSalesScript, saveSalesScript,
  uploadScriptVideo, type StoredSalesScript,
} from './salesScripts';
import { readSalesDepthReceipt } from './salesDepth';
import { ScriptDepthFailed, waitScriptDepth } from './salesScriptDepth';
import type { SalesScriptImportItem } from '../model/salesScriptImport';

interface ImportServices {
  upload: typeof uploadScriptVideo;
  analyze: typeof analyzeReferenceVideo;
  read: typeof fetchSalesScript;
  save: typeof saveSalesScript;
  patch: typeof patchSalesScript;
  submitDepth: typeof submitDepthVideo;
  readDepth: typeof readSalesDepthReceipt;
  waitDepth: typeof waitScriptDepth;
}
const defaultServices: ImportServices = {
  upload: uploadScriptVideo, analyze: analyzeReferenceVideo,
  read: fetchSalesScript, save: saveSalesScript, patch: patchSalesScript, submitDepth: submitDepthVideo,
  readDepth: readSalesDepthReceipt, waitDepth: waitScriptDepth,
};
class ScriptImportCheckpointError extends Error {}

// Each receipt is checkpointed before another operation. Retrying never rewrites
// a stored script's title, taxonomy or review state from an old analysis result.
export async function runSalesScriptImportBatch(items: readonly SalesScriptImportItem[], options: { model: string; includeDepth: boolean },
  signal: AbortSignal, onPatch: (key: string, patch: Partial<SalesScriptImportItem>) => void,
  onSaved: (stored: StoredSalesScript) => void, overrides: Partial<ImportServices> = {}): Promise<void> {
  const services = { ...defaultServices, ...overrides };
  for (const original of items) {
    if (signal.aborted) break;
    if (original.status === 'done') continue;
    let item = { ...original };
    const checkpoint = (patch: Partial<SalesScriptImportItem>) => {
      if (patch.status === 'done') patch = {...patch, video: undefined, file: undefined};
      try { onPatch(item.key, patch); }
      catch (error) { throw new ScriptImportCheckpointError(error instanceof Error ? error.message : '无法保存导入进度，请保留当前页面'); }
      item = { ...item, ...patch };
    };
    const active = () => signal.throwIfAborted();
    try {
      checkpoint({ error: '', model: item.result || item.scriptId ? item.model || options.model : options.model,
        includeDepth: item.depthState === 'submitted' || item.depthState === 'ready' ? true : options.includeDepth });
      if (!item.video) {
        if (!item.file) throw new Error('请重新选择此视频文件，已保存的分析和任务进度会保留');
        checkpoint({ status: 'uploading' });
        const video = await services.upload(item.file, signal);
        checkpoint({ video }); active();
      }
      const video = item.video!;
      let stored: StoredSalesScript | null = null;
      const knownId = item.scriptId || item.result?.existingId;
      if (knownId) {
        stored = await services.read(knownId, signal); active();
        if (!stored) throw new Error('已保存的脚本已被移除，请从队列移除此项后重新导入');
      } else {
        if (!item.result) {
          checkpoint({ status: 'analyzing' });
          const result = item.includeDepth && video.durationSec <= DEPTH_VIDEO_LIMITS.maxDurationSec && (video.sizeBytes || item.size) <= DEPTH_VIDEO_LIMITS.maxDataUrlBytes
            ? await services.analyze(video.videoUrl, item.model!, signal, false, true)
            : await services.analyze(video.videoUrl, item.model!, signal);
          checkpoint({ result }); active();
        }
        if (!stored && item.result?.existingId) {
          stored = await services.read(item.result.existingId, signal); active();
          if (!stored) throw new Error('分析结果已被移除，请从队列移除此项后重新导入');
        }
        if (!stored) {
          checkpoint({ status: 'saving' });
          // A lost POST receipt may have been followed by manual edits. Reconcile
          // the exact stable ID before using the server's upsert endpoint again.
          stored = await services.read(item.saveId, signal); active();
          if (!stored) {
            const result = item.result!;
            stored = await services.save({ id: item.saveId, videoUrl: '', videoHash: result.videoHash,
              status: 'verified', script: result.script, model: result.model, promptVersion: result.promptVersion });
          }
        }
      }
      const depthWarning = item.result?.depthWarning;
      checkpoint({ scriptId: stored.id, result: undefined }); onSaved(stored); active();
      if (depthWarning && !stored.depthVideoUrl) { checkpoint({depthState: 'failed'}); throw new Error('脚本已保存，深度转换未完成：' + depthWarning); }
      // A retry also adopts an already linked result or accepted task, including
      // depth work the user started from the script detail while this row waited.
      if (!item.depthVideoUrl && stored.depthVideoUrl) checkpoint({ depthState: 'ready', depthVideoUrl: stored.depthVideoUrl,
        depthTaskId: stored.depthTaskId, depthOperationId: stored.depthOperationId, includeDepth: true });
      const storedTaskChanged = Boolean((stored.depthOperationId && stored.depthOperationId !== item.depthOperationId)
        || (stored.depthTaskId && stored.depthTaskId !== item.depthTaskId));
      const adoptStoredTask = !item.depthState || ((item.depthState === 'prepared' || item.depthState === 'failed') && storedTaskChanged);
      if (adoptStoredTask && (stored.depthTaskId || stored.depthOperationId)) checkpoint({ depthState: 'submitted',
        depthTaskId: stored.depthTaskId, depthOperationId: stored.depthOperationId, includeDepth: true });
      if (!item.includeDepth) { checkpoint({ status: 'done' }); continue; }
      if (item.depthState !== 'submitted' && item.depthState !== 'ready'
        && (video.durationSec > DEPTH_VIDEO_LIMITS.maxDurationSec || (video.sizeBytes || item.size) > DEPTH_VIDEO_LIMITS.maxDataUrlBytes)) {
        checkpoint({ status: 'done', depthState: 'skipped', depthProgress: '已保存脚本；视频超过 35 MB 或 30 秒，跳过深度转换，可稍后关联深度视频' });
        continue;
      }
      checkpoint({ status: 'depth' });
      if (item.depthState !== 'submitted' && item.depthState !== 'ready') {
        checkpoint({ depthState: 'prepared', depthOperationId: `sales_script_depth_${crypto.randomUUID()}`, depthTaskId: '', depthVideoUrl: '' });
        const file = item.file;
        if (!file) throw new Error('原视频已清理，请重新选择同一文件以补生成深度视频');
        active();
        checkpoint({ depthState: 'submitted', depthProgress: '正在提交深度视频' });
        try {
          const receipt = await services.submitDepth(file, 'mocap', 'standard', signal, item.depthOperationId);
          checkpoint({ depthTaskId: receipt.taskId }); active();
        } catch (error) {
          if (!(error instanceof ScriptImportCheckpointError) && !signal.aborted && !requiresGenerationRecovery(error)) checkpoint({ depthState: 'failed' });
          throw error;
        }
      } else if (!item.depthTaskId && !item.depthVideoUrl) {
        const receipt = await services.readDepth(true, item.depthOperationId!, signal);
        checkpoint({ depthTaskId: receipt.taskId, ...(receipt.resultUrl ? { depthVideoUrl: receipt.resultUrl, depthState: 'ready' } : {}) }); active();
      }
      if (item.depthTaskId && !item.depthVideoUrl) {
        const linked = await services.patch(stored.id, { depthTaskId: item.depthTaskId, depthOperationId: item.depthOperationId });
        onSaved(linked); active();
        try {
          const resultUrl = await services.waitDepth(item.depthTaskId, signal, (depthProgress) => { active(); checkpoint({ depthProgress }); });
          checkpoint({ depthVideoUrl: resultUrl, depthState: 'ready' }); active();
        } catch (error) {
          if (error instanceof ScriptDepthFailed && !signal.aborted) checkpoint({ depthState: 'failed' });
          throw error;
        }
      }
      if (!item.depthVideoUrl) throw new Error('深度任务结果待核对，请继续查询原任务');
      active();
      const linked = await services.patch(stored.id, { depthTaskId: item.depthTaskId, depthOperationId: item.depthOperationId, depthVideoUrl: item.depthVideoUrl });
      onSaved(linked);
      checkpoint({ status: 'done', depthState: 'ready', depthProgress: '脚本与深度视频已保存' });
    } catch (error) {
      if (error instanceof ScriptImportCheckpointError) throw error;
      if (item.status === 'analyzing' && !item.result && !item.scriptId) checkpoint({video:undefined});
      if (signal.aborted) break;
      checkpoint({ status: 'error', error: error instanceof Error ? error.message : '导入失败，请重试此项' });
    }
  }
}
