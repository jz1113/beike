import { NextRequest, NextResponse } from 'next/server';
import { testStorageConnection, StorageConfig } from '@/lib/storage';

/**
 * POST /api/storage/test
 * 测试对象存储连通性与权限
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const config: StorageConfig = body?.config || body || {};

    const result = await testStorageConnection(config);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      message: `测试异常: ${error.message}`
    }, { status: 500 });
  }
}
