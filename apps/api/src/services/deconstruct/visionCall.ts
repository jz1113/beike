import { gatewayFetch } from '../../gateways/http';
import { normalizeGatewayBaseUrl } from '@beike/domain/gatewayUrl';
import { mapWithConcurrency } from '@beike/domain/asyncPool';
import { convertToStandardJpegDataUrl } from '@beike/server-kit/imageConverter';
import { resolveVisionTimeoutMs, VISION_EXTRACT_MASTER_TIMEOUT_MS } from '@beike/domain/visionTimeouts';
import { isNetworkLikeError } from '../gatewayCredentials';
import {
  VisionCallDiagnostics,
  VisionCallTracker,
  noteModelAttempt,
  finalizeVisionDiagnostics,
  noteVisionCall,
} from './diagnostics';
import {
  visionInflightSemaphore,
  resolveMaxInflight,
  RATE_LIMIT_BACKOFF_MS,
  MAX_RATE_LIMIT_RETRIES,
  isRateLimitResponse,
  isQuotaExhausted,
  noteRateLimitHit,
  noteRateLimitSuccess,
  parseRetryAfterMs,
  sleep,
} from './concurrency';

function isDefinitiveModelUnavailable(status: number, body: string): boolean {
  if (status === 404 || status === 410) return true;
  if (status !== 400 && status !== 422) return false;
  return /model[\s_:-]*(not[\s_-]*found|does not exist|unavailable|not supported|invalid)|unsupported[\s_-]*model/i.test(body);
}

export async function callVisionJson(params: {
  modelsToTry: string[];
  targetBaseUrl: string;
  targetApiKey: string;
  contentArray: Array<{ type: string; text?: string; image_url?: { url: string } }>;
  label: string;
  operationId?: string;
  maxTokens?: number;
  tracker?: VisionCallTracker;
  diagnostics?: VisionCallDiagnostics;
}): Promise<{ rawJsonText: string; usedModel: string } | null> {
  const { modelsToTry, targetBaseUrl, targetApiKey, contentArray, label, operationId, maxTokens, tracker, diagnostics } =
    params;

  let hadSuccess = false;
  let hadHttpFailure = false;
  let hadNetworkFailure = false;

  const result = await visionInflightSemaphore.run(async () => {
    console.log(
      `[AssetDeconstruct] ${label} 在飞请求=${visionInflightSemaphore.inFlight}/${resolveMaxInflight()}`
    );

    for (const targetModel of modelsToTry) {
      if (!targetModel) continue;
      noteModelAttempt(diagnostics, targetModel);

      try {
        console.log(`[AssetDeconstruct] ${label} 尝试模型: ${targetModel}`);
        const timeoutMs = Math.max(
          resolveVisionTimeoutMs(targetModel, true),
          VISION_EXTRACT_MASTER_TIMEOUT_MS
        );

        for (let rateAttempt = 0; rateAttempt <= MAX_RATE_LIMIT_RETRIES; rateAttempt += 1) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);

            try {
              const resp = await gatewayFetch(`${normalizeGatewayBaseUrl(targetBaseUrl)}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${targetApiKey}`,
                  ...(operationId ? { 'x-idempotency-key': operationId } : {}),
                },
                body: JSON.stringify({
                  model: targetModel,
                  messages: [{ role: 'user', content: contentArray }],
                  temperature: 0.2,
                  max_tokens: maxTokens ?? 8192,
                  response_format: { type: 'json_object' },
                }),
                signal: controller.signal,
              });

              if (!resp.ok) {
                hadHttpFailure = true;
                const errText = await resp.text();
                if (diagnostics) diagnostics.lastError = `HTTP ${resp.status}: ${errText.slice(0, 200)}`;

                if (isRateLimitResponse(resp.status, errText)) {
                  noteRateLimitHit();
                  if (isQuotaExhausted(errText)) {
                    if (diagnostics) {
                      diagnostics.lastError = '上游账户余额或配额不足，已停止自动重试和模型切换';
                      diagnostics.quotaExhausted = true;
                    }
                    console.warn(`[AssetDeconstruct] ${label} 模型 ${targetModel} 返回额度不足；等待无效，停止自动切换`);
                    return null;
                  }
                  if (rateAttempt >= MAX_RATE_LIMIT_RETRIES) {
                    if (diagnostics) diagnostics.rateLimited = true;
                    console.warn(`[AssetDeconstruct] ${label} 模型 ${targetModel} 连续限流，已等待 ${MAX_RATE_LIMIT_RETRIES} 次仍未恢复；不切换模型，保留队列等待人工重试`);
                    return null;
                  }
                  const retryAfterMs = parseRetryAfterMs(resp);
                  const waitMs = retryAfterMs ?? RATE_LIMIT_BACKOFF_MS[rateAttempt];
                  console.warn(
                    `[AssetDeconstruct] ${label} 模型 ${targetModel} 限流 (${resp.status})，${Math.ceil(waitMs / 1000)} 秒后重试同一模型 (${rateAttempt + 1}/${MAX_RATE_LIMIT_RETRIES})`
                  );
                  // A 429 has been explicitly rejected upstream, so retrying this
                  // same idempotent operation is safe. Do not change model here.
                  await sleep(waitMs);
                  continue;
                }

                if (isDefinitiveModelUnavailable(resp.status, errText)) {
                  console.warn(`[AssetDeconstruct] ${label} 模型 ${targetModel} 明确不可用 (${resp.status})，切换下一个已配置模型`);
                  break;
                }

                // 5xx, parsing failures, and all other errors may be a delayed
                // accepted request. Never replay or switch model in that case.
                console.warn(`[AssetDeconstruct] ${label} 模型 ${targetModel} 结果不确定 (${resp.status})，停止自动重试以避免重复计费: ${errText}`);
                return null;
              }

              const data = await resp.json();
              const content = data.choices?.[0]?.message?.content || '';
              if (content) {
                hadSuccess = true;
                noteRateLimitSuccess();
                if (tracker) noteVisionCall(tracker, targetModel);
                return { rawJsonText: content, usedModel: targetModel };
              }

              if (diagnostics) diagnostics.lastError = `模型 ${targetModel} 返回空内容`;
              console.warn(`[AssetDeconstruct] ${label} 模型 ${targetModel} 返回空内容，结果可能已计费；停止自动切换`);
              return null;
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              if (diagnostics) diagnostics.lastError = message;

              if (isNetworkLikeError(err)) {
                hadNetworkFailure = true;
              } else {
                hadHttpFailure = true;
              }
              console.warn(`[AssetDeconstruct] ${label} 模型 ${targetModel} 请求结果不确定，停止自动重试/切换以避免重复计费:`, message);
              return null;
            } finally {
              clearTimeout(timer);
            }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (diagnostics) diagnostics.lastError = message;
        if (isNetworkLikeError(err)) hadNetworkFailure = true;
        else hadHttpFailure = true;
        console.warn(`[AssetDeconstruct] ${label} 模型 ${targetModel} 请求结果不确定，停止自动重试/切换:`, message);
        return null;
      }
    }

    return null;
  });

  finalizeVisionDiagnostics(diagnostics, hadSuccess, hadHttpFailure, hadNetworkFailure);
  return result;
}

export async function convertImagesInBatches(urls: string[]): Promise<string[]> {
  const converted = await mapWithConcurrency(urls, 6, async (u) => {
    return convertToStandardJpegDataUrl(u, { maxDimension: 800, quality: 80 });
  });
  return converted.filter((u): u is string => typeof u === 'string' && u.length > 0);
}
