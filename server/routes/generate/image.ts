import { jsonResponse } from '../../adapters/http';
import { prisma } from '@/lib/prisma';
import { cleanPromptText, ensureSocialPromptSlots, ensureOriginalPromptSlots, stripWorkshopPromptGuards } from '@/lib/drawing';
import { persistMediaUrl, extractStorageConfigFromRequest } from '@/lib/storage';
import { convertToStandardJpegDataUrl } from '@/lib/imageConverter';
import { buildImageRequest } from '@/lib/modelAdapters';
import { normalizeOpenAiImageRequest } from '@/lib/modelAdapters/image/normalizeOpenAiImageModel';
import { createImageConvertCache, logLatencyAudit } from '@/lib/latencyAudit';
import { emphasizeIdentityFacePlate, obfuscateCompositionFaces } from '@/lib/faceObfuscate';
import { humanizeUpstreamError } from '@/lib/upstreamErrors';

const DEFAULT_BASE_URL = process.env.AI_DRAWING_BASE_URL || 'https://ai.comfly.org';
const DEFAULT_API_KEY = process.env.AI_DRAWING_API_KEY || '';

function allowClientCustomBaseUrl(): boolean {
  return (
    process.env.DESKTOP_SHELL === '1' ||
    process.env.NODE_ENV !== 'production' ||
    process.env.ALLOW_CUSTOM_BASE_URL === 'true'
  );
}

/**
 * 获取请求使用的 Base URL 和 API Key (优先使用客户端自定义配置)
 */
function resolveCredentials(req: Request, body?: any) {
  const url = new URL(req.url);
  const customApiKey =
    body?.customApiKey ||
    req.headers.get('x-custom-api-key') ||
    url.searchParams.get('customApiKey') ||
    undefined;
  const customBaseUrl = allowClientCustomBaseUrl()
    ? (body?.customBaseUrl ||
        req.headers.get('x-custom-base-url') ||
        url.searchParams.get('customBaseUrl') ||
        undefined)
    : undefined;

  const baseUrl = (customBaseUrl && customBaseUrl.trim())
    ? customBaseUrl.trim().replace(/\/+$/, '')
    : DEFAULT_BASE_URL;
  const apiKey = (customApiKey && customApiKey.trim()) ? customApiKey.trim() : DEFAULT_API_KEY;

  return { baseUrl, apiKey };
}

/**
 * 远程垫图与防盗链资源安全拉取并转化为 Base64 Data URL (统一转为标准 JPEG 格式)
 * 彻底杜绝 AVIF 等格式导致下游绘图网关报 'input image data is not a recognizable image' 错误
 */
async function fetchImageAsSafeDataUrl(rawUrl?: string | null): Promise<string | undefined> {
  if (!rawUrl || typeof rawUrl !== 'string') return undefined;
  return convertToStandardJpegDataUrl(rawUrl);
}

/** Edits 网关要求 multipart/form-data + binary image，禁止 JSON 直传 data URL */
function dataUrlToBlobFile(dataUrl: string, index: number): { blob: Blob; filename: string } | null {
  const match = /^data:([^;,]+)?(?:;[^,]*)?;base64,([\s\S]+)$/.exec(dataUrl.trim());
  if (!match) return null;
  const mime = (match[1] || 'image/jpeg').toLowerCase();
  const buf = Buffer.from(match[2], 'base64');
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  return { blob: new Blob([buf], { type: mime }), filename: `image_${index}.${ext}` };
}

function buildEditsMultipart(payload: Record<string, unknown>, imageDataUrls: string[], opts?: { allowDuplicateFace?: boolean }) {
  const form = new FormData();
  let bytesApprox = 0;
  let imageAppended = 0;
  for (const key of ['prompt', 'model', 'size', 'quality', 'n', 'response_format']) {
    const v = payload[key];
    if (v === undefined || v === null || v === '') continue;
    const s = String(v);
    form.append(key, s);
    bytesApprox += Buffer.byteLength(s, 'utf8');
  }
  const seen = new Set<string>();
  for (const raw of imageDataUrls) {
    if (!raw || !raw.startsWith('data:')) continue;
    // 身份加权时允许同一正脸板连续出现两次；其它情况仍去重防误传
    if (!opts?.allowDuplicateFace && seen.has(raw)) continue;
    if (seen.has(raw) && opts?.allowDuplicateFace) {
      // 仅允许「已见过一次后再追加一次」
      const dupKey = `${raw}#dup`;
      if (seen.has(dupKey)) continue;
      seen.add(dupKey);
    } else {
      seen.add(raw);
    }
    const file = dataUrlToBlobFile(raw, imageAppended);
    if (!file) continue;
    form.append('image', file.blob, file.filename);
    bytesApprox += file.blob.size;
    imageAppended += 1;
  }
  return { form, bytesApprox, imageAppended };
}

/**
 * POST /api/generate/image
 * 提交异步生图任务
 */
export async function POST(req: Request) {
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
      rawBodyText.length >= 8_000_000
      || /Unterminated string|Unexpected end|position\s+\d{7,}/i.test(String(parseErr?.message || ''));
    const tip = tooLarge
      ? '参考图体积过大，请求在传输中被截断。请压缩垫图后重试，或减少同时传入的参考图数量。'
      : `请求数据格式异常或体积过大 (${parseErr?.message || ''})`;
    return jsonResponse({ success: false, error: tip }, 400);
  }

  try {
    const parseMs = Date.now() - t0;
    const { 
      prompt, 
      model = 'gpt-image-2', 
      size, 
      aspectRatio,
      quality, 
      productId,
      productImageUrl,
      referenceImageUrl,
      socialReferenceImageUrl,
      referenceImages,
      images,
      anchorFaceImageUrl,
      sceneAnchorImageUrl,
      has_human,
      hasHuman,
      shot_type,
      shotType,
      useReferenceImage = false,
      productTitle,
      workshopMode,
      productRole,
      productFingerprint,
      expression,
      source,
    } = body;

    const finalSize = size || aspectRatio || '2448x3264';
    const effectiveQuality = quality ?? (source === 'hub' ? 'medium' : 'high');
    const aspectHint = aspectRatio || (typeof finalSize === 'string' && !/^\d+\s*x\s*\d+$/i.test(finalSize.trim()) ? finalSize : undefined);

    if (!prompt || !prompt.trim()) {
      return jsonResponse({ success: false, error: '提示词不能为空' }, 400);
    }

    const { baseUrl, apiKey } = resolveCredentials(req, body);
    const finalHasHuman = has_human !== undefined ? has_human : (hasHuman !== undefined ? hasHuman : undefined);
    const finalShotType = shot_type || shotType;
    const isHumanShot =
      finalHasHuman === true ||
      (finalHasHuman !== false && finalShotType === 'model_shot');
    // 爆款模式以 workshopMode / 显式社媒构图图为准；禁止用「多图+正脸」启发式误伤原创
    const isExplicitSocialWorkshop = workshopMode === 'social_face_product_swap';
    const socialModeFromSocialRef = Boolean(socialReferenceImageUrl) && isExplicitSocialWorkshop;
    const socialMode = isExplicitSocialWorkshop || socialModeFromSocialRef;
    const isWorkshopOriginal = workshopMode === 'storyboard_generate';
    const isPlainMode = source === 'hub' || (!socialMode && !isWorkshopOriginal);

    let cleanedPrompt = stripWorkshopPromptGuards(cleanPromptText(prompt));

    if (socialMode) {
      cleanedPrompt = ensureSocialPromptSlots(cleanedPrompt, {
          hasHuman: isHumanShot,
          hasFace: Boolean(anchorFaceImageUrl) && isHumanShot,
          socialMode,
          expression: typeof expression === 'string' ? expression : undefined,
        });
    } else if (isWorkshopOriginal) {
      cleanedPrompt = ensureOriginalPromptSlots(cleanedPrompt, {
          hasHuman: isHumanShot,
          hasFace: Boolean(anchorFaceImageUrl) && isHumanShot,
          hasSceneAnchor: Boolean(sceneAnchorImageUrl),
          productRole,
          productFingerprint,
        });
    }

    const convertOnce = createImageConvertCache(fetchImageAsSafeDataUrl);
    const seenKeys = new Set<string>();
    const convertTracked = (raw?: string | null) => {
      if (raw && typeof raw === 'string' && raw.trim()) {
        const k = raw.trim();
        if (seenKeys.has(k)) convertCacheHits += 1;
        else seenKeys.add(k);
      }
      return convertOnce(raw);
    };

    const tConvert0 = Date.now();
    const [targetProductUrl, rawFaceUrl, cleanSceneAnchorUrl, rawSocialRefUrl, cleanRefUrl] = await Promise.all([
      convertTracked(productImageUrl),
      convertTracked(anchorFaceImageUrl),
      convertTracked(sceneAnchorImageUrl),
      convertTracked(socialReferenceImageUrl),
      convertTracked(referenceImageUrl)
    ]);

    // 有专属正脸 + 人物镜：模糊构图图人脸，强化正脸垫图，避免原模特脸压过 ID
    let cleanFaceUrl = rawFaceUrl;
    let cleanSocialRefUrl = rawSocialRefUrl;
    if (rawFaceUrl && rawSocialRefUrl && isHumanShot) {
      const [obfuscatedSocial, emphasizedFace] = await Promise.all([
        obfuscateCompositionFaces(rawSocialRefUrl),
        emphasizeIdentityFacePlate(rawFaceUrl),
      ]);
      cleanSocialRefUrl = obfuscatedSocial || rawSocialRefUrl;
      cleanFaceUrl = emphasizedFace || rawFaceUrl;
    }

    // 纯商品 / 挂拍镜：绝不附带正脸板，避免静物被强塞人脸
    const faceForSlots = isHumanShot ? (cleanFaceUrl || undefined) : undefined;

    // 爆款复刻：始终保留社媒构图图；正脸仅作 ID，不替代构图
    const safeSocialRef = cleanSocialRefUrl || undefined;
    const safeRef = cleanRefUrl || undefined;

    // 人物镜：必须凑齐三槽；缺槽直接失败，避免乱序垫图
    if (socialMode && isHumanShot) {
      const missing: string[] = [];
      if (!targetProductUrl) missing.push('@图片1 商品');
      if (!safeSocialRef) missing.push('@图片2 构图参考');
      if (!faceForSlots) missing.push('@图片3 正脸');
      if (missing.length > 0) {
        return jsonResponse(
          {
            success: false,
            error: `人物镜缺少垫图槽位：${missing.join('、')}。请确认商品图、社媒参考图与专属正脸均已就绪后再生成。`,
          }, 400);
      }
    }

    // 原创工坊：外观锁开启时商品图硬失败（Hub plain 模式不校验）
    if (isWorkshopOriginal && !socialMode && useReferenceImage && !targetProductUrl) {
      return jsonResponse(
        {
          success: false,
          error: '原创生图缺少商品垫图（@图片1）。请在素材步选好商品图并开启「强制跟商品图」。',
        }, 400);
    }

    // 人物+正脸：严格三槽；正脸板再追加一次提升 ID 注意力（提示词仍只认 @图片3）
    const identityLockedSlots = (socialMode && isHumanShot && faceForSlots && safeSocialRef && targetProductUrl)
      ? ([targetProductUrl, safeSocialRef, faceForSlots, faceForSlots] as string[])
      : null;

    // 原创工坊有序槽位：@图片1 商品 → @图片2 正脸(可选) → 末槽 场景定桩(可选)
    const originalOrderedSlots = isWorkshopOriginal && !socialMode
      ? ([
          targetProductUrl,
          ...(faceForSlots ? [faceForSlots] : []),
          ...(cleanSceneAnchorUrl ? [cleanSceneAnchorUrl] : []),
        ].filter(Boolean) as string[])
      : null;

    // 有序槽位：爆款 @1 商品 → @2 构图 → @3 正脸；原创见 originalOrderedSlots
    const orderedSlotImages = identityLockedSlots
      ? [targetProductUrl!, safeSocialRef!, faceForSlots!]
      : originalOrderedSlots && originalOrderedSlots.length > 0
        ? originalOrderedSlots
        : Array.from(
            new Set(
              [targetProductUrl, safeSocialRef, faceForSlots, cleanSceneAnchorUrl]
                .filter(Boolean) as string[]
            )
          );

    const primaryImgUrl = orderedSlotImages[0]
      || safeRef
      || (Array.isArray(images) ? images[0] : (Array.isArray(referenceImages) ? referenceImages[0] : undefined));

    const rawPassedImages = (Array.isArray(images) && images.length > 0)
      ? images
      : (Array.isArray(referenceImages) && referenceImages.length > 0 ? referenceImages : []);

    const safePassedImages = await Promise.all(
      rawPassedImages.map((img: string) => convertTracked(img))
    );
    convertMs = Date.now() - tConvert0;

    // 身份锁定 / 原创固定槽：只用处理后的有序槽；否则才合并客户端 images
    const prioritizedImages = identityLockedSlots
      ? identityLockedSlots
      : originalOrderedSlots && originalOrderedSlots.length > 0
        ? originalOrderedSlots
        : ((safePassedImages.filter(Boolean).length > 0)
          ? Array.from(new Set([
              ...(targetProductUrl ? [targetProductUrl] : []),
              ...safePassedImages.filter((img): img is string => Boolean(img) && img !== targetProductUrl),
            ]))
          : orderedSlotImages);

    const multiImages = prioritizedImages.length > 0
      ? prioritizedImages
      : orderedSlotImages;
    imageCount = multiImages.length;

    const normalized = normalizeOpenAiImageRequest(model, finalSize, effectiveQuality, aspectHint);

    const adapted = buildImageRequest({
      model,
      prompt: cleanedPrompt,
      size: normalized.size,
      quality: effectiveQuality,
      hasHuman: isHumanShot,
      shotType: finalShotType,
      primaryImage: primaryImgUrl,
      productImage: targetProductUrl,
      faceImage: faceForSlots,
      sceneImage: cleanSceneAnchorUrl,
      compositionImage: safeSocialRef,
      images: multiImages,
      preferEdits: Boolean(useReferenceImage && primaryImgUrl) || multiImages.length > 0,
      socialMode,
      plainMode: isPlainMode,
    });

    const genPayload = adapted.payload;
    const submitCandidates = adapted.endpoints(baseUrl).submit;
    const payloadJson = JSON.stringify(genPayload);
    payloadBytes = Buffer.byteLength(payloadJson, 'utf8');
    // Edits multipart：身份锁定时 商品→模糊构图→正脸→正脸(加权)；原创用 originalOrderedSlots
    const editsImageUrls = identityLockedSlots
      ? identityLockedSlots
      : originalOrderedSlots && originalOrderedSlots.length > 0
        ? originalOrderedSlots
        : Array.from(
            new Set(
              [targetProductUrl, safeSocialRef, faceForSlots, ...multiImages.filter(u => u !== targetProductUrl && u !== safeSocialRef && u !== faceForSlots)]
                .filter(Boolean) as string[]
            )
          );

    console.log(`[AI生图-提交] family=${adapted.family} userModel=${model} gatewayModel=${normalized.modelId} sizeTier=${normalized.sizeTier ?? '-'} rawSize=${finalSize} normalizedSize=${normalized.size} rawQuality=${quality ?? '(none)'} payloadModel=${genPayload.model} payloadSize=${genPayload.size} payloadQuality=${genPayload.quality ?? '(omitted)'}, useEdits=${adapted.useEdits}, 主商品图=${targetProductUrl ? '已绑定' : '无'}, 场景定景=${cleanSceneAnchorUrl ? '已绑定首图环境' : '无'}, 专属人脸=${faceForSlots ? '已锁定唯一正脸' : '无'}, 身份三槽=${Boolean(identityLockedSlots)}, edits图数=${editsImageUrls.length}, 提示词长度=${String(genPayload.prompt || '').length}`);

    let taskId: string | null = null;
    let usedEndpoint = adapted.useEdits ? 'edits' : 'generations';
    let genRes: Response | null = null;
    let genData: any = null;
    let lastErrorMsg = '';
    let usedSubmitUrl = submitCandidates[0];
    let submitMode: 'multipart' | 'json' = adapted.useEdits ? 'multipart' : 'json';

    console.log(`[AI生图-提交] 正在派发任务至: ${usedSubmitUrl} (模型=${adapted.modelId}, mode=${submitMode})`);

    const tGw0 = Date.now();
    for (const url of submitCandidates) {
      try {
        const headers: Record<string, string> = {
          'Authorization': `Bearer ${apiKey}`,
        };
        let bodyInit: BodyInit = payloadJson;
        submitMode = 'json';

        if (adapted.useEdits) {
          const { form, bytesApprox, imageAppended } = buildEditsMultipart(
            genPayload,
            editsImageUrls,
            { allowDuplicateFace: Boolean(identityLockedSlots) }
          );
          if (imageAppended === 0) {
            lastErrorMsg = 'Edits multipart 缺少有效参考图二进制';
            console.warn(`[AI生图-提交] 端点 ${url} 跳过: ${lastErrorMsg}`);
            continue;
          }
          payloadBytes = bytesApprox;
          bodyInit = form;
          submitMode = 'multipart';
          // 禁止手动设置 Content-Type，需由 runtime 带 boundary
        } else {
          headers['Content-Type'] = 'application/json';
        }

        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: bodyInit,
          signal: AbortSignal.timeout(120000),
        });
        const rawText = await res.text().catch(() => '');
        let data: any = null;
        if (rawText) {
          try {
            data = JSON.parse(rawText);
          } catch (jsonErr: any) {
            console.warn(`[AI生图-提交] 端点 ${url} 返回非标准JSON响应 (${rawText.slice(0, 100)}):`, jsonErr?.message);
          }
        }
        const tId = data?.task_id || data?.data?.task_id || (typeof data?.data === 'string' ? data.data : (data?.id || null));
        let hasDirect = false;
        if (data?.data && Array.isArray(data.data) && data.data[0]) {
          hasDirect = Boolean(data.data[0].url || data.data[0].b64_json);
        } else if (typeof data?.url === 'string' || typeof data?.output === 'string' || typeof data?.image_url === 'string') {
          hasDirect = true;
        }
        if (res.ok && (tId || hasDirect)) {
          genRes = res;
          genData = data;
          usedSubmitUrl = url;
          usedEndpoint = adapted.useEdits ? 'edits' : 'generations';
          break;
        }
        lastErrorMsg = data?.message || data?.error?.message || data?.fail_reason || (rawText && rawText.length < 200 ? rawText : `HTTP ${res.status}`);
        console.warn(`[AI生图-提交] 端点 ${url} 未被接受 (${submitMode}): ${lastErrorMsg}`);
      } catch (err: any) {
        lastErrorMsg = err?.message || String(err);
        console.warn(`[AI生图-提交] 连接 ${url} 异常: ${lastErrorMsg}`);
      }
    }
    gatewayMs = Date.now() - tGw0;

    if (!genRes || !genData) {
      logLatencyAudit({
        hypothesisId: 'H2',
        location: 'generate-image/route.ts:POST-fail',
        message: 'image submit failed',
        data: { model, parseMs, convertMs, gatewayMs, payloadBytes, imageCount, convertCacheHits, lastErrorMsg, totalMs: Date.now() - t0 },
      });
      throw new Error(humanizeUpstreamError(`绘图接口错误: ${lastErrorMsg || '提交失败'}`));
    }

    taskId = genData.task_id || genData.data?.task_id || (typeof genData.data === 'string' ? genData.data : (genData.id || null));

    let directResultUrl: string = '';
    if (genData.data && Array.isArray(genData.data) && genData.data.length > 0) {
      const firstItem = genData.data[0];
      if (firstItem.url) {
        directResultUrl = firstItem.url;
      } else if (firstItem.b64_json) {
        directResultUrl = `data:image/png;base64,${firstItem.b64_json}`;
      }
    } else if (typeof genData.url === 'string') {
      directResultUrl = genData.url;
    } else if (typeof genData.output === 'string') {
      directResultUrl = genData.output;
    } else if (typeof genData.image_url === 'string') {
      directResultUrl = genData.image_url;
    }

    if (!genRes.ok || (!taskId && !directResultUrl)) {
      const errorMsg = genData.message || genData.error?.message || genData.fail_reason || `HTTP ${genRes.status} 提交失败`;
      console.error(`[AI生图-失败] 绘图模型接口返回错误:`, genData);
      throw new Error(humanizeUpstreamError(errorMsg));
    }

    const finalTaskId = taskId || `direct_${Date.now()}`;
    console.log(`[AI生图-成功] 成功分派绘图任务: taskId=${finalTaskId}, 模型=${adapted.modelId}, 直出图=${directResultUrl ? '是' : '否'}`);

    let recordId: string | undefined;
    const tDb0 = Date.now();
    try {
      let validProductId: string | null = null;
      if (productId) {
        const existProduct = await prisma.product.findUnique({ where: { id: productId } }).catch(() => null);
        if (existProduct) {
          validProductId = productId;
        }
      }

      const taskRecord = await prisma.imageTask.create({
        data: {
          productId: validProductId,
          prompt: String(genPayload.prompt || cleanedPrompt),
          taskId: finalTaskId,
          model: adapted.modelId || normalized.modelId || 'gpt-image-2',
          mediaType: 'image',
          size: finalSize || String(genPayload.size || '2448x3264'),
          quality: effectiveQuality || String(genPayload.quality || 'medium'),
          status: directResultUrl ? 'SUCCESS' : 'IN_PROGRESS',
          resultUrl: directResultUrl || undefined
        }
      });
      recordId = taskRecord.id;
      console.log(`[AI生图-入库] 任务已持久化到数据库 dev.db: recordId=${recordId}`);
    } catch (dbErr: any) {
      console.error(`[AI生图-入库] 数据库记录失败: ${dbErr.message}`);
      return jsonResponse({
        success: false,
        error: `任务持久化失败: ${dbErr.message}`,
        taskId: finalTaskId,
      }, 500);
    }
    dbMs = Date.now() - tDb0;

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
        usedSubmitUrl,
        httpStatus: genRes.status,
        ...timing,
        anomaly: convertMs > 8000 || gatewayMs > 30000 || payloadBytes > 2_500_000,
      },
    });

    return jsonResponse({
      success: true,
      taskId: finalTaskId,
      recordId,
      model: adapted.modelId,
      family: adapted.family,
      usedEndpoint,
      status: directResultUrl ? 'SUCCESS' : 'IN_PROGRESS',
      resultUrl: directResultUrl || undefined,
      prompt: String(genPayload.prompt || cleanedPrompt),
      timing,
    });

  } catch (error: any) {
    console.error('[AI生图] 任务提交发生异常:', error);
    logLatencyAudit({
      hypothesisId: 'H2',
      location: 'generate-image/route.ts:POST-catch',
      message: 'image submit exception',
      data: { error: String(error?.message || error), convertMs, gatewayMs, totalMs: Date.now() - t0 },
    });
    return jsonResponse({
      success: false,
      error: humanizeUpstreamError(error.message || '生图任务提交失败')
    }, 500);
  }
}

// 任务轮询端点记忆缓存 (提升 300% 轮询响应速度)
const taskEndpointCache = new Map<string, string>();

/**
 * GET /api/generate/image?taskId={taskId}
 * 查询异步生图任务状态 (多端点高可用智能探测)
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return jsonResponse({ success: false, error: '缺少 taskId 参数' }, 400);
    }

    // 若直接为 direct_ 开头的同步已完成任务
    if (taskId.startsWith('direct_')) {
      let directResultUrl = '';
      try {
        const taskRecord = await prisma.imageTask.findFirst({
          where: { taskId },
          select: { resultUrl: true }
        });
        if (taskRecord?.resultUrl) {
          directResultUrl = taskRecord.resultUrl;
        }
      } catch {}

      return jsonResponse({
        success: true,
        taskId,
        status: 'SUCCESS',
        progress: '100%',
        resultUrl: directResultUrl || undefined
      });
    }

    const { baseUrl, apiKey } = resolveCredentials(req);

    // 🌟 多端点智能命中探测机制 (优先使用历史命中端点)
    const taskPrefix = taskId.slice(0, 8);
    const cacheKey = `${baseUrl}:${taskPrefix}`;
    const cachedEndpoint = taskEndpointCache.get(cacheKey) || taskEndpointCache.get(baseUrl);
    const candidateEndpoints = [
      cachedEndpoint,
      `${baseUrl}/v1/images/tasks/${taskId}`,
      `${baseUrl}/v1/tasks/${taskId}`,
      `${baseUrl}/v1/images/generations/${taskId}`,
      `${baseUrl}/v1/images/${taskId}`,
      `${baseUrl}/v1/query/image_generation?task_id=${taskId}`,
      `${baseUrl}/v1/task/${taskId}`
    ].filter(Boolean) as string[];

    const queryUrls = Array.from(new Set(candidateEndpoints.map(u => u.includes(taskId) ? u : `${u}/${taskId}`)));

    let res: Response | null = null;
    let resData: any = null;

    for (const qUrl of queryUrls) {
      try {
        const r = await fetch(qUrl, {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          },
          signal: AbortSignal.timeout(4000)
        });
        if (r.ok) {
          const d = await r.json().catch(() => null);
          if (d && (d.status || d.data?.status || d.data?.url || d.url || d.output || d.data?.data)) {
            res = r;
            resData = d;
            // 记忆当前网关成功端点模板
            const baseTemplate = qUrl.replace(taskId, '').replace(/\/$/, '');
            taskEndpointCache.set(cacheKey, baseTemplate);
            taskEndpointCache.set(baseUrl, baseTemplate);
            break;
          }
        }
      } catch (err) {}
    }

    if (!res || !res.ok || !resData) {
      console.warn(`[AI生图-轮询] 查询任务 ${taskId} 状态暂未就绪`);
      return jsonResponse({
        success: true,
        taskId,
        status: 'IN_PROGRESS',
        progress: '25%'
      });
    }

    const taskInfo = resData.data || resData;

    const rawStatus = (taskInfo.status || resData.status || 'PENDING').toUpperCase();
    const progress = taskInfo.progress !== undefined 
      ? (String(taskInfo.progress).endsWith('%') ? String(taskInfo.progress) : `${taskInfo.progress}%`) 
      : (resData.progress !== undefined 
        ? (String(resData.progress).endsWith('%') ? String(resData.progress) : `${resData.progress}%`) 
        : (rawStatus === 'SUCCESS' || rawStatus === 'SUCCEEDED' || rawStatus === 'COMPLETED' ? '100%' : '50%'));
    const rawFailReason = taskInfo.fail_reason || resData.fail_reason || resData.message || taskInfo.error?.message || taskInfo.error || '';
    const failReason = rawFailReason ? humanizeUpstreamError(String(rawFailReason)) : '';
    
    // 提取结果图片 URL (深度解析全格式)
    let resultUrl = '';
    if (taskInfo.data?.data && Array.isArray(taskInfo.data.data) && taskInfo.data.data.length > 0) {
      const first = taskInfo.data.data[0];
      resultUrl = first.url || (first.b64_json ? `data:image/png;base64,${first.b64_json}` : '');
    } else if (taskInfo.data && Array.isArray(taskInfo.data) && taskInfo.data.length > 0) {
      const first = taskInfo.data[0];
      resultUrl = first.url || (first.b64_json ? `data:image/png;base64,${first.b64_json}` : '');
    } else if (Array.isArray(resData.data) && resData.data.length > 0) {
      const first = resData.data[0];
      resultUrl = first.url || (first.b64_json ? `data:image/png;base64,${first.b64_json}` : '');
    } else if (typeof taskInfo.data?.url === 'string') {
      resultUrl = taskInfo.data.url;
    } else if (typeof taskInfo.url === 'string') {
      resultUrl = taskInfo.url;
    } else if (typeof taskInfo.image_url === 'string') {
      resultUrl = taskInfo.image_url;
    } else if (typeof taskInfo.output === 'string') {
      resultUrl = taskInfo.output;
    } else if (Array.isArray(taskInfo.outputs) && taskInfo.outputs.length > 0 && typeof taskInfo.outputs[0] === 'string') {
      resultUrl = taskInfo.outputs[0];
    } else if (typeof resData.url === 'string') {
      resultUrl = resData.url;
    } else if (typeof resData.output === 'string') {
      resultUrl = resData.output;
    }

    // 🌟 状态映射为规范枚举 (只要存在有效图片 URL 且非明确失败，直接判定为 SUCCESS)
    let status = 'IN_PROGRESS';
    if (resultUrl && rawStatus !== 'FAILURE' && rawStatus !== 'FAILED' && rawStatus !== 'ERROR') {
      status = 'SUCCESS';
    } else if (rawStatus === 'SUCCESS' || rawStatus === 'SUCCEEDED' || rawStatus === 'COMPLETED' || rawStatus === 'FINISHED') {
      status = resultUrl ? 'SUCCESS' : 'IN_PROGRESS';
    } else if (rawStatus === 'FAILURE' || rawStatus === 'FAILED' || rawStatus === 'ERROR') {
      status = 'FAILURE';
    } else {
      status = 'IN_PROGRESS';
    }

    // 任务状态完成时更新数据库记录
    if (status === 'SUCCESS' || status === 'FAILURE') {
      try {
        await prisma.imageTask.updateMany({
          where: { taskId: taskId },
          data: {
            status: status,
            resultUrl: resultUrl || undefined,
            failReason: failReason || undefined
          }
        });

        // 🌟 自动异步转存至永久对象存储 (非阻塞)
        if (status === 'SUCCESS' && resultUrl) {
          const storageConfig = extractStorageConfigFromRequest(req);
          persistMediaUrl(taskId, resultUrl, 'image', storageConfig).catch(() => {});
        }
      } catch (dbErr) {
        // ignore
      }
    }

    return jsonResponse({
      success: true,
      taskId,
      status,
      progress,
      resultUrl,
      failReason
    });

  } catch (error: any) {
    console.error('[AI生图-轮询] 异常:', error);
    return jsonResponse({
      success: false,
      error: error.message || '查询任务状态失败'
    }, 500);
  }
}

