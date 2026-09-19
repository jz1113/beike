import {
  buildPerImageReversePrompt,
  buildUnifiedDeconstructPrompt,
  resolveUnifiedShardSize,
  type PerImageResult,
} from '@beike/domain/assetDeconstruct/prompts';
import type { SubCategoryDef } from '@beike/domain/productCategory';
import { callVisionJson } from './visionCall';
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

export async function runUnifiedDeconstructBatch(params: {
  safeImgs: string[];
  modelsToTry: string[];
  targetBaseUrl: string;
  targetApiKey: string;
  userHint: string;
  targetCategory?: string;
  customSubCategories?: SubCategoryDef[];
  albumName?: string;
  shardIndex?: number;
  shardTotal?: number;
  tracker?: VisionCallTracker;
  diagnostics?: VisionCallDiagnostics;
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
    userHint,
    targetCategory,
    customSubCategories,
    albumName,
    shardIndex,
    shardTotal,
    tracker,
    diagnostics,
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
    contentArray,
    label,
    maxTokens: dynamicMaxTokens,
    tracker,
    diagnostics,
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
  userHint: string;
  globalIndex: number;
  albumName?: string;
  tracker?: VisionCallTracker;
  diagnostics?: VisionCallDiagnostics;
}): Promise<{ result: PerImageResult | null; usedModel: string }> {
  const {
    safeImgs,
    modelsToTry,
    targetBaseUrl,
    targetApiKey,
    userHint,
    globalIndex,
    albumName,
    tracker,
    diagnostics,
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
    contentArray,
    label,
    maxTokens: 4096,
    tracker,
    diagnostics,
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
  userHint: string;
  targetCategory?: string;
  customSubCategories?: SubCategoryDef[];
  albumName?: string;
  tracker?: VisionCallTracker;
  diagnostics?: VisionCallDiagnostics;
}): Promise<{
  perImageResults: PerImageResult[];
  failedIndices: number[];
  parsedResult: Record<string, unknown>;
  usedModel: string;
  pipelineMode: PipelineMode;
  shardCount: number;
} | null> {
  const { safeImgs, modelsToTry, targetBaseUrl, targetApiKey, userHint, targetCategory, customSubCategories, albumName, tracker, diagnostics } =
    params;

  const shardSize = resolveUnifiedShardSize(safeImgs.length);
  const isSharded = shardSize < safeImgs.length;

  if (!isSharded) {
    const single = await runUnifiedDeconstructBatch({
      safeImgs,
      modelsToTry,
      targetBaseUrl,
      targetApiKey,
      userHint,
      targetCategory,
      customSubCategories,
      albumName,
      tracker,
      diagnostics,
    });

    if (!single) return null;

    if (single.failedIndices.length > 0) {
      console.log(
        `[AssetDeconstruct] 单批反推完成，${single.failedIndices.length} 张需补调: [${single.failedIndices.join(', ')}]`
      );
      for (const failedIdx of single.failedIndices) {
        const url = safeImgs[failedIdx - 1];
        if (!url) continue;
        const retry = await runUnifiedDeconstructSingleImage({
          safeImgs: [url],
          modelsToTry,
          targetBaseUrl,
          targetApiKey,
          userHint,
          globalIndex: failedIdx,
          albumName,
          tracker,
          diagnostics,
        });
        if (retry.result) {
          single.perImageResults.push(retry.result);
          single.failedIndices = single.failedIndices.filter((idx) => idx !== failedIdx);
        }
      }
      single.perImageResults.sort((a, b) => a.image_index - b.image_index);
    }

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
  const failedIndices: number[] = [];
  let mergedParsed: Record<string, unknown> = {};
  let usedModel = '';

  for (let shardIndex = 0; shardIndex < shardTotal; shardIndex++) {
    const shard = shards[shardIndex];
    const offset = shardIndex * shardSize;

    const batch = await runUnifiedDeconstructBatch({
      safeImgs: shard,
      modelsToTry,
      targetBaseUrl,
      targetApiKey,
      userHint,
      targetCategory,
      customSubCategories,
      albumName,
      shardIndex,
      shardTotal,
      tracker,
      diagnostics,
    });

    if (!batch) {
      for (let i = 0; i < shard.length; i++) {
        failedIndices.push(offset + i + 1);
      }
      continue;
    }

    usedModel = batch.usedModel || usedModel;
    for (const r of batch.perImageResults) {
      const localIdx = (r.image_index || 1) - 1;
      allResults.push({ ...r, image_index: offset + localIdx + 1 });
    }
    mergedParsed = { ...mergedParsed, ...batch.parsedResult };
    for (const localFailed of batch.failedIndices) {
      failedIndices.push(offset + localFailed);
    }
  }

  const succeeded = new Set(allResults.map((r) => r.image_index));
  const uniqueFailed = [...new Set(failedIndices)].filter((idx) => !succeeded.has(idx));

  for (const globalIdx of uniqueFailed) {
    const url = safeImgs[globalIdx - 1];
    if (!url) continue;
    const retry = await runUnifiedDeconstructSingleImage({
      safeImgs: [url],
      modelsToTry,
      targetBaseUrl,
      targetApiKey,
      userHint,
      globalIndex: globalIdx,
      albumName,
      tracker,
      diagnostics,
    });
    if (retry.result) {
      allResults.push(retry.result);
      usedModel = retry.usedModel || usedModel;
    }
  }

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
