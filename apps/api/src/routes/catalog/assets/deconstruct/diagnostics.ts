import { jsonResponse } from '../../../../core/http';
import { formatUserError } from '@beike/domain/upstreamErrors';

export type VisionCallDiagnostics = {
  lastError: string;
  modelsTried: string[];
  pipelineStage: string;
  gatewayUnreachable: boolean;
};

export function createVisionCallDiagnostics(pipelineStage = ''): VisionCallDiagnostics {
  return { lastError: '', modelsTried: [], pipelineStage, gatewayUnreachable: false };
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
  const errForFormat = diag.lastError ? new Error(diag.lastError) : new Error(fallback);
  return jsonResponse(
    {
      error: formatUserError(errForFormat, fallback),
      detail: {
        modelsTried: diag.modelsTried,
        pipelineStage: diag.pipelineStage,
        gatewayUnreachable: diag.gatewayUnreachable,
      },
    },
    502
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
