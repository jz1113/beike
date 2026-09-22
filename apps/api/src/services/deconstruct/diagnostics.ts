import { jsonResponse } from '../../core/http';
import { formatUserError } from '@beike/domain/upstreamErrors';

export type VisionCallDiagnostics = {
  lastError: string;
  modelsTried: string[];
  pipelineStage: string;
  gatewayUnreachable: boolean;
  rateLimited: boolean;
  quotaExhausted: boolean;
};

export function createVisionCallDiagnostics(pipelineStage = ''): VisionCallDiagnostics {
  return { lastError: '', modelsTried: [], pipelineStage, gatewayUnreachable: false, rateLimited: false, quotaExhausted: false };
}

export function noteModelAttempt(diag: VisionCallDiagnostics | undefined, model: string) {
  if (!diag || !model) return;
  if (!diag.modelsTried.includes(model)) {
    diag.modelsTried.push(model);
  }
}

export function finalizeVisionDiagnostics(
  diag: VisionCallDiagnostics | undefined,
  hadSuccess: boolean,
  hadHttpFailure: boolean,
  hadNetworkFailure: boolean
) {
  if (!diag) return;
  diag.gatewayUnreachable = !hadSuccess && hadNetworkFailure && !hadHttpFailure;
}

export function buildDeconstructFailureResponse(
  diag: VisionCallDiagnostics,
  fallback = '视觉模型解构失败，请检查模型配置或稍后重试'
) {
  const isRateLimited = diag.rateLimited;
  const isQuotaExhausted = diag.quotaExhausted;
  const errForFormat = diag.lastError ? new Error(diag.lastError) : new Error(fallback);
  return jsonResponse(
    {
      error: isQuotaExhausted
        ? '上游账户余额或配额不足，等待或切换模型都不能解决；请检查当前 API Key 对应账户。'
        : isRateLimited
        ? '上游分组当前繁忙，原任务没有自动重试。请等待当前调用完成后再手动重试，避免重复计费。'
        : formatUserError(errForFormat, fallback),
      detail: {
        modelsTried: diag.modelsTried,
        pipelineStage: diag.pipelineStage,
        gatewayUnreachable: diag.gatewayUnreachable,
        rateLimited: isRateLimited,
        quotaExhausted: isQuotaExhausted,
      },
    },
    isRateLimited || isQuotaExhausted ? 429 : 502
  );
}

export type VisionCallTracker = {
  callCount: number;
  modelsUsed: string[];
};

export function createVisionCallTracker(): VisionCallTracker {
  return { callCount: 0, modelsUsed: [] };
}

export function noteVisionCall(tracker: VisionCallTracker, model: string) {
  tracker.callCount += 1;
  if (model && !tracker.modelsUsed.includes(model)) {
    tracker.modelsUsed.push(model);
  }
}
