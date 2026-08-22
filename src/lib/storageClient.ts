/**
 * 浏览器安全的对象存储客户端助手（无 Prisma / AWS SDK）
 *
 * 非敏感配置仍可在 localStorage 保留供 UI 回显；Secret 由桌面 Keychain + sidecar .env 提供。
 */

export interface StorageConfig {
  enabled?: boolean;
  provider?: 'r2' | 'oss' | 'cos' | 's3' | 'minio' | 'supabase';
  accountId?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucketName?: string;
  publicDomain?: string;
  region?: string;
}

/** @deprecated 对象存储凭证已服务端化，不再经请求头发送 */
export function getClientStorageHeaders(): Record<string, string> {
  return {};
}

/** 读取本地非敏感存储配置（供设置页 UI 回显） */
export function getLocalStorageUiConfig(): StorageConfig {
  if (typeof window === 'undefined') return {};
  try {
    const enabled = localStorage.getItem('storage_enabled') === 'true';
    if (!enabled) return { enabled: false };
    return {
      enabled: true,
      provider: (localStorage.getItem('storage_provider') as StorageConfig['provider']) || 'r2',
      accountId: localStorage.getItem('storage_account_id') || '',
      endpoint: localStorage.getItem('storage_endpoint') || '',
      accessKeyId: localStorage.getItem('storage_access_key_id') || '',
      bucketName: localStorage.getItem('storage_bucket_name') || '',
      publicDomain: localStorage.getItem('storage_public_domain') || '',
    };
  } catch {
    return {};
  }
}
