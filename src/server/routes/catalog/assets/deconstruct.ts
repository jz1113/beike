import { jsonResponse } from '../../../core/http';
import { readJsonBody } from '../../../core/validate';
import { buildPass1VisionModelsToTry, filterVisionCapableModels } from '@shared/domain/prompts/vision';
import { GatewayBaseUrlError, resolveGatewayCreds } from '@shared/domain/models/gatewayCreds';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import {
  normalizeGatewayBaseUrl,
  getDefaultBaseUrl,
  getDefaultApiKey,
} from '../../../services/models/gatewayCredentials';
import {
  MAX_IMAGES_PER_SET,
  MIN_IMAGES_PER_SET,
  type PerImageResult,
} from '@shared/domain/assets/assetDeconstruct/prompts';
import type { SubCategoryDef } from '@shared/domain/products/productCategory';
import { reconcileAssetsFromPerImage } from '@shared/domain/assets/assetDeconstruct/validate';

// 解构子系统
import { createVisionCallDiagnostics, createVisionCallTracker, buildDeconstructFailureResponse } from '../../../services/deconstruct/diagnostics';
import { convertImagesInBatches } from '../../../services/deconstruct/visionCall';
import { runUnifiedDeconstruct, resolveEnablePass2, type PipelineMode } from '../../../services/deconstruct/unified';
import { persistDeconstructedAssets, type SavedRecords } from '../../../repositories/deconstructAssets';
import { xhsSourceKey } from '@shared/domain/collection/xhsSource';
import { AppError, errorResponse } from '../../../core/errors';
import { claimProcessingSource, releaseIncompleteSource } from '@server/repositories/importSources';
import { getDeconstructProgress, updateDeconstructProgress } from '../../../services/deconstruct/progress';
import { requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';
import { createHash } from 'node:crypto';
import { deconstructReviews } from '@server/repositories/catalog';

const activeDeconstructRequests = new Map<string, Promise<Response>>();

export function GET_PROGRESS(req: Request) {
  const taskId = new URL(req.url).searchParams.get('clientTaskId') || '';
  if (!taskId || taskId.length > 160) return jsonResponse({ error: '缺少有效的任务 ID' }, 400);
  return jsonResponse({ success: true, progress: getDeconstructProgress(taskId) });
}

// 向后兼容导出（供单元测试与其他调用方使用）
export {
  sanitizeJsonControlChars,
  repairSingleObjectJson,
  repairAndParseDeconstructJson,
  parseUnifiedFromResponse,
} from '../../../services/deconstruct/jsonHealer';
export {
  createVisionCallDiagnostics,
  noteModelAttempt,
  finalizeVisionDiagnostics,
  buildDeconstructFailureResponse,
  createVisionCallTracker,
  noteVisionCall,
  type VisionCallDiagnostics,
  type VisionCallTracker,
} from '../../../services/deconstruct/diagnostics';
export {
  resolveDeconstructConcurrency,
  resolveMaxInflight,
  noteRateLimitHit,
  noteRateLimitSuccess,
  getEffectiveConcurrency,
  parseRetryAfterMs,
  backoffWithJitter,
  sleep,
  isRateLimitResponse,
  isQuotaExhausted,
  RATE_LIMIT_BACKOFF_MS,
  MAX_NETWORK_ATTEMPTS,
} from '../../../services/deconstruct/concurrency';

export async function POST(req: Request) {
  let body: Record<string, any>;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    return errorResponse(error);
  }
  const clientTaskId = typeof body.clientTaskId === 'string' && body.clientTaskId.length <= 160
    ? body.clientTaskId
    : '';
  if (!clientTaskId) return processDeconstructRequest(req, body);
  const key = `${requireWorkspaceId()}:${clientTaskId}`;
  const existing = activeDeconstructRequests.get(key);
  if (existing) return (await existing).clone();
  const pending = processDeconstructRequest(req, body);
  activeDeconstructRequests.set(key, pending);
  try {
    return (await pending).clone();
  } finally {
    activeDeconstructRequests.delete(key);
  }
}

async function processDeconstructRequest(req: Request, body: Record<string, any>) {
  let claimedKey: string | undefined;
  let claimedRequestId: string | undefined;
  let progressId: string | undefined;
  let completed = false;
  try {
    const {
      imageUrls = [],
      userHint = '',
      targetCategory: bodyTargetCategory,
      category: bodyCategory,
      model,
      fallbackOrder: fallbackModels,
      customBaseUrl,
      customApiKey,
      apiFormat,
      allowInsecureHttp,
      autoSave = true,
      reviewBeforeSave = false,
      fullPromptOnly = false,
      parentFullPromptId,
      albumName: bodyAlbumName,
      productTitle,
      sourceUrl,
      reviewRequestId,
      clientTaskId,
    } = body;
    progressId = typeof clientTaskId === 'string' && clientTaskId.length <= 160 ? clientTaskId : undefined;

    const targetCategory =
      (typeof bodyTargetCategory === 'string' && bodyTargetCategory.trim()) ||
      (typeof bodyCategory === 'string' && bodyCategory.trim()) ||
      undefined;

    const customSubCategories = Array.isArray(body.customSubCategories)
      ? (body.customSubCategories as SubCategoryDef[])
      : undefined;

    const albumName =
      (typeof bodyAlbumName === 'string' && bodyAlbumName.trim()) ||
      (typeof productTitle === 'string' && productTitle.trim()) ||
      (userHint ? userHint.slice(0, 40) : '') ||
      '导入图集';

    const { baseUrl: rawBaseUrl, apiKey: targetApiKey } = resolveGatewayCreds(
      req,
      { model, customBaseUrl, customApiKey, apiFormat, allowInsecureHttp },
      { baseUrl: getDefaultBaseUrl(), apiKey: getDefaultApiKey() }
    );
    const targetBaseUrl = normalizeGatewayBaseUrl(rawBaseUrl) || normalizeGatewayBaseUrl(getDefaultBaseUrl());

    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      return jsonResponse({ error: '请至少提供 1 张参考风格或买家秀图片' }, 400);
    }
    if (fullPromptOnly && (imageUrls.length !== 4 || !reviewBeforeSave)) {
      return jsonResponse({ error: '衍生母本须由完整四图组先提炼候选，再确认入库' }, 400);
    }
    if (imageUrls.length > 1 && imageUrls.length < 4) {
      return jsonResponse({ error: '图组母本必须恰好 4 张；当前不足 4 张，不会反推或入库', code: 'INCOMPLETE_CONTENT_GROUP' }, 400);
    }
    const reviewId = reviewBeforeSave
      ? `review_${createHash('sha256').update(JSON.stringify([requireWorkspaceId(), imageUrls, Boolean(fullPromptOnly)])).digest('hex').slice(0, 40)}`
      : '';
    if (reviewId) {
      const existing = (await deconstructReviews.getById(reviewId))[0];
      if (existing) {
        const payload = JSON.parse(existing.payload);
        return jsonResponse({ success: true, data: payload.parsedResult, previewShots: payload.perImageResults, reviewId, reviewStatus: existing.status, reused: true });
      }
    }

    const sourceKey = typeof sourceUrl === 'string' ? xhsSourceKey(sourceUrl) : null;
    if (sourceKey) {
      claimedKey = sourceKey;
      claimedRequestId = typeof reviewRequestId === 'string' && reviewRequestId ? reviewRequestId : crypto.randomUUID();
      await claimProcessingSource(sourceKey, claimedRequestId, albumName);
    }

    if (!targetApiKey) {
      return jsonResponse({ error: '系统尚未配置 AI 视觉接口密钥，请在设置中填入' }, 400);
    }

    const primaryModel = typeof model === 'string' ? model : undefined;
    const fallbackList = Array.isArray(fallbackModels) ? fallbackModels : undefined;
    // The gateway policy decides whether a fallback is safe. The full configured
    // chain is retained only for an explicit “model unavailable” response.
    const pass1Models = filterVisionCapableModels(
      apiFormat === 'openai-responses' && primaryModel ? [primaryModel] : buildPass1VisionModelsToTry(primaryModel, fallbackList)
    );
    if (pass1Models.length === 0) {
      return jsonResponse({ error: '请先在设置中配置支持图像输入的多模态模型' }, 400);
    }

    const visionTracker = createVisionCallTracker();
    const visionDiagnostics = createVisionCallDiagnostics('unified');
    const pipelineStart = Date.now();
    const selectedCount = imageUrls.length === 1 ? 1 : Math.floor(Math.min(imageUrls.length, MAX_IMAGES_PER_SET) / 4) * 4;
    const skippedCount = imageUrls.length - selectedCount;
    updateDeconstructProgress(progressId, 'preparing', `正在准备 ${selectedCount} 张图片${skippedCount ? `，不足四张的 ${skippedCount} 张跳过` : ''}`);

    console.log(
      `[AssetDeconstruct]${albumName ? ` 套组「${albumName}」` : ''} 收到图集反推请求: 总图片数=${imageUrls.length}，模型链=${pass1Models.join(' → ')}，网关=${targetBaseUrl}`
    );

    const convertStart = Date.now();
    const targetImgs = imageUrls.slice(0, selectedCount);
    const safeImgs: string[] = [];
    const processedImageUrls: string[] = [];
    for (let start = 0; start < targetImgs.length; start += 4) {
      const groupUrls = targetImgs.slice(start, start + 4);
      const converted = await convertImagesInBatches(groupUrls);
      if (converted.length === groupUrls.length) {
        safeImgs.push(...converted);
        processedImageUrls.push(...groupUrls);
      } else {
        console.warn(`[AssetDeconstruct] 图组 ${start / 4 + 1} 下载不完整，整组跳过（${converted.length}/4）`);
      }
    }
    updateDeconstructProgress(progressId, 'queued', `图片准备完成 ${safeImgs.length}/${targetImgs.length}，等待视觉模型`);
    const isSingleImage = safeImgs.length === 1;
    console.log(`[AssetDeconstruct] 图片预处理耗时 ${Date.now() - convertStart}ms (有效成功: ${safeImgs.length}/${targetImgs.length})`);

    if (safeImgs.length === 0) {
      console.warn(`[AssetDeconstruct] 所有 ${targetImgs.length} 张图片预处理均未成功获取有效数据`);
      if (claimedKey && claimedRequestId) await releaseIncompleteSource(claimedKey, claimedRequestId);
      return jsonResponse(
        {
          error: '原贴图片下载受限或已失效，请检查原贴链接或重试',
          code: 'IMAGE_DOWNLOAD_FAILED',
        },
        400
      );
    }

    let parsedResult: Record<string, unknown> = {};
    let usedModel = '';
    let pipelineMode: PipelineMode = 'single_vision_pass';
    let perImageResults: PerImageResult[] = [];
    let pass1Stats = { total: safeImgs.length, succeeded: 0, failed: 0, failedIndices: [] as number[] };
    let reconcileStats = {
      actionsBeforeDedup: 0,
      actionsAfterDedup: 0,
      scenesBeforeDedup: 0,
      scenesAfterDedup: 0,
    };
    let pass2Skipped = true;
    let shardCount = 1;
    let discardedFailedGroupImages = 0;

    // 主路径：多模态全维反推
    const unifiedStart = Date.now();
    const unified = await runUnifiedDeconstruct({
      safeImgs,
      modelsToTry: pass1Models,
      targetBaseUrl,
      targetApiKey,
      apiFormat: apiFormat === 'openai-responses' ? 'openai-responses' : undefined,
      userHint,
      targetCategory,
      customSubCategories,
      albumName,
      tracker: visionTracker,
      diagnostics: visionDiagnostics,
      operationId: typeof clientTaskId === 'string' ? clientTaskId : undefined,
      onProgress: (stage, message) => updateDeconstructProgress(progressId, stage, message),
    });
    updateDeconstructProgress(progressId, 'reconciling', '正在整理反推结果');
    console.log(`[AssetDeconstruct] Unified 阶段耗时 ${Date.now() - unifiedStart}ms`);

    const unifiedFailed =
      !unified || !unified.parsedResult || Object.keys(unified.parsedResult).length === 0 || unified.perImageResults.length === 0;

    if (unifiedFailed && visionDiagnostics.gatewayUnreachable) {
      visionDiagnostics.pipelineStage = 'unified';
      console.warn('[AssetDeconstruct] 网关不可达，跳过逐图补调');
      return buildDeconstructFailureResponse(visionDiagnostics);
    }

    if (unified) {
      perImageResults = unified.perImageResults;
      if (!isSingleImage) {
        const available = new Set(perImageResults.map((image) => image.image_index));
        const complete = new Set<number>();
        for (let first = 1; first <= safeImgs.length; first += 4) {
          if ([first, first + 1, first + 2, first + 3].every((index) => available.has(index))) {
            for (let index = first; index < first + 4; index++) complete.add(index);
          }
        }
        discardedFailedGroupImages = perImageResults.length - complete.size;
        perImageResults = perImageResults.filter((image) => complete.has(image.image_index));
      }
      pipelineMode = unified.pipelineMode;
      shardCount = unified.shardCount;
      pass1Stats = {
        total: safeImgs.length,
        succeeded: unified.perImageResults.length,
        failed: unified.failedIndices.length,
        failedIndices: unified.failedIndices,
      };
      usedModel = unified.usedModel;

      const enablePass2 = resolveEnablePass2();
      if (enablePass2 && perImageResults.length >= MIN_IMAGES_PER_SET) {
        pass2Skipped = false;
        const reconciled = reconcileAssetsFromPerImage(unified.parsedResult, perImageResults);
        parsedResult = reconciled.result;
        reconcileStats = reconciled.stats;
        console.log(
          `[AssetDeconstruct] Unified + 代码聚合: ${perImageResults.length}/${safeImgs.length} 张 → reconcile ${reconcileStats.scenesAfterDedup} 场景 / ${reconcileStats.actionsAfterDedup} 姿态`
        );
      } else {
        const reconciled = reconcileAssetsFromPerImage(unified.parsedResult, perImageResults);
        parsedResult = reconciled.result;
        reconcileStats = reconciled.stats;
        console.log(
          `[AssetDeconstruct] 单次多模态成功: ${perImageResults.length}/${safeImgs.length} 张 → reconcile ${reconcileStats.scenesAfterDedup} 场景 / ${reconcileStats.actionsAfterDedup} 姿态`
        );
      }
    }

    if (!parsedResult || Object.keys(parsedResult).length === 0 || perImageResults.length === 0) {
      console.warn('[AssetDeconstruct] Unified 全量反推未产出有效结果，直接返回失败（已按策略禁用逐图兜底）');
      visionDiagnostics.pipelineStage = 'unified_failed';
      return buildDeconstructFailureResponse(visionDiagnostics);
    }

    if (!isSingleImage) {
      const declared = Array.isArray(parsedResult.content_groups) ? parsedResult.content_groups as Array<Record<string, unknown>> : [];
      const valid = new Set(perImageResults.map((image) => image.image_index));
      parsedResult.content_groups = Array.from({ length: safeImgs.length / 4 }, (_, group) => {
        const indices = [group * 4 + 1, group * 4 + 2, group * 4 + 3, group * 4 + 4];
        if (!indices.every((index) => valid.has(index))) return null;
        const matching = declared.find((entry) => JSON.stringify(entry.source_image_indices) === JSON.stringify(indices));
        return matching || { source_image_indices: indices, title: `${albumName} · 图组 ${group + 1}` };
      }).filter(Boolean);
    }

    const partial = pass1Stats.failed > 0 || discardedFailedGroupImages > 0;

    let savedRecords: SavedRecords = {
      scenes: [],
      outfits: [],
      actions: [],
      fullPrompts: [],
    };

    if (autoSave && !reviewBeforeSave && parsedResult) {
      updateDeconstructProgress(progressId, 'saving', '正在保存提示词资产');
      const dbSaveStart = Date.now();
      const category = (parsedResult.theme_category as string) || 'general';
      savedRecords = await persistDeconstructedAssets({
        parsedResult,
        perImageResults,
        imageUrls: processedImageUrls,
        albumName,
        isSingleImage,
        category,
        sourceKey: claimedKey,
      });
      console.log(`[AssetDeconstruct] 入库耗时 ${Date.now() - dbSaveStart}ms`);
    }
    if (reviewBeforeSave) {
      if (fullPromptOnly && (safeImgs.length !== 4 || perImageResults.length !== 4 || !Array.isArray(parsedResult.content_groups) || parsedResult.content_groups.length !== 1)) {
        return jsonResponse({ error: '四张成图未能提炼为完整母本，本次未入库，请检查后重试' }, 422);
      }
      await deconstructReviews.createPending(reviewId, albumName, {
        parsedResult, perImageResults, imageUrls: processedImageUrls, albumName,
        isSingleImage, category: (parsedResult.theme_category as string) || 'general',
        sourceKey: claimedKey, fullPromptOnly: Boolean(fullPromptOnly),
        provenance: fullPromptOnly ? 'workshop_generated' : 'deconstructed',
        parentFullPromptId: typeof parentFullPromptId === 'string' ? parentFullPromptId.slice(0, 160) : null,
      });
    }

    console.log(
      `[AssetDeconstruct]${albumName ? ` 套组「${albumName}」` : ''} 管线总耗时 ${Date.now() - pipelineStart}ms，多模调用 ${visionTracker.callCount} 次（分片 ${shardCount}），模型=${visionTracker.modelsUsed.join(' → ') || usedModel}`
    );

    updateDeconstructProgress(progressId, 'completed', '反推完成');
    completed = true;
    return jsonResponse({
      success: true,
      partial: partial || skippedCount > 0 || safeImgs.length < targetImgs.length,
      usedModel,
      pipelineMode,
      data: parsedResult,
      ...(reviewId ? { previewShots: perImageResults } : {}),
      savedRecords,
      ...(reviewId ? { reviewId, reviewStatus: 'pending' } : {}),
      stats: {
        imageCount: safeImgs.length,
        skippedIncompleteImages: skippedCount + targetImgs.length - perImageResults.length,
        pass1Succeeded: pass1Stats.succeeded,
        pass1Failed: pass1Stats.failed,
        pass1FailedIndices: pass1Stats.failedIndices,
        perImageCount: perImageResults.length,
        pass2Skipped,
        pipelineMode,
        shardCount,
        visionCallCount: visionTracker.callCount,
        visionModelsUsed: visionTracker.modelsUsed,
        scenesCount: savedRecords.scenes.length,
        outfitsCount: savedRecords.outfits.length,
        actionsCount: savedRecords.actions.length,
        fullPromptsCount: savedRecords.fullPrompts.length,
        scenesBeforeDedup: reconcileStats.scenesBeforeDedup,
        scenesAfterDedup: reconcileStats.scenesAfterDedup,
        actionsBeforeDedup: reconcileStats.actionsBeforeDedup,
        actionsAfterDedup: reconcileStats.actionsAfterDedup,
      },
    });
  } catch (error: unknown) {
    if (claimedKey && claimedRequestId) await releaseIncompleteSource(claimedKey, claimedRequestId).catch(() => {});
    if (error instanceof AppError || error instanceof GatewayBaseUrlError) return errorResponse(error);
    console.error('[AssetDeconstruct] 异常:', error);
    return jsonResponse({ error: formatUserError(error) }, 500);
  } finally {
    if (!completed) updateDeconstructProgress(progressId, 'failed', '反推未完成，请查看任务错误信息');
  }
}
