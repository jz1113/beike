/**
 * 浏览器安全的对象存储客户端助手（无 Prisma / AWS SDK）
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

/**
 * 客户端辅助：读取本地对象存储配置并编码为请求头（不依赖 Prisma / Node）
 *
 * 安全提示：Secret 会经 Base64 请求头随 API 发送，XSS/扩展可读。
 * 生产环境建议将 Secret 写入桌面数据目录 `.env`，由服务端 sidecar 读取。
 */
export function getClientStorageHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const enabled = localStorage.getItem('storage_enabled') === 'true';
    if (!enabled) return {};
    const config: StorageConfig = {
      enabled: true,
      provider: (localStorage.getItem('storage_provider') as StorageConfig['provider']) || 'r2',
      accountId: localStorage.getItem('storage_account_id') || '',
      endpoint: localStorage.getItem('storage_endpoint') || '',
      accessKeyId: localStorage.getItem('storage_access_key_id') || '',
      secretAccessKey: localStorage.getItem('storage_secret_access_key') || '',
      bucketName: localStorage.getItem('storage_bucket_name') || '',
      publicDomain: localStorage.getItem('storage_public_domain') || '',
    };
    return {
      'x-storage-config':
        typeof btoa !== 'undefined'
          ? btoa(unescape(encodeURIComponent(JSON.stringify(config))))
          : JSON.stringify(config),
    };
  } catch {
    return {};
  }
}
