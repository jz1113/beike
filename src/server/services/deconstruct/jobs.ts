import { createHash } from 'node:crypto';
import type { DeconstructJobItemInput, DeconstructJobItemResult, DeconstructJobSubmit } from '@shared/contracts/deconstructJobs';
import { AppError } from '@server/core/errors';
import { safeErrorMessage } from '@server/core/validate';
import { requireWorkspaceId, runWithWorkspace } from '@server/infrastructure/workspace/workspaceContext';
import { persistDeconstructJobImage, persistDeconstructJobResult } from '@server/infrastructure/storage/deconstructJobMedia';
import { resolveGatewayCreds } from '@shared/domain/models/gatewayCreds';
import { getDefaultBaseUrl, getDefaultApiKey } from '../models/gatewayCredentials';
import { listDeconstructMajorCategories, resolveDeconstructTargetCategory, validateDeconstructTargetSubcategory } from '@server/repositories/deconstructProductCategory';
import {
  claimDeconstructJobItem, commitDeconstructJobDispatch, createDeconstructJob, finalizeDeconstructJob,
  finishDeconstructJobItem, interruptDeconstructJob, stopDeconstructJob, updateDeconstructJobProgress,
} from '@server/repositories/deconstructJobs';
import { processDeconstructRequest } from './processRequest';

type LiveJob = { stopping: boolean; completion: Promise<void>; progressWrites: Promise<void>; error?: string };
const liveJobs = new Map<string, LiveJob>();
let shuttingDown = false;
const liveKey = (workspaceId: string, jobId: string) => `${workspaceId}:${jobId}`;

function scrub(value: unknown, apiKey: string): unknown {
  if (typeof value === 'string') {
    const redacted = apiKey ? value.split(apiKey).join('[密钥已隐藏]') : value;
    return redacted.replace(/data:image\/[^;\s]+;base64,[A-Za-z0-9+/=]+/g, '[图片已保存]');
  }
  if (Array.isArray(value)) return value.map(item => scrub(item, apiKey));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/^(?:customApiKey|apiKey|authorization|workspaceToken)$/i.test(key))
    .map(([key, item]) => [key, scrub(item, apiKey)]));
  return value;
}

async function normalizeItems(items: DeconstructJobItemInput[]) {
  const categories = await listDeconstructMajorCategories();
  const output: DeconstructJobItemInput[] = [];
  for (const item of items) {
    const targetCategory = resolveDeconstructTargetCategory(item.targetCategory, categories);
    if (item.targetCategory && !targetCategory) throw new AppError('所选商品大类不存在，请重新选择', 400, 'invalid_job_category');
    const targetSubcategory = await validateDeconstructTargetSubcategory(item.targetSubcategory, targetCategory);
    const images: string[] = [];
    for (const image of item.images) {
      try { images.push(await persistDeconstructJobImage(image)); }
      catch (error) { throw new AppError(safeErrorMessage(error, '图片存储失败'), 400, 'invalid_job_image'); }
    }
    output.push({ ...item, images, targetCategory: targetCategory || '', targetSubcategory: targetSubcategory?.folderId || '' });
  }
  return output;
}

export async function submitDeconstructJob(req: Request, input: DeconstructJobSubmit) {
  if (shuttingDown) throw new AppError('服务正在关闭，请稍后重新提交并核对原任务', 503, 'server_shutting_down');
  const workspaceId = requireWorkspaceId();
  const credentials = resolveGatewayCreds(req, { model: input.model, ...input.overrides }, { baseUrl: getDefaultBaseUrl(), apiKey: getDefaultApiKey() });
  const items = await normalizeItems(input.items);
  if (shuttingDown) throw new AppError('服务正在关闭，请稍后重新提交并核对原任务', 503, 'server_shutting_down');
  const config = {
    model: input.model, userHint: input.userHint, fallbackOrder: input.fallbackOrder,
    concurrency: input.concurrency, reviewBeforeSave: input.reviewBeforeSave,
    apiFormat: input.overrides?.apiFormat, allowInsecureHttp: input.overrides?.allowInsecureHttp,
  };
  const configJson = JSON.stringify(scrub(config, credentials.apiKey));
  const inputHash = createHash('sha256').update(JSON.stringify({ items, config, baseUrl: credentials.baseUrl })).digest('hex');
  const created = await createDeconstructJob({ job: input, items, configJson, inputHash });
  if (created.reused) return created;
  // Shutdown may begin while the creation transaction is committing. Freeze this
  // newly accepted queue before it can escape the drain's live-job snapshot.
  if (shuttingDown) return { reused: false, job: await stopDeconstructJob(input.jobId) };
  const key = liveKey(workspaceId, input.jobId);
  const live: LiveJob = { stopping: false, completion: Promise.resolve(), progressWrites: Promise.resolve() };
  liveJobs.set(key, live);
  // This request is detached from the browser's AbortSignal. Secrets remain only in this closure.
  const runtime: JobRuntime = { ...config, jobId: input.jobId, itemCount: items.length, overrides: input.overrides, credentials };
  live.completion = runJob(workspaceId, key, live, runtime);
  return created;
}

type JobRuntime = Omit<DeconstructJobSubmit, 'items'> & { itemCount: number; credentials: { baseUrl: string; apiKey: string } };

async function runJob(workspaceId: string, key: string, live: LiveJob, runtime: JobRuntime) {
  const { credentials, itemCount } = runtime;
  const executionRequest = new Request('http://background.local/deconstruct');
  return runWithWorkspace(workspaceId, async () => {
    const worker = async () => {
      while (!live.stopping) {
        const claimed = await claimDeconstructJobItem(runtime.jobId);
        if (!claimed) return;
        const item = claimed.input;
        const response = await processDeconstructRequest(executionRequest, {
          imageUrls: item.images, albumName: item.name,
          userHint: runtime.userHint ? `${runtime.userHint}（套组名称：${item.name}）` : `套组名称：${item.name}`,
          model: runtime.model, fallbackOrder: runtime.fallbackOrder,
          targetCategory: item.targetCategory, targetSubcategory: item.targetSubcategory,
          customSubCategories: item.customSubCategories,
          customBaseUrl: credentials.baseUrl, customApiKey: credentials.apiKey,
          apiFormat: runtime.overrides?.apiFormat, allowInsecureHttp: runtime.overrides?.allowInsecureHttp,
          autoSave: !runtime.reviewBeforeSave, reviewBeforeSave: runtime.reviewBeforeSave,
          clientTaskId: createHash('sha256').update(`${runtime.jobId}:${item.id}`).digest('hex'),
        }, {
          beforeDispatch: () => live.stopping ? Promise.resolve(false) : commitDeconstructJobDispatch(runtime.jobId, item.id),
          onProgress: progress => {
            live.progressWrites = live.progressWrites.then(() => updateDeconstructJobProgress(runtime.jobId, item.id, progress)).catch(() => {
              live.stopping = true; live.error = '后台进度保存失败，请核对已派发请求的结果';
            });
          },
        });
        const payload = await response.json() as Record<string, unknown>;
        const clean = scrub(payload, credentials.apiKey) as Record<string, unknown>;
        let result: DeconstructJobItemResult;
        if (response.ok && clean.success) {
          const dataRef = JSON.stringify(clean.data ?? null).length > 512_000 ? await persistDeconstructJobResult(clean.data) : undefined;
          const data = dataRef ? null : clean.data;
          result = { ok: true, partial: Boolean(clean.partial), data, stats: clean.stats,
            ...(dataRef ? { dataRef } : {}),
            ...(typeof clean.reviewId === 'string' ? { reviewId: clean.reviewId } : {}),
            ...(typeof clean.usedModel === 'string' ? { usedModel: clean.usedModel } : {}) };
        } else result = { ok: false, error: typeof clean.error === 'string' ? clean.error : `反推失败（HTTP ${response.status}）` };
        await live.progressWrites;
        await finishDeconstructJobItem(runtime.jobId, item.id, result, clean.code === 'job_stopped' ? 'stopped' : undefined);
      }
    };
    const workers = await Promise.allSettled(Array.from({ length: Math.min(runtime.concurrency, itemCount) }, () => worker().catch(error => {
      live.stopping = true; live.error = safeErrorMessage(scrub(safeErrorMessage(error), credentials.apiKey), '后台调度异常，请核对模型结果');
      throw error;
    })));
    await live.progressWrites;
    if (live.error || workers.some(result => result.status === 'rejected')) {
      await interruptDeconstructJob(runtime.jobId, live.error || '后台调度中断，请核对已派发请求的结果');
    }
    await finalizeDeconstructJob(runtime.jobId);
  }).catch(error => {
    // A persistence failure must not cause a retry of any billable operation.
    console.error('[DeconstructJobs] 后台任务状态保存失败:', safeErrorMessage(error));
  }).finally(() => { liveJobs.delete(key); });
}

export async function requestDeconstructJobStop(jobId: string) {
  const live = liveJobs.get(liveKey(requireWorkspaceId(), jobId));
  if (live) live.stopping = true;
  return stopDeconstructJob(jobId);
}

/** Freeze new dispatch immediately, drain already-issued requests for the shutdown grace period. */
export async function drainDeconstructJobs(timeoutMs: number) {
  shuttingDown = true;
  const pending = [...liveJobs.values()];
  for (const live of pending) live.stopping = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([Promise.allSettled(pending.map(job => job.completion)), new Promise(resolve => { timer = setTimeout(resolve, timeoutMs); })]);
  } finally { if (timer) clearTimeout(timer); }
}
