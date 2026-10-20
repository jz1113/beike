import {
  salesActualReferences, salesContentRevision, validateSalesAssetPlan,
  type SalesCreativeAsset, type SalesImageRef, type VideoSalesScript,
} from '@shared/domain/video-sales';
import { validateSalesAssets, type SalesRouteHeaders } from '../api/videoSalesApi';
import { generateSalesReferenceFrame } from './generateShotAsset';

export async function prepareSalesCreativeAssets(input: {
  script: VideoSalesScript;
  images: SalesImageRef[];
  imageModel: string;
  aspectRatio: string;
  selectedColor: string;
  productAnalysis: string;
  route: SalesRouteHeaders;
  regenerateId?: string;
  isAborted: () => boolean;
  updateAsset: (id: string, patch: Partial<SalesCreativeAsset>) => void;
  getScript: () => VideoSalesScript;
  setValidation: (status: NonNullable<VideoSalesScript['assetValidation']>) => void;
}, generate = generateSalesReferenceFrame, validate = validateSalesAssets): Promise<void> {
  if (input.script.assets?.length && !input.imageModel.trim()) throw new Error('请先选择绘图模型');
  const assets = input.script.assets || [];
  validateSalesAssetPlan(assets);
  for (const planned of assets) {
    if (input.isAborted()) throw new DOMException('已停止素材准备', 'AbortError');
    const current = input.getScript().assets?.find((asset) => asset.id === planned.id);
    if (!current) throw new Error('素材计划已经变化，请重新开始');
    const dependencies = (current.referenceAssetIds || []).map((id) => input.getScript().assets?.find((asset) => asset.id === id));
    if (dependencies.some((asset) => !asset?.url || asset.status !== 'done')) throw new Error(`${current.label}的前置参考图尚未完成`);
    const productRefs = current.usesProduct ? salesActualReferences({ ...input.script, assets: [] }, input.images).map((ref) => ref.url) : [];
    const referenceImages = [...productRefs, ...dependencies.map((asset) => asset!.url!)];
    const narrative = input.script.shots.map((shot) => `${shot.description}；${shot.camera}`).join('\n');
    const generationPrompt = `${current.prompt}\n画面创作依据（只画一张静帧，不绘制时间轴或文字）：${narrative}`;
    const sourceRevision = salesContentRevision({ prompt: generationPrompt, kind: current.kind, referenceImages, aspectRatio: input.aspectRatio });
    const force = current.id === input.regenerateId;
    if (!force && current.status === 'done' && current.url && current.sourceRevision === sourceRevision) continue;
    if (current.status === 'uncertain' && !current.taskId) throw new Error(`${current.label}提交结果未确认，请先核对服务端生成记录，不能自动重投`);
    const resume = Boolean(current.taskId && (current.status === 'generating' || current.status === 'uncertain'));
    if (resume && current.sourceRevision !== sourceRevision) throw new Error(`${current.label}仍有旧任务，请先查询完成后再更新素材`);
    const attempts = current.sourceRevision === sourceRevision ? current.attempts || 0 : 0;
    if (!resume && attempts >= 3) throw new Error(`${current.label}相同设定已提交 3 次，请修改设定并核对生成记录后再试`);
    const submissionKey = resume ? current.submissionKey : crypto.randomUUID();
    input.updateAsset(current.id, { status: 'generating', validation: 'pending', error: undefined, sourceRevision, attempts: resume ? attempts : attempts + 1, submissionKey, modelId: resume ? current.modelId : input.imageModel, ...(resume ? {} : { taskId: undefined }) });
    let receipt = current.taskId;
    try {
      const url = await generate({
        prompt: generationPrompt, imageModel: resume ? current.modelId || input.imageModel : input.imageModel,
        referenceImages, aspectRatio: input.aspectRatio, isAborted: input.isAborted,
        existingTaskId: resume ? current.taskId : undefined, idempotencyKey: submissionKey,
        onTaskId: (taskId) => { receipt = taskId; input.updateAsset(current.id, { taskId }); },
      });
      // Save a completed image even if cancellation occurred while the provider returned it.
      input.updateAsset(current.id, { url, status: 'done', validation: 'pending', error: undefined, sourceRevision });
    } catch (err) {
      const businessFailure = err instanceof Error && ['ImageGenBusinessError', 'NonRetryableError'].includes(err.name);
      input.updateAsset(current.id, { status: businessFailure ? 'failed' : 'uncertain', taskId: receipt, error: err instanceof Error ? err.message : '图片结果未确认' });
      throw err;
    }
  }
  if (input.isAborted()) throw new DOMException('已停止素材校验', 'AbortError');
  const actualReferences = salesActualReferences(input.getScript(), input.images);
  const results = await validate({
    shots: input.script.shots, assets: input.getScript().assets, imageCatalog: input.images, actualReferences,
    productAnalysis: input.productAnalysis, workflowVersion: 3,
    eligibleImageIndexes: input.images.map((image) => image.index), selectedColor: input.selectedColor, ...input.route,
  });
  for (const result of results) {
    if (assets.some((asset) => asset.id === result.id)) input.updateAsset(result.id, { validation: result.status, validationReason: result.reason });
  }
  const failed = results.find((result) => result.status !== 'passed');
  input.setValidation(failed?.status || 'passed');
  if (failed) throw new Error(`素材需要确认：${failed.reason}`);
}
