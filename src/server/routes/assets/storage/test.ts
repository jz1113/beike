import { jsonResponse } from '../../../core/http';
import { readJsonBody } from '../../../core/validate';
import { testStorageConnection, StorageConfig } from '@server/infrastructure/storage/storage';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { isAdminAuthorized, unauthorizedJson } from '@server/infrastructure/auth/apiAuth';
import { getRequestId } from '../../../core/requestId';
import { recordAuditEvent } from '../../../services/assistant/agentTelemetry';

/**
 * POST /api/assets/storage/test
 * 测试对象存储连通性与权限
 */
export async function POST(req: Request) {
  const requestId = getRequestId(req);
  if (!isAdminAuthorized(req)) {
    recordAuditEvent({ operation: 'storage.test', requestId, success: false, reason: 'unauthorized' });
    return unauthorizedJson('需要管理员权限');
  }
  try {
    const body = await readJsonBody(req, {});
    const config: StorageConfig = body?.config || body || {};

    const result = await testStorageConnection(config);
    recordAuditEvent({ operation: 'storage.test', requestId, success: Boolean(result?.success) });
    return jsonResponse(result);
  } catch (error: unknown) {
    recordAuditEvent({ operation: 'storage.test', requestId, success: false, reason: 'exception' });
    return jsonResponse({
      success: false,
      message: `测试异常: ${formatUserError(error)}`
    }, 500);
  }
}
