import {
  buildPerImageReversePrompt,
  buildUnifiedDeconstructPrompt,
  resolveUnifiedShardSize,
  type PerImageResult,
} from '@beike/domain/assetDeconstruct/prompts';
import type { SubCategoryDef } from '@beike/domain/productCategory';
import { mapWithConcurrency } from '@beike/domain/asyncPool';
import { callVisionJson } from './visionCall';
import type { DeconstructProgress } from './progress';
import { parseUnifiedFromResponse } from './jsonHealer';
import type { VisionCallDiagnostics, VisionCallTracker } from './diagnostics';

export type PipelineMode =
  | 'single_vision_pass'
  | 'shard_vision_pass'
  | 'legacy_two_pass'
  | 'fallback';

export function buildAlbumLabel(albumName: string | undefined, suffix: string): string {
  const name = (albumName || '').trim();
  return name ? `套组「${name}」${suffix}` : suffix;
}

export function resolveEnablePass2(): boolean {
  return process.env.ASSET_DECONSTRUCT_ENABLE_PASS2 === 'true';
}

/** 同一套图集最多同时反推两片，避免重新变成一个长达数分钟的请求。 */
export function resolveUnifiedShardConcurrency(): number {
  const raw = Number(process.env.ASSET_DECONSTRUCT_SHARD_CONCURRENCY);
  return Number.isFinite(raw) && raw > 0 ? Math.min(3, Math.floor(raw)) : 2;
}

function offsetShardMetadata(parsed: Record<string, unknown>, offset: number): Record<string, unknown> {
  const shift = (value: unknown) =>
    typeof value === 'number' && Number.isInteger(value) ? value + offset : value;
  const shiftIndices = (value: unknown) =>
    Array.isArray(value) ? value.map(shift) : value;
  const shiftEntries = (value: unknown) =>
    Array.isArray(value) ? value.map((entry) => {
      if (!entry || typeof entry !== 'object') return entry;
      const item = entry as Record<string, unknown>;
      return {
        ...item,
        source_image_index: shift(item.source_image_index),
        source_image_indices: shiftIndices(item.source_image_indices),
      };
    }) : [];
  return {
    ...parsed,
    content_groups: shiftEntries(parsed.content_groups),
    scenes: shiftEntries(parsed.scenes),
    outfits: shiftEntries(parsed.outfits),
    actions: shiftEntries(parsed.actions),
  };
}

export function mergeUnifiedShardMetadata(
  shards: Array<{ parsedResult: Record<string, unknown>; offset: number }>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const { parsedResult, offset } of shards) {
    const shifted = offsetShardMetadata(parsedResult, offset);
    for (const key of ['content_groups', 'scenes', 'outfits', 'actions']) {
      merged[key] = [...(Array.isArray(merged[key]) ? merged[key] as unknown[] : []),
        ...(Array.isArray(shifted[key]) ? shifted[key] as unknown[] : [])];
    }
    if (!merged.theme_category && shifted.theme_category) merged.theme_category = shifted.theme_category;
    if (!merged.persona && shifted.persona) merged.persona = shifted.persona;
    const summary = typeof shifted.content_summary === 'string' ? shifted.content_summary.trim() : '';
    if (summary) merged.content_summary = [merged.content_summary, summary].filter(Boolean).join('；');
  }
  return merged;
}

export async function runUnifiedDeconstructBatch(params: {
  safeImgs: string[];
  modelsToTry: string[];
  targetBaseUrl: string;
  targetApiKey: string;
  apiFormat?: 'openai-responses';
  userHint: string;
  targetCategory?: string;
  customSubCategories?: SubCategoryDef[];
  albumName?: string;
  shardIndex?: number;
  shardTotal?: number;
  tracker?: VisionCallTracker;
  diagnostics?: VisionCallDiagnostics;
  operationId?: string;
  onProgress?: (stage: DeconstructProgress['stage'], message: string) => void;
}): Promise<{
  perImageResults: PerImageResult[];
  failedIndices: number[];
  parsedResult: Record<string, unknown>;
  usedModel: string;
} | null> {
  const {
    safeImgs,
    modelsToTry,
    targetBaseUrl,
    targetApiKey,
    apiFormat,
    userHint,
    targetCategory,
    customSubCategories,
    albumName,
    shardIndex,
    shardTotal,
    tracker,
    diagnostics,
    operationId,
    onProgress,
  } = params;

  const total = safeImgs.length;
  const promptText = buildUnifiedDeconstructPrompt({
    imageCount: total,
    userHint,
    targetCategory,
    customSubCategories,
  });

  const contentArray: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    { type: 'text', text: promptText },
  ];

  for (let i = 0; i < safeImgs.length; i++) {
    contentArray.push({
      type: 'image_url',
      image_url: { url: safeImgs[i] },
    });
  }

  const shardLabel =
    shardIndex !== undefined && shardTotal !== undefined
      ? `分片 ${shardIndex + 1}/${shardTotal} (${total}张)`
      : `单批 (${total}张)`;
  const label = buildAlbumLabel(albumName, `[Unified] ${shardLabel}`);

  const dynamicMaxTokens = Math.min(16384, Math.max(8192, total * 900 + 3000));
  const visionRes = await callVisionJson({
    modelsToTry,
    targetBaseUrl,
    targetApiKey,
    apiFormat,
    contentArray,
    label,
    maxTokens: dynamicMaxTokens,
    operationId: operationId ? `${operationId}:unified:${shardIndex ?? 0}` : undefined,
    tracker,
    diagnostics,
    onProgress,
  });

  if (!visionRes) return null;

  try {
    const { perImageResults, failedIndices, parsedResult } = parseUnifiedFromResponse(
      visionRes.rawJsonText,
      total
    );
    return {
      perImageResults,
      failedIndices,
      parsedResult,
      usedModel: visionRes.usedModel,
    };
  } catch (err: unknown) {
    console.warn(`[AssetDeconstruct] ${label} 解析失败:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function runUnifiedDeconstructSingleImage(params: {
  safeImgs: string[];
  modelsToTry: string[];
  targetBaseUrl: string;
  targetApiKey: string;
  apiFormat?: 'openai-responses';
  userHint: string;
  globalIndex: number;
  albumName?: string;
  tracker?: VisionCallTracker;
  diagnostics?: VisionCallDiagnostics;
  operationId?: string;
  onProgress?: (stage: DeconstructProgress['stage'], message: string) => void;
}): Promise<{ result: PerImageResult | null; usedModel: string }> {
  const {
    safeImgs,
    modelsToTry,
    targetBaseUrl,
    targetApiKey,
    apiFormat,
    userHint,
    globalIndex,
    albumName,
    tracker,
    diagnostics,
    operationId,
    onProgress,
  } = params;

  const url = safeImgs[0];
  if (!url) return { result: null, usedModel: '' };

  const promptText = buildPerImageReversePrompt({
    imageIndex: globalIndex,
    totalImages: 1,
    userHint,
  });
  const contentArray = [
    { type: 'text', text: promptText },
    { type: 'image_url', image_url: { url } },
  ];

  const label = buildAlbumLabel(albumName, `[PerImage-Retry] 图#${globalIndex}`);
  const visionRes = await callVisionJson({
    modelsToTry,
    targetBaseUrl,
    targetApiKey,
    apiFormat,
    contentArray,
    label,
    maxTokens: 4096,
    operationId: operationId ? `${operationId}:image:${globalIndex}` : undefined,
    tracker,
    diagnostics,
    onProgress,
  });

  if (!visionRes) return { result: null, usedModel: '' };

  try {
    const { perImageResults } = parseUnifiedFromResponse(visionRes.rawJsonText, 1);
    const item = perImageResults[0];
    if (item) {
      return {
        result: { ...item, image_index: globalIndex },
        usedModel: visionRes.usedModel,
      };
    }
  } catch (err: unknown) {
    console.warn(`[AssetDeconstruct] ${label} 补调解析失败:`, err instanceof Error ? err.message : String(err));
  }
  return { result: null, usedModel: visionRes.usedModel };
}

export async function runUnifiedDeconstruct(params: {
  safeImgs: string[];
  modelsToTry: string[];
  targetBaseUrl: string;
  targetApiKey: string;
  apiFormat?: 'openai-responses';
  userHint: string;
  targetCategory?: string;
  customSubCategories?: SubCategoryDef[];
  albumName?: string;
  tracker?: VisionCallTracker;
  diagnostics?: VisionCallDiagnostics;
  operationId?: string;
  onProgress?: (stage: DeconstructProgress['stage'], message: string) => void;
}): Promise<{
  perImageResults: PerImageResult[];
  failedIndices: number[];
  parsedResult: Record<string, unknown>;
  usedModel: string;
  pipelineMode: PipelineMode;
  shardCount: number;
} | null> {
  const { safeImgs, modelsToTry, targetBaseUrl, targetApiKey, apiFormat, userHint, targetCategory, customSubCategories, albumName, tracker, diagnostics, operationId, onProgress } =
    params;

  const shardSize = resolveUnifiedShardSize();
  const isSharded = shardSize < safeImgs.length;

  if (!isSharded) {
    const single = await runUnifiedDeconstructBatch({
      safeImgs,
      modelsToTry,
      targetBaseUrl,
      targetApiKey,
      apiFormat,
      userHint,
      targetCategory,
      customSubCategories,
      albumName,
      tracker,
      diagnostics,
      operationId,
      onProgress,
    });

    if (!single) return null;

    // A missing row may have been included in the already billed batch.
    // Preserve partial results and let the user decide whether to reprocess it.

    return {
      ...single,
      pipelineMode: 'single_vision_pass',
      shardCount: 1,
    };
  }

  // 分片反推逻辑
  const shards: string[][] = [];
  for (let i = 0; i < safeImgs.length; i += shardSize) {
    shards.push(safeImgs.slice(i, i + shardSize));
  }
  const shardTotal = shards.length;
  console.log(
    `[AssetDeconstruct] 启动分片反推: 总图片数=${safeImgs.length}，分片大小=${shardSize}，分片数=${shardTotal}`
  );

  const allResults: PerImageResult[] = [];
  let usedModel = '';
  let completedShards = 0;
  const batches = await mapWithConcurrency(shards, resolveUnifiedShardConcurrency(), async (shard, shardIndex) => {
    const batch = await runUnifiedDeconstructBatch({
      safeImgs: shard,
      modelsToTry,
      targetBaseUrl,
      targetApiKey,
      apiFormat,
      userHint,
      targetCategory,
      customSubCategories,
      albumName,
      shardIndex,
      shardTotal,
      tracker,
      diagnostics,
      operationId,
      onProgress: (stage, message) => {
        if (stage !== 'reconciling') onProgress?.(stage, `分片 ${shardIndex + 1}/${shardTotal}：${message}`);
      },
    });
    completedShards++;
    onProgress?.('analyzing', `已完成 ${completedShards}/${shardTotal} 个分片，正在分析剩余图片`);
    return batch;
  });

  const parsedShards: Array<{ parsedResult: Record<string, unknown>; offset: number }> = [];
  for (let shardIndex = 0; shardIndex < shardTotal; shardIndex++) {
    const batch = batches[shardIndex];
    if (!batch) continue;
    const offset = shardIndex * shardSize;
    usedModel = batch.usedModel || usedModel;
    for (const r of batch.perImageResults) {
      const localIdx = (r.image_index || 1) - 1;
      allResults.push({ ...r, image_index: offset + localIdx + 1 });
    }
    parsedShards.push({ parsedResult: batch.parsedResult, offset });
  }
  const mergedParsed = mergeUnifiedShardMetadata(parsedShards);

  allResults.sort((a, b) => a.image_index - b.image_index);
  const finalFailed = safeImgs
    .map((_, i) => i + 1)
    .filter((idx) => !allResults.some((r) => r.image_index === idx));

  if (allResults.length === 0) return null;

  return {
    perImageResults: allResults,
    failedIndices: finalFailed,
    parsedResult: mergedParsed,
    usedModel,
    pipelineMode: 'shard_vision_pass',
    shardCount: shardTotal,
  };
}
