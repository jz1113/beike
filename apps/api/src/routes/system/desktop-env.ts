import { jsonResponse } from '../../core/http';
import { readJsonBody, safeErrorMessage } from '../../core/validate';
import { upsertEnvFile } from '@beike/server-kit/desktopEnvFile';
import path from 'node:path';

function applyEnvUpdates(updates: Record<string, string>) {
  for (const [k, v] of Object.entries(updates)) {
    if (v === '' || v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

/**
 * 安全：环境变量名白名单。任何未在此集合中的 key 都会被忽略，
 * 防止 API 调用方注入自定义环境变量覆盖关键配置（如 LOCAL_ACCESS_TOKEN）。
 */
const ENV_KEY_WHITELIST: Set<string> = new Set([
  'ALLOW_CUSTOM_BASE_URL',
  'AI_DRAWING_BASE_URL',
  'AI_DRAWING_API_KEY',
  'AZHUO_CACHE_DIR',
  'WANBANG_API_KEY',
  'WANBANG_API_SECRET',
  'EXTERNAL_SCRAPER_ID',
  'EXTERNAL_SCRAPER_SECRET',
  'QIYUN_APP_ID',
  'QIYUN_APP_KEY',
  'STORAGE_ENABLED',
  'STORAGE_PROVIDER',
  'R2_ACCOUNT_ID',
  'S3_ENDPOINT',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_BUCKET_NAME',
  'S3_PUBLIC_DOMAIN',
  // 注意：严禁列入 LOCAL_ACCESS_TOKEN / ADMIN_ACCESS_TOKEN / 数据库连接串
]);

function filterUpdatesByWhitelist(input: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    if (!ENV_KEY_WHITELIST.has(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * POST /api/system/desktop-env
 * 桌面 sidecar：热更新当前进程 env。
 * .env 文件写入由 Rust `save_desktop_env` 独占；此处仅在非桌面壳时落盘。
 */
export async function POST(req: Request) {
  const dataDir = process.env.AZHUO_DATA_DIR?.trim() || process.cwd();
  const isDesktopShell = process.env.DESKTOP_SHELL === '1';
  const isSharedWeb = process.env.NODE_ENV === 'production' && !isDesktopShell;

  // 公网 Web 是多人共用一份 process.env / .env。浏览器里填的密钥只能跟当次请求走，
  // 绝不能写进服务器默认配置，否则后保存的人会覆盖先保存的人。
  if (isSharedWeb) {
    return jsonResponse({
      success: true,
      skipped: true,
      fileWritten: false,
      hasApiKey: false,
      baseUrl: process.env.AI_DRAWING_BASE_URL || '',
      hasWanbang: false,
      storageEnabled: process.env.STORAGE_ENABLED === 'true',
    });
  }

  try {
    const body = await readJsonBody(req, {});
    const updates: Record<string, string> = {
      ALLOW_CUSTOM_BASE_URL: 'true',
    };

    const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '';
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    const cacheDir = typeof body.cacheDir === 'string' ? body.cacheDir.trim() : undefined;
    const wanbangKey = typeof body.wanbangKey === 'string' ? body.wanbangKey.trim() : '';
    const wanbangSecret = typeof body.wanbangSecret === 'string' ? body.wanbangSecret.trim() : '';
    const externalScraperId = typeof body.externalScraperId === 'string' ? body.externalScraperId.trim() : '';
    const externalScraperSecret =
      typeof body.externalScraperSecret === 'string' ? body.externalScraperSecret.trim() : '';
    const storage = body.storage && typeof body.storage === 'object' ? body.storage : null;

    if (baseUrl) updates.AI_DRAWING_BASE_URL = baseUrl.replace(/\/+$/, '');
    if (typeof body.apiKey === 'string') updates.AI_DRAWING_API_KEY = apiKey.trim();
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

    // 安全：写入前过滤环境变量名（白名单），防止任意键覆盖
    const safeUpdates = filterUpdatesByWhitelist(updates);

    const envPath = path.join(dataDir, '.env');
    if (!isDesktopShell) {
      upsertEnvFile(envPath, safeUpdates);
    }
    applyEnvUpdates(safeUpdates);
    process.env.ALLOW_CUSTOM_BASE_URL = 'true';

    return jsonResponse({
      success: true,
      envPath: isDesktopShell ? undefined : envPath,
      fileWritten: !isDesktopShell,
      hasApiKey: false,
      baseUrl: process.env.AI_DRAWING_BASE_URL || '',
      hasWanbang: false,
      storageEnabled: process.env.STORAGE_ENABLED === 'true',
    });
  } catch (err: unknown) {
    const message = safeErrorMessage(err, '写入 .env 失败');
    return jsonResponse({ success: false, error: message }, 500);
  }
}
