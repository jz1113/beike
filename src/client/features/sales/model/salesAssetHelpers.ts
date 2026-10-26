import type { SalesCreativeAsset, SalesImageRef, VideoSalesScript } from '@shared/domain/sales';
import { salesContentRevision } from '@shared/domain/sales';

export type SalesFrameGenerator = (input: {
  prompt: string;
  imageModel?: string;
  referenceImage?: string;
  referenceImages?: string[];
  aspectRatio?: string;
  existingTaskId?: string;
  idempotencyKey?: string;
  onTaskId?: (taskId: string) => void;
  isAborted: () => boolean;
}) => Promise<string>;

export const SALES_IMAGE_BATCH_LIMIT = 20;

export async function mapWithLimit<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await run(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

const REFERENCE_REJECTION = /参考图无法读取|缺失参考图|不支持的参考图|参考图超过|图像编辑缺少参考图/;

export function salesReferenceRejection(message?: string): boolean {
  return typeof message === 'string' && REFERENCE_REJECTION.test(message);
}

/** A provider or local reader refused the image before any queryable task existed. */
export function canResubmitRejectedAsset(asset: Pick<SalesCreativeAsset, 'status' | 'taskId' | 'error' | 'validationReason'>): boolean {
  return asset.status === 'uncertain' && !asset.taskId && salesReferenceRejection(asset.error || asset.validationReason);
}

export function explainSalesReferenceError(message: string, labels: string[]): string {
  if (!salesReferenceRejection(message) || message.includes('没有创建可查询的生成任务')) return message;
  const match = message.match(/第\s*(\d+)\s*张|图\s*(\d+)/);
  const index = Number(match?.[1] || match?.[2] || 0);
  const label = index > 0 ? labels[index - 1] : undefined;
  const target = label ? `第 ${index} 张参考图「${label}」` : index > 0 ? `第 ${index} 张参考图` : '参考图';
  return `${target}无法读取，这次没有创建可查询的生成任务，可以直接重试。`;
}

/** Asset references follow the still's view, independently of video shot assignments. */
export function salesAssetProductImages(asset: SalesCreativeAsset, images: SalesImageRef[]): SalesImageRef[] {
  if (!asset.usesProduct) return [];
  const available = images.filter((image) => image.url.trim() && !image.unavailable);
  if (!asset.productImageIndexes?.length) throw new Error(`${asset.label}缺少商品参考编号，请重新编写脚本`);
  return asset.productImageIndexes.map((index) => {
    const image = available.find((item) => item.index === index);
    if (!image) throw new Error(`${asset.label}引用的商品图 ${index} 未被选中或已不可用，请更新方案`);
    return image;
  });
}

export function salesAssetImagePrompt(asset: SalesCreativeAsset, products: SalesImageRef[], dependencies: SalesCreativeAsset[], selectedColor: string): string {
  const lines = [
    `本次只生成一张静帧，素材名称：${asset.label}。`,
    `本张画面要求：${asset.prompt}`,
    '只画本张要求的单一视角，不混入其他分镜动作，不生成多视图、拼图、对照图、文字或时间轴。',
  ];
  if (products.length) {
    lines.push('商品原图是外观事实依据，生成素材不能覆盖或纠正原图事实。');
    products.forEach((image, index) => lines.push(`输入参考图${index + 1}：商品原图（目录编号 ${image.index}）。先辨认其真实视角，按本张目标视角使用；目录编号和图片先后顺序不代表正反面。`));
    lines.push('严格区分商品正面、背面、侧面和局部：按领口前后高低、门襟、口袋、接缝、胸前或背部图案与标志的位置判断，不能把背面当正面、水平镜像冒充转身，或把胸前标志移到背部。局部细节只能还原原图中可见的部位，不能臆造看不清的结构。');
    if (selectedColor.trim()) lines.push(`商品颜色：${selectedColor.trim()}；与商品原图保持一致。`);
  }
  dependencies.forEach((dependency, index) => lines.push(`输入参考图${products.length + index + 1}：已生成素材「${dependency.label}」，只继承所需的人物身份、空间与光线；商品正反面与细节仍以商品原图及本张要求为准，不照搬前置素材的视角。`));
  return lines.join('\n');
}

export function salesAssetSourceRevision(asset: SalesCreativeAsset, images: SalesImageRef[], assets: SalesCreativeAsset[], selectedColor: string, aspectRatio: string): string {
  const products = salesAssetProductImages(asset, images);
  const dependencies = (asset.referenceAssetIds || []).map((id) => assets.find((item) => item.id === id));
  return salesContentRevision({
    prompt: salesAssetImagePrompt(asset, products, dependencies.filter((item): item is SalesCreativeAsset => Boolean(item)), selectedColor),
    kind: asset.kind, referenceImages: [...products.map((item) => item.url), ...dependencies.map((item) => item?.url)], aspectRatio,
  });
}

/** Keep previous pictures/receipts visible, but require regeneration when their source changes. */
export function updateSalesCreativeAsset(script: VideoSalesScript, id: string, patch: Partial<SalesCreativeAsset>): VideoSalesScript {
  const previous = script.assets?.find((asset) => asset.id === id);
  if (!previous) return script;
  const promptChanged = patch.prompt !== undefined && patch.prompt !== previous.prompt;
  const imageChanged = patch.url !== undefined && patch.url !== previous.url;
  const changed = new Set(promptChanged || imageChanged ? [id] : []);
  const assets = script.assets?.map((asset) => {
    if (asset.id === id) return { ...asset, ...patch, ...(promptChanged ? { status: 'pending' as const, validation: 'pending' as const, validationSource: undefined, validationReason: undefined } : {}) };
    if (!asset.referenceAssetIds?.some((dependency) => changed.has(dependency))) return asset;
    changed.add(asset.id);
    return { ...asset, ...(['generating', 'uncertain'].includes(asset.status || '') ? {} : { status: 'pending' as const }), validation: 'pending' as const, validationSource: undefined, validationReason: '前置素材已变化，请重新生成此素材' };
  });
  return { ...script, assets, assetValidation: 'pending', finalizedRevision: undefined };
}

/** Query saved receipts without applying the currently edited draft to already-paid work. */
export async function recoverSalesAssetReceipts(input: {
  script: VideoSalesScript;
  isAborted: () => boolean;
  updateAsset: (id: string, patch: Partial<SalesCreativeAsset>) => void;
}, generate: SalesFrameGenerator, lookup?: import('./salesImageTypes').SalesImageBatchClient['lookup']): Promise<void> {
  const pending = (input.script.assets || []).filter((asset) => (asset.taskId || asset.submissionKey) && ['generating', 'uncertain'].includes(asset.status || ''));
  if (input.isAborted()) throw new DOMException('已停止查询', 'AbortError');
  const results = await mapWithLimit(pending, SALES_IMAGE_BATCH_LIMIT, async (asset) => {
    try {
      let taskId = asset.taskId;
      if (!taskId && asset.submissionKey && lookup) {
        const found = await lookup(asset.submissionKey, asset.modelId, input.isAborted);
        if (found.outcome === 'done' && found.url) return { asset, url: found.url, error: undefined as unknown };
        if (found.taskId) { taskId = found.taskId; input.updateAsset(asset.id, { taskId }); }
        if (found.outcome === 'failed') {
          const error = new Error(found.error || '原图片任务失败'); error.name = 'ImageGenBusinessError'; throw error;
        }
      }
      if (!taskId) throw new Error('图片提交结果仍待核实，请继续查询原任务，不会重新提交');
      const url = await generate({ existingTaskId: taskId, imageModel: asset.modelId, prompt: '', isAborted: input.isAborted });
      return { asset, url, error: undefined as unknown };
    } catch (error) {
      return { asset, url: undefined, error };
    }
  });
  let failure: unknown;
  for (const result of results) {
    if (result.url) {
      input.updateAsset(result.asset.id, { url: result.url, status: 'done', validation: 'pending', error: undefined });
      continue;
    }
    const error = result.error;
    input.updateAsset(result.asset.id, {
      status: !input.isAborted() && error instanceof Error && error.name === 'ImageGenBusinessError' ? 'failed' : 'uncertain',
      error: error instanceof Error ? error.message : '原图片任务结果未确认',
    });
    if (failure === undefined) failure = error ?? new Error('原图片任务结果未确认');
  }
  if (failure !== undefined) throw failure instanceof Error ? failure : new Error('原图片任务结果未确认');
}

/** Keep receipts/history separate; only completed images with unchanged creative inputs are reusable. */
export function reuseSalesPlanAssets(next: VideoSalesScript, previous?: VideoSalesScript): VideoSalesScript {
  if (!previous || next.planRevision !== previous.planRevision) return next;
  const creative = (asset: SalesCreativeAsset) => salesContentRevision({
    id: asset.id, kind: asset.kind, prompt: asset.prompt, usesProduct: asset.usesProduct,
    referenceAssetIds: asset.referenceAssetIds || [], productImageIndexes: asset.productImageIndexes,
  });
  const reused = new Set<string>();
  return { ...next, assets: next.assets?.map((asset) => {
    const old = previous.assets?.find((item) => item.id === asset.id && creative(item) === creative(asset));
    if (!old || old.status !== 'done' || !old.url || asset.referenceAssetIds?.some((id) => !reused.has(id))) return asset;
    reused.add(asset.id);
    return {
      ...asset, url: old.url, status: 'done', sourceRevision: old.sourceRevision,
      validation: 'pending', modelId: old.modelId, attempts: old.attempts,
    };
  }), assetValidation: 'pending' };
}
