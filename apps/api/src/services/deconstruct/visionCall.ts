import { gatewayFetch } from '../../gateways/http';
import { normalizeGatewayBaseUrl } from '@beike/domain/gatewayUrl';
import { mapWithConcurrency } from '@beike/domain/asyncPool';
import { convertToStandardJpegDataUrl } from '@beike/server-kit/imageConverter';
import { resolveVisionTimeoutMs, VISION_EXTRACT_MASTER_TIMEOUT_MS } from '@beike/domain/visionTimeouts';
import { getRetryDelayMs, isNetworkLikeError } from '../gatewayCredentials';
import { isRetryableUpstreamError, isRetryableUpstreamStatus } from '@beike/domain/upstreamErrors';
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
  MAX_NETWORK_ATTEMPTS,
  RATE_LIMIT_BACKOFF_MS,
  isRateLimitResponse,
  noteRateLimitHit,
  noteRateLimitSuccess,
  parseRetryAfterMs,
  backoffWithJitter,
  sleep,
} from './concurrency';

export async function callVisionJson(params: {
  modelsToTry: string[];
  targetBaseUrl: string;
  targetApiKey: string;
  contentArray: Array<{ type: string; text?: string; image_url?: { url: string } }>;
  label: string;
  maxTokens?: number;
  tracker?: VisionCallTracker;
  diagnostics?: VisionCallDiagnostics;
}): Promise<{ rawJsonText: string; usedModel: string } | null> {
  const { modelsToTry, targetBaseUrl, targetApiKey, contentArray, label, maxTokens, tracker, diagnostics } =
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

        let lastErrText = '';
        let lastStatus = 0;
        let modelDone = false;

        for (let networkAttempt = 0; networkAttempt < MAX_NETWORK_ATTEMPTS && !modelDone; networkAttempt++) {
          let retryAfterNetwork = false;

          for (let attempt = 0; attempt <= RATE_LIMIT_BACKOFF_MS.length; attempt++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);

            try {
              const resp = await gatewayFetch(`${normalizeGatewayBaseUrl(targetBaseUrl)}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${targetApiKey}`,
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
                lastErrText = errText;
                lastStatus = resp.status;
                if (diagnostics) diagnostics.lastError = `HTTP ${resp.status}: ${errText.slice(0, 200)}`;

                if (
                  isRateLimitResponse(resp.status, errText) &&
                  attempt < RATE_LIMIT_BACKOFF_MS.length
                ) {
                  noteRateLimitHit();
                  const retryAfterMs = parseRetryAfterMs(resp);
                  const baseMs = retryAfterMs ?? RATE_LIMIT_BACKOFF_MS[attempt] ?? 8000;
                  const waitMs = backoffWithJitter(baseMs);
                  console.warn(
                    `[AssetDeconstruct] ${label} 模型 ${targetModel} 限流 (${resp.status})，${waitMs}ms 后重试 (${attempt + 1}/${RATE_LIMIT_BACKOFF_MS.length})`
                  );
                  await sleep(waitMs);
                  continue;
                }

                console.warn(
                  `[AssetDeconstruct] ${label} 模型 ${targetModel} 失败 (${resp.status}): ${errText}`
                );
                if (!isRetryableUpstreamStatus(resp.status)) return null;
                modelDone = true;
                break;
              }

              const data = await resp.json();
              const content = data.choices?.[0]?.message?.content || '';
              if (content) {
                hadSuccess = true;
                noteRateLimitSuccess();
                if (tracker) noteVisionCall(tracker, targetModel);
                modelDone = true;
                return { rawJsonText: content, usedModel: targetModel };
              }

              if (diagnostics) diagnostics.lastError = `模型 ${targetModel} 返回空内容`;
              modelDone = true;
              break;
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              if (diagnostics) diagnostics.lastError = message;

              if (isNetworkLikeError(err) && networkAttempt < MAX_NETWORK_ATTEMPTS - 1) {
                hadNetworkFailure = true;
                const delayMs = getRetryDelayMs(networkAttempt);
                console.warn(
                  `[AssetDeconstruct] ${label} 模型 ${targetModel} 网络异常: ${message}，${delayMs}ms 后重试 (${networkAttempt + 1}/${MAX_NETWORK_ATTEMPTS - 1})`
                );
                await sleep(delayMs);
                retryAfterNetwork = true;
                break;
              }

              if (isNetworkLikeError(err)) {
                hadNetworkFailure = true;
              } else {
                hadHttpFailure = true;
                if (!isRetryableUpstreamError(err)) return null;
              }

              console.warn(`[AssetDeconstruct] ${label} 模型 ${targetModel} 异常:`, message);
              modelDone = true;
              break;
            } finally {
              clearTimeout(timer);
            }
          }

          if (retryAfterNetwork) continue;
        }

        if (lastStatus) {
          console.warn(
            `[AssetDeconstruct] ${label} 模型 ${targetModel} 放弃 (${lastStatus}): ${lastErrText}`
          );
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (diagnostics) diagnostics.lastError = message;
        if (isNetworkLikeError(err)) hadNetworkFailure = true;
        else {
          hadHttpFailure = true;
          if (!isRetryableUpstreamError(err)) return null;
        }
        console.warn(`[AssetDeconstruct] ${label} 模型 ${targetModel} 异常:`, message);
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
