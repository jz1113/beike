import { prisma } from '@beike/shared/prisma';
import { logLatencyAudit } from '@beike/shared/latencyAudit';
import { formatUserError } from '@beike/shared/upstreamErrors';
import {
  buildEditsMultipart,
  fetchWithRetry,
  shouldUseEditsSubmit,
} from '../../../services/imageHelpers';
import './poll';

const IMAGE_SUBMIT_TIMEOUT_MS = 45_000;
// A lost POST response may already have created a billable task. Never replay it blindly.
const IMAGE_MAX_ATTEMPTS_PER_URL = 1;

export interface ImageSubmitResult {
  genRes: Response;
  genData: any;
  taskId: string;
  directResultUrl: string;
  usedEndpoint: string;
  usedSubmitUrl: string;
  submitMode: 'multipart' | 'json';
  endpointAttempts: number;
  gatewayMs: number;
  payloadBytes: number;
}

/**
 * 派发生图请求至候选网关端点
 */
export async function dispatchSubmitCandidates(options: {
  submitCandidates: string[];
  adapted: any;
  apiKey: string;
  payloadJson: string;
  editsImageUrls: string[];
  identityLockedSlots: string[] | null;
  baseUrl: string;
  model: string;
  parseMs: number;
  convertMs: number;
  imageCount: number;
  convertCacheHits: number;
  t0: number;
}): Promise<ImageSubmitResult> {
  const {
    submitCandidates,
    adapted,
    apiKey,
    payloadJson,
    editsImageUrls,
    identityLockedSlots,
    baseUrl,
    model,
    parseMs,
    convertMs,
    imageCount,
    convertCacheHits,
    t0,
  } = options;

  let genRes: Response | null = null;
  let genData: any = null;
  let lastErrorMsg = '';
  let usedSubmitUrl = submitCandidates[0];
  let submitMode: 'multipart' | 'json' = adapted.useEdits ? 'multipart' : 'json';
  let endpointAttempts = 0;
  let payloadBytes = Buffer.byteLength(payloadJson, 'utf8');

  console.log(`[AI生图-提交] 正在派发任务至: ${usedSubmitUrl} (模型=${adapted.modelId}, mode=${submitMode})`);

  const tGw0 = Date.now();
  for (const url of submitCandidates) {
    const shouldUseEdits = adapted.useEdits && shouldUseEditsSubmit(url);
    endpointAttempts += 1;
    usedSubmitUrl = url;
    submitMode = shouldUseEdits ? 'multipart' : 'json';
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
      };
      let bodyInit: BodyInit = payloadJson;

      if (shouldUseEdits) {
        const { form, bytesApprox, imageAppended } = buildEditsMultipart(
          adapted.payload,
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
        // 禁止手动设置 Content-Type，需由 runtime 带 boundary
      } else {
        headers['Content-Type'] = 'application/json';
      }

      const res = await fetchWithRetry(
        url,
        {
          method: 'POST',
          headers,
          body: bodyInit,
          signal: AbortSignal.timeout(IMAGE_SUBMIT_TIMEOUT_MS),
        },
        {
          maxAttempts: IMAGE_MAX_ATTEMPTS_PER_URL,
          onRetry: async (retryAttempt, delayMs, error) => {
            endpointAttempts += 1;
            console.warn(`[AI生图-提交] ${url} 将在 ${delayMs}ms 后重试`, {
              retryAttempt,
              message: error instanceof Error ? error.message : String(error),
            });
          },
        }
      );
      const rawText = await res.text().catch(() => '');
      let data: any = null;
      if (rawText) {
        try {
          data = JSON.parse(rawText);
        } catch (jsonErr: any) {
          console.warn(
            `[AI生图-提交] 端点 ${url} 返回非标准JSON响应 (${rawText.slice(0, 100)}):`,
            jsonErr?.message
          );
        }
      }
      const tId =
        data?.task_id ||
        data?.data?.task_id ||
        (typeof data?.data === 'string' ? data.data : data?.id || null);
      let hasDirect = false;
      if (data?.data && Array.isArray(data.data) && data.data[0]) {
        hasDirect = Boolean(data.data[0].url || data.data[0].b64_json);
      } else if (
        typeof data?.url === 'string' ||
        typeof data?.output === 'string' ||
        typeof data?.image_url === 'string'
      ) {
        hasDirect = true;
      }
      if (res.ok && (tId || hasDirect)) {
        genRes = res;
        genData = data;
        usedSubmitUrl = url;
        break;
      }
      lastErrorMsg =
        data?.message ||
        data?.error?.message ||
        data?.fail_reason ||
        (rawText && rawText.length < 200 ? rawText : `HTTP ${res.status}`);
      console.warn(`[AI生图-提交] 端点 ${url} 未被接受 (${submitMode}): ${lastErrorMsg}`);
      // Only explicit endpoint/format rejection permits another submission endpoint.
      // Quota errors, server failures, and unrecognized 2xx may already have side effects.
      if (![404, 405, 415].includes(res.status)) break;
    } catch (err: any) {
      lastErrorMsg = err?.message || String(err);
      const errName = err?.name || 'Error';
      const errCause = err?.cause ? String(err.cause) : '';
      console.warn(`[AI生图-提交] 连接 ${url} 异常 (${submitMode}): ${lastErrorMsg}`, {
        name: errName,
        cause: errCause || undefined,
        stack: err?.stack || undefined,
      });
      lastErrorMsg = `提交响应未确认：${lastErrorMsg}。请先在上游任务记录核实是否已创建任务，避免重复生成`;
      break;
    }
    if (genRes && genData) {
      break;
    }
  }
  const gatewayMs = Date.now() - tGw0;

  if (!genRes || !genData) {
    logLatencyAudit({
      hypothesisId: 'H2',
      location: 'generate-image/route.ts:POST-fail',
      message: 'image submit failed',
      data: {
        model,
        parseMs,
        convertMs,
        gatewayMs,
        payloadBytes,
        imageCount,
        convertCacheHits,
        endpointAttempts,
        baseUrl,
        usedSubmitUrl,
        submitMode,
        lastErrorMsg,
        totalMs: Date.now() - t0,
      },
    });
    const friendlyTip = formatUserError(lastErrorMsg, '绘图网关提交失败');
    throw new Error(
      `${friendlyTip} (网关地址=${baseUrl}, 最终尝试=${usedSubmitUrl}, 模式=${submitMode})`
    );
  }

  const taskId =
    genData.task_id ||
    genData.data?.task_id ||
    (typeof genData.data === 'string' ? genData.data : genData.id || null);

  let directResultUrl = '';
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

  const usedEndpoint = shouldUseEditsSubmit(usedSubmitUrl) ? 'edits' : 'generations';

  return {
    genRes,
    genData,
    taskId,
    directResultUrl,
    usedEndpoint,
    usedSubmitUrl,
    submitMode,
    endpointAttempts,
    gatewayMs,
    payloadBytes,
  };
}

/**
 * 记录生图任务入库 (dev.db)
 */
export async function persistImageTaskRecord(options: {
  productId?: string | null;
  prompt: string;
  finalTaskId: string;
  model: string;
  size: string;
  quality: string;
  directResultUrl?: string;
}): Promise<{ recordId?: string; dbMs: number }> {
  const { productId, prompt, finalTaskId, model, size, quality, directResultUrl } = options;
  const tDb0 = Date.now();
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
      prompt,
      taskId: finalTaskId,
      model,
      mediaType: 'image',
      size,
      quality,
      status: directResultUrl ? 'SUCCESS' : 'IN_PROGRESS',
      resultUrl: directResultUrl || undefined,
    },
  });
  const dbMs = Date.now() - tDb0;
  console.log(`[AI生图-入库] 任务已持久化到数据库 dev.db: recordId=${taskRecord.id}`);
  return { recordId: taskRecord.id, dbMs };
}
