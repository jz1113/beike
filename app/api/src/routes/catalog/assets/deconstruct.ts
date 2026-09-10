import { jsonResponse } from '../../../core/http';
import { buildPass1VisionModelsToTry, filterVisionCapableModels } from '@beike/shared/vision';
import { resolveGatewayCreds } from '@beike/shared/gatewayCreds';
import { formatUserError } from '@beike/shared/upstreamErrors';
import {
  normalizeGatewayBaseUrl,
  getDefaultBaseUrl,
  getDefaultApiKey,
} from '../../../services/imageHelpers';
import {
  MAX_IMAGES_PER_SET,
  MIN_IMAGES_PER_SET,
  type PerImageResult,
} from '@beike/shared/assetDeconstruct/prompts';
import type { SubCategoryDef } from '@beike/shared/productCategoryHelpers';
import { reconcileAssetsFromPerImage } from '@beike/shared/assetDeconstruct/validate';

// 导入解构子系统
// 导入解构子系统
import { createVisionCallDiagnostics, createVisionCallTracker, buildDeconstructFailureResponse } from './deconstruct/diagnostics';
import { convertImagesInBatches } from './deconstruct/visionCall';
import { runUnifiedDeconstruct, resolveEnablePass2, type PipelineMode } from './deconstruct/unified';
import { persistDeconstructedAssets, type SavedRecords } from './deconstruct/saveAssets';

// 向后兼容导出（供单元测试与其他调用方使用）
export {
  sanitizeJsonControlChars,
  repairSingleObjectJson,
  repairAndParseDeconstructJson,
  parseUnifiedFromResponse,
} from './deconstruct/jsonHealer';
export {
  createVisionCallDiagnostics,
  noteModelAttempt,
  finalizeVisionDiagnostics,
  buildDeconstructFailureResponse,
  createVisionCallTracker,
  noteVisionCall,
  type VisionCallDiagnostics,
  type VisionCallTracker,
} from './deconstruct/diagnostics';
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
  RATE_LIMIT_BACKOFF_MS,
  MAX_NETWORK_ATTEMPTS,
} from './deconstruct/concurrency';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      imageUrls = [],
      userHint = '',
      targetCategory: bodyTargetCategory,
      category: bodyCategory,
      model,
      fallbackModels = [],
      customBaseUrl,
      customApiKey,
      autoSave = true,
      albumName: bodyAlbumName,
      productTitle,
    } = body;

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
      { customBaseUrl, customApiKey },
      { baseUrl: getDefaultBaseUrl(), apiKey: getDefaultApiKey() }
    );
    const targetBaseUrl = normalizeGatewayBaseUrl(rawBaseUrl) || normalizeGatewayBaseUrl(getDefaultBaseUrl());

    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      return jsonResponse({ error: '请至少提供 1 张参考风格或买家秀图片' }, 400);
    }

    if (!targetApiKey) {
      return jsonResponse({ error: '系统尚未配置 AI 视觉接口密钥，请在设置中填入' }, 500);
    }

    const fallbackList = Array.isArray(fallbackModels) ? fallbackModels : [];
    const primaryModel = typeof model === 'string' ? model : undefined;
    const pass1Models = filterVisionCapableModels(
      buildPass1VisionModelsToTry(primaryModel, fallbackList)
    );
    if (pass1Models.length === 0) {
      return jsonResponse({ error: '请先在设置中配置支持图像输入的多模态模型' }, 400);
    }

    const visionTracker = createVisionCallTracker();
    const visionDiagnostics = createVisionCallDiagnostics('unified');
    const pipelineStart = Date.now();

    console.log(
      `[AssetDeconstruct]${albumName ? ` 套组「${albumName}」` : ''} 收到图集反推请求: 总图片数=${imageUrls.length}，模型链=${pass1Models.join(' → ')}，网关=${targetBaseUrl}`
    );

    const convertStart = Date.now();
    const targetImgs = imageUrls.slice(0, MAX_IMAGES_PER_SET);
    const safeImgs = await convertImagesInBatches(targetImgs);
    const isSingleImage = safeImgs.length === 1;
    console.log(`[AssetDeconstruct] 图片预处理耗时 ${Date.now() - convertStart}ms (有效成功: ${safeImgs.length}/${targetImgs.length})`);

    if (safeImgs.length === 0) {
      console.warn(`[AssetDeconstruct] 所有 ${targetImgs.length} 张图片预处理均未成功获取有效数据`);
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

    // 主路径：多模态全维反推
    const unifiedStart = Date.now();
    const unified = await runUnifiedDeconstruct({
      safeImgs,
      modelsToTry: pass1Models,
      targetBaseUrl,
      targetApiKey,
      userHint,
      targetCategory,
      customSubCategories,
      albumName,
      tracker: visionTracker,
      diagnostics: visionDiagnostics,
    });
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
      pipelineMode = unified.pipelineMode;
      shardCount = unified.shardCount;
      pass1Stats = {
        total: safeImgs.length,
        succeeded: perImageResults.length,
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

    const partial = pass1Stats.failed > 0 || pass2Skipped;

    let savedRecords: SavedRecords = {
      scenes: [],
      outfits: [],
      actions: [],
      fullPrompts: [],
    };

    if (autoSave && parsedResult) {
      const dbSaveStart = Date.now();
      const category = (parsedResult.theme_category as string) || 'general';
      savedRecords = await persistDeconstructedAssets({
        parsedResult,
        perImageResults,
        imageUrls,
        albumName,
        isSingleImage,
        category,
      });
      console.log(`[AssetDeconstruct] 入库耗时 ${Date.now() - dbSaveStart}ms`);
    }

    console.log(
      `[AssetDeconstruct]${albumName ? ` 套组「${albumName}」` : ''} 管线总耗时 ${Date.now() - pipelineStart}ms，多模调用 ${visionTracker.callCount} 次（分片 ${shardCount}），模型=${visionTracker.modelsUsed.join(' → ') || usedModel}`
    );

    return jsonResponse({
      success: true,
      partial,
      usedModel,
      pipelineMode,
      data: parsedResult,
      savedRecords,
      stats: {
        imageCount: safeImgs.length,
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
  } catch (error: any) {
    console.error('[AssetDeconstruct] 异常:', error);
    return jsonResponse({ error: formatUserError(error) }, 500);
  }
}
