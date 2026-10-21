import {
  salesActualReferences, salesContentRevision, validateSalesAssetPlan,
  type SalesCreativeAsset, type SalesImageRef, type VideoSalesScript,
} from '@shared/domain/video-sales';
import { canResubmitRejectedAsset, explainSalesReferenceError, mapWithLimit, SALES_IMAGE_BATCH_LIMIT, salesAssetImagePrompt, salesAssetProductImages, salesReferenceRejection } from './salesAssetHelpers';
import type { SalesImageBatchClient, SalesImageBatchReceipt } from './salesImageTypes';
import type { SalesRouteHeaders } from './salesRoute';

export interface SalesAssetValidator {
  (input: {
    shots: VideoSalesScript['shots'];
    imageCatalog: SalesImageRef[];
    actualReferences: ReturnType<typeof salesActualReferences>;
    assets?: VideoSalesScript['assets'];
    productAnalysis?: string;
    workflowVersion?: 3;
    eligibleImageIndexes?: number[];
    selectedColor?: string;
    aspectRatio?: string;
    signal?: AbortSignal;
  } & SalesRouteHeaders): Promise<Array<{ id: string; status: 'passed' | 'conflict' | 'uncertain'; reason: string }>>;
}

type AssetJob = {
  id: string;
  label: string;
  prompt: string;
  referenceImages: string[];
  referenceLabels: string[];
  sourceRevision: string;
  resume: boolean;
  submissionKey: string;
  modelId: string;
  taskId?: string;
  attempts: number;
};

type AssetDecision = { kind: 'skip' } | { kind: 'wait' } | { kind: 'block'; error: Error } | { kind: 'run'; job: AssetJob };

export async function prepareSalesCreativeAssets(input: {
  script: VideoSalesScript;
  images: SalesImageRef[];
  imageModel: string;
  aspectRatio: string;
  selectedColor: string;
  productAnalysis: string;
  route: SalesRouteHeaders;
  regenerateId?: string;
  validateOnly?: boolean;
  autoValidate?: boolean;
  isAborted: () => boolean;
  updateAsset: (id: string, patch: Partial<SalesCreativeAsset>) => void;
  getScript: () => VideoSalesScript;
  setValidation: (status: NonNullable<VideoSalesScript['assetValidation']>) => void;
}, client: SalesImageBatchClient, validate: SalesAssetValidator): Promise<void> {
  if (input.validateOnly) return validatePreparedSalesAssets(input, validate);
  if (input.script.assets?.length && !input.imageModel.trim()) throw new Error('请先选择绘图模型');
  const assets = input.script.assets || [];
  validateSalesAssetPlan(assets, input.images);
  const scope = preparationScope(assets, input.regenerateId);
  const plannedAssets = scope ? assets.filter((asset) => scope.has(asset.id)) : assets;
  const finished = new Set<string>();
  while (finished.size < plannedAssets.length) {
    if (input.isAborted()) throw new DOMException('已停止素材准备', 'AbortError');
    const wave: AssetJob[] = [];
    let blocked: Error | undefined;
    for (const planned of plannedAssets) {
      if (finished.has(planned.id)) continue;
      const decision = inspectAsset(input, planned.id);
      if (decision.kind === 'wait') continue;
      if (decision.kind === 'skip') { finished.add(planned.id); continue; }
      if (decision.kind === 'block') { blocked = decision.error; break; }
      wave.push(decision.job);
    }
    if (!wave.length) {
      if (blocked) throw blocked;
      const pending = plannedAssets.find((asset) => !finished.has(asset.id));
      if (pending) throw new Error(`${pending.label}的前置参考图尚未完成`);
      break;
    }
    const failure = await runAssetWave(input, wave, client);
    for (const job of wave) finished.add(job.id);
    if (failure) throw failure;
    if (blocked) throw blocked;
  }
  if (input.autoValidate !== false) await validatePreparedSalesAssets(input, validate);
}

/** Re-check existing pictures without invoking or resubmitting image generation. */
export async function validatePreparedSalesAssets(input: Pick<Parameters<typeof prepareSalesCreativeAssets>[0],
  'script' | 'images' | 'isAborted' | 'getScript' | 'setValidation' | 'updateAsset' | 'productAnalysis' | 'selectedColor' | 'route'>,
validate: SalesAssetValidator): Promise<void> {
  if (input.isAborted()) throw new DOMException('已停止素材校验', 'AbortError');
  const assets = input.getScript().assets || [];
  validateSalesAssetPlan(assets, input.images);
  input.setValidation('pending');
  const missingRequired = assets.some((asset) => asset.required && (asset.status !== 'done' || !asset.url));
  if (missingRequired) {
    input.setValidation('pending');
    return;
  }
  const actualReferences = salesActualReferences(input.getScript(), input.images);
  const results = await validate({
    shots: input.script.shots, assets: input.getScript().assets, imageCatalog: input.images, actualReferences,
    productAnalysis: input.productAnalysis, workflowVersion: 3,
    eligibleImageIndexes: input.images.map((image) => image.index), selectedColor: input.selectedColor, ...input.route,
  });
  for (const result of results) {
    if (assets.some((asset) => asset.id === result.id)) input.updateAsset(result.id, { validation: result.status, validationReason: result.reason, validationSource: 'model' });
  }
  const failed = results.find((result) => result.status !== 'passed');
  input.setValidation(failed?.status || 'passed');
  if (failed) throw new Error(`素材需要确认：${failed.reason}`);
}

function preparationScope(assets: SalesCreativeAsset[], regenerateId?: string): Set<string> | null {
  if (!regenerateId) return null;
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  if (!byId.has(regenerateId)) throw new Error('要生成的素材不在当前计划中');
  const selected = new Set<string>();
  const visit = (id: string) => {
    if (selected.has(id)) return;
    const asset = byId.get(id);
    if (!asset) return;
    selected.add(id);
    for (const dependency of asset.referenceAssetIds || []) visit(dependency);
  };
  visit(regenerateId);
  return selected;
}

function inspectAsset(input: Parameters<typeof prepareSalesCreativeAssets>[0], id: string): AssetDecision {
  const current = input.getScript().assets?.find((asset) => asset.id === id);
  if (!current) return { kind: 'block', error: new Error('素材计划已经变化，请重新开始') };
  const dependencies = (current.referenceAssetIds || []).map((dependencyId) => input.getScript().assets?.find((asset) => asset.id === dependencyId));
  if (dependencies.some((asset) => !asset?.url || asset.status !== 'done')) return { kind: 'wait' };
  const productRefs = salesAssetProductImages(current, input.images);
  const referenceImages = [...productRefs.map((ref) => ref.url), ...dependencies.map((asset) => asset!.url!)];
  const referenceLabels = [...productRefs.map((ref) => `商品参考 ${ref.index + 1}`), ...dependencies.map((asset) => asset?.label || '前置素材')];
  const prompt = salesAssetImagePrompt(current, productRefs, dependencies as SalesCreativeAsset[], input.selectedColor);
  const sourceRevision = salesContentRevision({ prompt, kind: current.kind, referenceImages, aspectRatio: input.aspectRatio });
  const force = current.id === input.regenerateId;
  if (!force && current.status === 'done' && current.url && current.sourceRevision === sourceRevision) return { kind: 'skip' };
  if (current.status === 'uncertain' && !current.taskId && !(force && canResubmitRejectedAsset(current))) return { kind: 'block', error: new Error(`${current.label}提交结果未确认，请先核对服务端生成记录，不能自动重投`) };
  const resume = Boolean(current.taskId && (current.status === 'generating' || current.status === 'uncertain'));
  if (resume && current.sourceRevision !== sourceRevision) return { kind: 'block', error: new Error(`${current.label}仍有旧任务，请先查询完成后再更新素材`) };
  const attempts = current.sourceRevision === sourceRevision ? current.attempts || 0 : 0;
  if (!resume && attempts >= 3) return { kind: 'block', error: new Error(`${current.label}相同设定已提交 3 次，请修改设定并核对生成记录后再试`) };
  return { kind: 'run', job: {
    id: current.id, label: current.label, prompt, referenceImages, referenceLabels, sourceRevision, resume,
    submissionKey: resume && current.submissionKey ? current.submissionKey : crypto.randomUUID(),
    modelId: resume ? current.modelId || input.imageModel : input.imageModel,
    taskId: resume ? current.taskId : undefined,
    attempts: resume ? attempts : attempts + 1,
  } };
}

async function runAssetWave(input: Parameters<typeof prepareSalesCreativeAssets>[0], jobs: AssetJob[], client: SalesImageBatchClient): Promise<Error | undefined> {
  for (const job of jobs) {
    input.updateAsset(job.id, {
      status: 'generating', validation: 'pending', validationSource: undefined, validationReason: undefined, error: undefined, sourceRevision: job.sourceRevision,
      attempts: job.attempts, submissionKey: job.submissionKey, modelId: job.modelId, ...(job.resume ? {} : { taskId: undefined }),
    });
  }
  const fresh = jobs.filter((job) => !job.resume);
  let receipts: SalesImageBatchReceipt[] = [];
  if (fresh.length) {
    try {
      if (input.isAborted()) throw new DOMException('已停止素材准备', 'AbortError');
      receipts = await client.submitBatch(fresh.map((job) => ({
        id: job.id, prompt: job.prompt, imageModel: job.modelId, referenceImages: job.referenceImages,
        aspectRatio: input.aspectRatio, idempotencyKey: job.submissionKey,
      })), input.isAborted);
    } catch (error) {
      if (input.isAborted() || (error instanceof DOMException && error.name === 'AbortError')) {
        for (const job of fresh) input.updateAsset(job.id, { status: 'uncertain', error: '已停止等待，请按提交标识查询原任务，不要重新提交' });
        throw error;
      }
      const message = error instanceof Error ? error.message : '批量生图请求失败';
      receipts = await Promise.all(fresh.map(async (job) => {
        try {
          const found = await client.lookup(job.submissionKey, job.modelId, input.isAborted);
          if (found.outcome === 'uncertain' && !found.taskId) return { ...found, id: job.id, error: message };
          return { ...found, id: job.id };
        } catch (lookupError) {
          if (input.isAborted() || (lookupError instanceof DOMException && lookupError.name === 'AbortError')) throw lookupError;
          return { id: job.id, outcome: 'uncertain' as const, error: message };
        }
      }));
    }
  }
  const errors: Error[] = [];
  const polls: AssetJob[] = [];
  for (const job of jobs) {
    if (job.resume) { polls.push(job); continue; }
    const receipt = receipts.find((item) => item.id === job.id) || { id: job.id, outcome: 'uncertain' as const, error: '批量结果缺少这一张' };
    if (receipt.taskId) input.updateAsset(job.id, { taskId: receipt.taskId });
    if (receipt.outcome === 'done' && receipt.url) {
      input.updateAsset(job.id, { url: receipt.url, status: 'done', validation: 'pending', error: undefined, sourceRevision: job.sourceRevision, taskId: receipt.taskId });
      continue;
    }
    const rawError = receipt.error || (receipt.outcome === 'failed' ? '生图提交失败' : '图片结果未确认');
    const rejectedReference = salesReferenceRejection(rawError) && !receipt.taskId;
    if (receipt.outcome === 'failed' || rejectedReference) {
      const explained = explainSalesReferenceError(rawError, job.referenceLabels);
      input.updateAsset(job.id, { status: 'failed', taskId: receipt.taskId, validationReason: undefined, error: explained });
      errors.push(new Error(explained));
      continue;
    }
    if (receipt.outcome === 'poll' && (receipt.taskId || job.taskId)) {
      polls.push({ ...job, taskId: receipt.taskId || job.taskId });
      continue;
    }
    input.updateAsset(job.id, { status: 'uncertain', taskId: receipt.taskId, validationReason: undefined, error: rawError });
    errors.push(new Error(rawError));
  }
  const polled = await mapWithLimit(polls, SALES_IMAGE_BATCH_LIMIT, async (job) => {
    const taskId = input.getScript().assets?.find((asset) => asset.id === job.id)?.taskId || job.taskId;
    if (!taskId) return new Error(`${job.label}缺少任务回执`);
    try {
      const url = await client.poll({ taskId, imageModel: job.modelId, isAborted: input.isAborted });
      input.updateAsset(job.id, { url, status: 'done', validation: 'pending', error: undefined, sourceRevision: job.sourceRevision, taskId });
      return undefined;
    } catch (error) {
      const businessFailure = !input.isAborted() && error instanceof Error && ['ImageGenBusinessError', 'NonRetryableError'].includes(error.name);
      input.updateAsset(job.id, { status: businessFailure ? 'failed' : 'uncertain', taskId, error: error instanceof Error ? error.message : '图片结果未确认' });
      return error instanceof Error ? error : new Error('图片结果未确认');
    }
  });
  errors.push(...polled.filter((error): error is Error => error instanceof Error));
  return errors[0];
}
