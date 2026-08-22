import { jsonResponse } from '../../adapters/http';
import { upsertEnvFile } from '@/lib/desktopEnvFile';
import path from 'node:path';

/**
 * POST /api/system/desktop-env
 * 桌面 sidecar：持久化 AI 网关配置到 AZHUO_DATA_DIR/.env，并更新当前进程 env
 */
export async function POST(req: Request) {
  if (process.env.DESKTOP_SHELL !== '1') {
    return jsonResponse({ success: false, error: '仅桌面端 sidecar 可持久化 .env' }, 400);
  }

  const dataDir = process.env.AZHUO_DATA_DIR?.trim();
  if (!dataDir) {
    return jsonResponse({ success: false, error: '缺少 AZHUO_DATA_DIR' }, 500);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '';
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    const cacheDir = typeof body.cacheDir === 'string' ? body.cacheDir.trim() : undefined;

    const updates: Record<string, string> = {
      ALLOW_CUSTOM_BASE_URL: 'true',
    };
    if (baseUrl) updates.AI_DRAWING_BASE_URL = baseUrl.replace(/\/+$/, '');
    if (apiKey) updates.AI_DRAWING_API_KEY = apiKey;
    if (cacheDir !== undefined) {
      if (cacheDir) updates.AZHUO_CACHE_DIR = cacheDir;
      else updates.AZHUO_CACHE_DIR = '';
    }

    const envPath = path.join(dataDir, '.env');
    upsertEnvFile(envPath, updates);

    if (updates.AI_DRAWING_BASE_URL) {
      process.env.AI_DRAWING_BASE_URL = updates.AI_DRAWING_BASE_URL;
    }
    if (updates.AI_DRAWING_API_KEY) {
      process.env.AI_DRAWING_API_KEY = updates.AI_DRAWING_API_KEY;
    }
    if (cacheDir !== undefined) {
      if (cacheDir) process.env.AZHUO_CACHE_DIR = cacheDir;
      else delete process.env.AZHUO_CACHE_DIR;
    }
    process.env.ALLOW_CUSTOM_BASE_URL = 'true';

    return jsonResponse({
      success: true,
      envPath,
      hasApiKey: Boolean(process.env.AI_DRAWING_API_KEY),
      baseUrl: process.env.AI_DRAWING_BASE_URL || '',
    });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err?.message || '写入 .env 失败' }, 500);
  }
}
