import { guardSubmission } from '../../services/submissionGuard';
import { jsonResponse } from '../../core/http';
import { AppError, errorResponse } from '../../core/errors';
import { DEFAULT_IMAGE_MODEL_ID, isApprovedModel } from '@beike/domain/modelCatalog';
import { buildImageRequest } from '@beike/domain/modelAdapters';
import { setPresignedUrlSigner } from '@beike/domain/modelAdapters/image/adapters';
import { getPresignedStorageUrl } from '@beike/server-kit/storage';
import { normalizeOpenAiImageRequest } from '@beike/domain/modelAdapters/image/normalizeOpenAiImageModel';
import { logLatencyAudit } from '@beike/domain/latencyAudit';
import { humanizeUpstreamError, formatUserError } from '@beike/domain/upstreamErrors';
import {
  resolveCredentials,
  buildImageSubmitCandidates,
} from '../../services/gatewayCredentials';
import { executeImagePoll, ensurePersistableResultUrl } from './image/poll';
import { resolveImageSlotsAndPrompt } from './image/slotResolver';
import { dispatchSubmitCandidates, persistImageTaskRecord } from './image/submit';

setPresignedUrlSigner(getPresignedStorageUrl);

export { executeImagePoll } from './image/poll';
export { resolveImageSlotsAndPrompt } from './image/slotResolver';
export { dispatchSubmitCandidates, persistImageTaskRecord } from './image/submit';

async function submit(req: Request) {
  const t0 = Date.now();
  let convertMs = 0;
  let gatewayMs = 0;
  let dbMs = 0;
  let payloadBytes = 0;
  let imageCount = 0;
  let convertCacheHits = 0;
  let body: any;
  let rawBodyText = '';
  try {
    rawBodyText = await req.text();
    body = JSON.parse(rawBodyText);
  } catch (parseErr: any) {
    console.warn('[AI生图] 请求体解析异常:', parseErr?.message, 'body length:', rawBodyText.length);
    const tooLarge =
      rawBodyText.length >= 8_000_000 ||
      /Unterminated string|Unexpected end|position\s+\d{7,}/i.test(String(parseErr?.message || ''));
    const tip = tooLarge
      ? '参考图体积过大，请求在传输中被截断。请压缩垫图后重试，或减少同时传入的参考图数量。'
      : `请求数据格式异常或体积过大 (${parseErr?.message || ''})`;
    return jsonResponse({ success: false, error: tip }, 400);
  }

  try {
    const parseMs = Date.now() - t0;
    const {
      prompt,
      model = DEFAULT_IMAGE_MODEL_ID,
      size,
      aspectRatio,
      quality,
      productId,
      useReferenceImage = false,
      source,
    } = body;

    const finalSize = size || aspectRatio || '2448x3264';
    const effectiveAspect =
      aspectRatio ||
      (typeof finalSize === 'string' && !/^\d+\s*x\s*\d+$/i.test(finalSize.trim())
        ? finalSize
        : '3:4');
    const effectiveQuality = quality ?? (source === 'hub' ? 'medium' : 'high');
    const aspectHint =
      effectiveAspect ||
      (typeof finalSize === 'string' && !/^\d+\s*x\s*\d+$/i.test(finalSize.trim())
        ? finalSize
        : undefined);

    if (typeof prompt !== "string" || !prompt.trim()) {
      return jsonResponse({ success: false, error: '提示词不能为空' }, 400);
    }
    if (!isApprovedModel(String(model), 'image')) {
      return jsonResponse({ success: false, error: `模型 ${model} 不在当前生图白名单中` }, 400);
    }

    const { baseUrl, apiKey } = resolveCredentials(req, body);
    try {
      const host = new URL(baseUrl).hostname.toLowerCase();
      if (model === 'openai/gpt-image-2' && (host === 'comfly.org' || host.endsWith('.comfly.org'))) {
        throw new AppError('模型与接口不匹配：openai/gpt-image-2 不能使用 Comfly 地址', 400);
      }
      if (model === 'gpt-image-2' && (host === 'api.gapnet.ai' || host.endsWith('.gapnet.ai'))) {
        throw new AppError('模型与接口不匹配：gpt-image-2 请使用 Comfly，Gapnet 请使用 openai/gpt-image-2', 400);
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
    }
    if (!apiKey) {
      return jsonResponse(
        {
          success: false,
          error:
            '未配置 AI 绘图接口密钥 (API Key)。请前往「⚙️ 设置 -> 服务接口配置」中填入您的 Comfly API 凭证后使用。',
          missingConfig: 'apiKey',
        },
        400
      );
    }

    const slotResolution = await resolveImageSlotsAndPrompt(body);

    convertMs = slotResolution.convertMs;
    imageCount = slotResolution.imageCount;
    convertCacheHits = slotResolution.convertCacheHits;

    if (slotResolution.error) {
      return jsonResponse({ success: false, error: slotResolution.error }, 400);
    }

    const normalized = normalizeOpenAiImageRequest(
      model,
      finalSize,
      effectiveQuality,
      aspectHint
    );

    const adapted = buildImageRequest({
      model,
      prompt: slotResolution.cleanedPrompt,
      size: normalized.size,
      quality: effectiveQuality,
      hasHuman: slotResolution.isHumanShot,
      shotType: body.shot_type || body.shotType,
      primaryImage: slotResolution.primaryImgUrl,
      productImage: slotResolution.targetProductUrl || undefined,
      faceImage: slotResolution.faceForSlots,
      sceneImage: slotResolution.cleanSceneAnchorUrl || undefined,
      images: slotResolution.multiImages,
      preferEdits:
        Boolean(useReferenceImage && slotResolution.primaryImgUrl) ||
        slotResolution.multiImages.length > 0,
      plainMode: slotResolution.isPlainMode,
    });

    const genPayload = adapted.payload;
    const submitCandidates = adapted.family === 'qwen-edit' ? adapted.endpoints(baseUrl).submit : buildImageSubmitCandidates(
      adapted.endpoints(baseUrl).submit,
      adapted.useEdits,
      baseUrl
    );
    const payloadJson = JSON.stringify(genPayload);

    console.log(
      `[AI生图-提交] 请求模型=${model}, 提交模型=${adapted.modelId}, 尺寸=${genPayload.size || normalized.size}, 图数=${slotResolution.editsImageUrls.length}, 提示词长度=${String(genPayload.prompt || '').length}`
    );

    const submitResult = await dispatchSubmitCandidates({
      submitCandidates,
      adapted,
      apiKey,
      payloadJson,
      editsImageUrls: slotResolution.editsImageUrls,
      identityLockedSlots: slotResolution.identityLockedSlots,
      baseUrl,
      model,
      parseMs,
      convertMs,
      imageCount,
      convertCacheHits,
      t0,
    });

    gatewayMs = submitResult.gatewayMs;
    payloadBytes = submitResult.payloadBytes;
    let directResultUrl = submitResult.directResultUrl;

    if (directResultUrl) {
      directResultUrl = await ensurePersistableResultUrl(directResultUrl, req);
    }

    if (!submitResult.genRes.ok || (!submitResult.taskId && !directResultUrl)) {
      const errorMsg =
        submitResult.genData.message ||
        submitResult.genData.error?.message ||
        submitResult.genData.fail_reason ||
        `HTTP ${submitResult.genRes.status} 提交失败`;
      console.error(`[AI生图-失败] 绘图模型接口返回错误:`, submitResult.genData);
      throw new Error(humanizeUpstreamError(errorMsg));
    }

    const finalTaskId = submitResult.taskId || `direct_${Date.now()}`;
    console.log(
      `[AI生图-成功] 成功分派绘图任务: taskId=${finalTaskId}, 模型=${adapted.modelId}, 直出图=${directResultUrl ? '是' : '否'}`
    );

    let recordId: string | undefined;
    try {
      const dbRes = await persistImageTaskRecord({
        productId,
        prompt: String(genPayload.prompt || slotResolution.cleanedPrompt),
        finalTaskId,
        model: adapted.modelId || normalized.modelId || 'gpt-image-2',
        size: String(genPayload.size || finalSize || '2448x3264'),
        quality: effectiveQuality || String(genPayload.quality || 'medium'),
        directResultUrl,
      });
      recordId = dbRes.recordId;
      dbMs = dbRes.dbMs;
    } catch (dbErr: any) {
      console.error(`[AI生图-入库] 数据库记录失败: ${dbErr.message}`);
      return jsonResponse(
        {
          success: false,
          error: `任务持久化失败: ${dbErr.message}`,
          taskId: finalTaskId,
        },
        500
      );
    }

    const totalMs = Date.now() - t0;
    const timing = {
      parseMs,
      convertMs,
      gatewayMs,
      dbMs,
      totalMs,
      payloadKB: Math.round(payloadBytes / 1024),
      imageCount,
      convertCacheHits,
    };

    logLatencyAudit({
      hypothesisId: 'H1',
      location: 'generate-image/route.ts:POST-ok',
      message: 'image submit timing',
      data: {
        model: adapted.modelId,
        family: adapted.family,
        useEdits: adapted.useEdits,
        usedSubmitUrl: submitResult.usedSubmitUrl,
        submitMode: submitResult.submitMode,
        endpointAttempts: submitResult.endpointAttempts,
        httpStatus: submitResult.genRes.status,
        ...timing,
        anomaly:
          convertMs > 8000 ||
          gatewayMs > 30000 ||
          payloadBytes > 2_500_000 ||
          submitResult.endpointAttempts > 1,
      },
    });

    const responseData = {
      success: true,
      taskId: finalTaskId,
      recordId,
      model: adapted.modelId,
      requestedModel: model,
      size: genPayload.size || finalSize,
      family: adapted.family,
      usedEndpoint: submitResult.usedEndpoint,
      status: directResultUrl ? 'SUCCESS' : 'IN_PROGRESS',
      resultUrl: directResultUrl || undefined,
      prompt: String(genPayload.prompt || slotResolution.cleanedPrompt),
      timing,
    };

    return jsonResponse(responseData);
  } catch (error: any) {
    console.error('[AI生图] 任务提交发生异常:', error);
    if (error instanceof AppError) return errorResponse(error, '生图任务提交失败');
    logLatencyAudit({
      hypothesisId: 'H2',
      location: 'generate-image/route.ts:POST-catch',
      message: 'image submit exception',
      data: {
        error: String(error?.message || error),
        convertMs,
        gatewayMs,
        totalMs: Date.now() - t0,
      },
    });
    return jsonResponse(
      {
        success: false,
        error: formatUserError(error, '生图任务提交失败'),
      },
      500
    );
  }
}

/**
 * GET /api/generate/image?taskId={taskId}
 * 查询异步生图任务状态 (多端点高可用智能探测)
 */
export async function GET(req: Request) {
  return executeImagePoll(req);
}

export async function POST(req: Request) {
  let body;
  try { body = await req.clone().json(); } catch { return jsonResponse({ success: false, error: '请求格式不正确' }, 400); }
  try {
    return await guardSubmission(req, 'image', resolveCredentials(req, body), () => submit(req));
  } catch {
    return jsonResponse({ success: false, error: '任务提交记录保存失败，请核对原任务状态后重试', submissionUnknown: true }, 503);
  }
}
