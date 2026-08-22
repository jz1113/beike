import { jsonResponse } from '../../adapters/http';
import { upsertEnvFile } from '@/lib/desktopEnvFile';
import path from 'node:path';

function applyEnvUpdates(updates: Record<string, string>) {
  for (const [k, v] of Object.entries(updates)) {
    if (v === '' || v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

/**
 * POST /api/system/desktop-env
 * 桌面 sidecar：持久化网关/采集/对象存储配置到 AZHUO_DATA_DIR/.env，并更新当前进程 env
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
    const updates: Record<string, string> = {
      ALLOW_CUSTOM_BASE_URL: 'true',
    };

    const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '';
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    const cacheDir = typeof body.cacheDir === 'string' ? body.cacheDir.trim() : undefined;
    const wanbangKey = typeof body.wanbangKey === 'string' ? body.wanbangKey.trim() : '';
    const wanbangSecret = typeof body.wanbangSecret === 'string' ? body.wanbangSecret.trim() : '';
    const externalScraperId = typeof body.externalScraperId === 'string' ? body.externalScraperId.trim() : '';
    const externalScraperSecret = typeof body.externalScraperSecret === 'string' ? body.externalScraperSecret.trim() : '';
    const storage = body.storage && typeof body.storage === 'object' ? body.storage : null;

    if (baseUrl) updates.AI_DRAWING_BASE_URL = baseUrl.replace(/\/+$/, '');
    if (apiKey) updates.AI_DRAWING_API_KEY = apiKey;
    if (cacheDir !== undefined) updates.AZHUO_CACHE_DIR = cacheDir;

    if (wanbangKey) updates.WANBANG_API_KEY = wanbangKey;
    if (wanbangSecret) updates.WANBANG_API_SECRET = wanbangSecret;
    if (externalScraperId) updates.EXTERNAL_SCRAPER_ID = externalScraperId;
    if (externalScraperSecret) updates.EXTERNAL_SCRAPER_SECRET = externalScraperSecret;

    if (storage) {
      if (storage.enabled !== undefined) updates.STORAGE_ENABLED = storage.enabled ? 'true' : 'false';
      if (typeof storage.provider === 'string' && storage.provider) updates.STORAGE_PROVIDER = storage.provider;
      if (typeof storage.accountId === 'string') updates.R2_ACCOUNT_ID = storage.accountId;
      if (typeof storage.endpoint === 'string') updates.S3_ENDPOINT = storage.endpoint;
      if (typeof storage.accessKeyId === 'string') updates.S3_ACCESS_KEY_ID = storage.accessKeyId;
      if (typeof storage.secretAccessKey === 'string') updates.S3_SECRET_ACCESS_KEY = storage.secretAccessKey;
      if (typeof storage.bucketName === 'string') updates.S3_BUCKET_NAME = storage.bucketName;
      if (typeof storage.publicDomain === 'string') updates.S3_PUBLIC_DOMAIN = storage.publicDomain;
    }

    const envPath = path.join(dataDir, '.env');
    upsertEnvFile(envPath, updates);
    applyEnvUpdates(updates);
    process.env.ALLOW_CUSTOM_BASE_URL = 'true';

    return jsonResponse({
      success: true,
      envPath,
      hasApiKey: Boolean(process.env.AI_DRAWING_API_KEY),
      baseUrl: process.env.AI_DRAWING_BASE_URL || '',
      hasWanbang: Boolean(process.env.WANBANG_API_KEY && process.env.WANBANG_API_SECRET),
      storageEnabled: process.env.STORAGE_ENABLED === 'true',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '写入 .env 失败';
    return jsonResponse({ success: false, error: message }, 500);
  }
}
