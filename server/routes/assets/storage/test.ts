import { jsonResponse } from '../../../adapters/http';
import { testStorageConnection, StorageConfig } from '@/lib/storage';
import { formatUserError } from '../../../lib/formatApiError';

/**
 * POST /api/assets/storage/test
 * 测试对象存储连通性与权限
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const config: StorageConfig = body?.config || body || {};

    const result = await testStorageConnection(config);
    return jsonResponse(result);
  } catch (error: any) {
    return jsonResponse({
      success: false,
      message: `测试异常: ${formatUserError(error)}`
    }, 500);
  }
}
