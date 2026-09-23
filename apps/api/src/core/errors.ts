import { jsonResponse } from './http';
import { safeErrorMessage } from './validate';
import { GatewayBaseUrlError } from '@beike/domain/gatewayCreds';
import { WorkspaceRequiredError } from '@beike/server-kit/workspaceContext';

export class AppError extends Error {
  constructor(
    message: string,
    readonly status = 500,
    readonly code = 'internal_error',
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorEnvelope(error: unknown, fallback = '服务器内部错误') {
  if (error instanceof AppError) {
    return { body: { success: false, error: error.message, code: error.code }, status: error.status };
  }
  if (error instanceof WorkspaceRequiredError) {
    return { body: { success: false, error: error.message, code: 'workspace_required' }, status: error.status };
  }
  if (error instanceof GatewayBaseUrlError) {
    return { body: { success: false, error: error.message, code: 'gateway_base_url' }, status: error.status };
  }
  return { body: { success: false, error: safeErrorMessage(error, fallback), code: 'internal_error' }, status: 500 };
}

export function errorResponse(error: unknown, fallback = '服务器内部错误') {
  const { body, status } = errorEnvelope(error, fallback);
  return jsonResponse(body, status);
}

export function successEnvelope<T extends Record<string, unknown>>(data: T, status = 200) {
  return jsonResponse({ success: true, ...data }, status);
}
