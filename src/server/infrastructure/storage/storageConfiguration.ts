export interface StorageConfig {
  enabled?: boolean;
  /** 成品上传与临时参考文件中转分别控制。 */
  persistResults?: boolean;
  provider?: 'r2' | 'oss' | 'cos' | 's3' | 'minio' | 'supabase';
  accountId?: string;      // Cloudflare Account ID
  endpoint?: string;       // S3 / R2 / OSS 端点 URL
  accessKeyId?: string;    // Access Key ID
  secretAccessKey?: string;// Secret Access Key
  bucketName?: string;     // 存储桶名称
  publicDomain?: string;   // 公开访问域名 (如 https://pub-xxx.r2.dev 或 https://cdn.domain.com)
  region?: string;         // 区域 (R2 默认为 auto，AWS S3 为 us-east-1 等)
}

export function inferStorageRegion(provider?: string, endpoint?: string, explicitRegion?: string): string {
  if (explicitRegion) return explicitRegion;
  if (provider === 'r2') return 'auto';
  if (provider === 'oss') {
    const match = endpoint?.match(/oss-([a-z0-9-]+)\.aliyuncs\.com/i);
    return match ? match[1] : 'cn-hangzhou';
  }
  if (provider === 'cos') {
    const match = endpoint?.match(/cos\.([a-z0-9-]+)\.myqcloud\.com/i);
    return match ? match[1] : 'ap-guangzhou';
  }
  if (provider === 's3') {
    const match = endpoint?.match(/(?:^|[./])s3[.-](?:dualstack\.)?([a-z]{2}-(?:[a-z]+-)?[a-z]+-\d)\.amazonaws\.com(?:\.cn)?/i);
    if (match) return match[1];
  }
  return 'us-east-1';
}

export function resolveStorageConfiguration(customConfig: StorageConfig | undefined, env: Record<string, string | undefined>): StorageConfig | null {

  const enabled = customConfig?.enabled ?? (env.STORAGE_ENABLED !== undefined ? env.STORAGE_ENABLED === 'true' : Boolean(env.R2_ACCOUNT_ID || env.S3_ENDPOINT));
  
  const persistResults = customConfig ? customConfig.persistResults === true : env.STORAGE_PERSIST_RESULTS === 'true';
  const provider = customConfig?.provider ?? (env.STORAGE_PROVIDER as StorageConfig['provider']) ?? 'r2';
  const accountId = (customConfig?.accountId ?? (env.R2_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID || '')).trim();
  let endpoint = customConfig?.endpoint ?? (env.S3_ENDPOINT || '');
  const accessKeyId = customConfig?.accessKeyId ?? (env.S3_ACCESS_KEY_ID || env.R2_ACCESS_KEY_ID || '');
  const secretAccessKey = customConfig?.secretAccessKey ?? (env.S3_SECRET_ACCESS_KEY || env.R2_SECRET_ACCESS_KEY || '');
  const bucketName = (customConfig?.bucketName ?? (env.S3_BUCKET_NAME || env.R2_BUCKET_NAME || '')).trim();
  let publicDomain = customConfig?.publicDomain ?? (env.S3_PUBLIC_DOMAIN || env.R2_PUBLIC_DOMAIN || '');

  // Cloudflare R2 智能补全 endpoint
  if (provider === 'r2' && accountId && !endpoint) {
    endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  }

  // 基础校验：必须有 Key、Secret 和 Bucket
  if (!accessKeyId.trim() || !secretAccessKey.trim() || !bucketName.trim()) {
    return null;
  }

  if (enabled && persistResults && ['r2', 'supabase'].includes(provider)) {
    if (!publicDomain.trim()) return null;
    try {
      const url = new URL(publicDomain.trim());
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash ||
        /(^|\.)r2\.cloudflarestorage\.com$/i.test(url.hostname) || /\/storage\/v1\/s3(?:\/|$)/i.test(url.pathname)) return null;
    } catch { return null; }
  }

  // 自动根据服务商与 Endpoint 推导匹配的 Region，避免 AWS Signature V4 签名错配
  const region = inferStorageRegion(provider, endpoint, customConfig?.region ?? (env.S3_REGION));

  // 阿里云 OSS 智能补全 publicDomain（若用户未显式填写自定义域名，自动以虚拟主机格式组装）
  if (provider === 'oss' && bucketName && endpoint && !publicDomain) {
    const cleanEndpoint = endpoint.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    publicDomain = `https://${bucketName}.${cleanEndpoint}`;
  }

  if (publicDomain) {
    publicDomain = publicDomain.trim().replace(/\/+$/, '');
  }

  return {
    enabled,
    persistResults,
    provider,
    accountId,
    endpoint: endpoint.trim().replace(/\/+$/, ''),
    accessKeyId: accessKeyId.trim(),
    secretAccessKey: secretAccessKey.trim(),
    bucketName: bucketName.trim(),
    publicDomain,
    region
  };
}

export function storageClientOptions(config: StorageConfig) {
  const endpoint = config.endpoint || (config.provider === 'r2' && config.accountId
    ? `https://${config.accountId}.r2.cloudflarestorage.com` : undefined);
  return {
    region: inferStorageRegion(config.provider, endpoint, config.region),
    endpoint,
    forcePathStyle: config.provider === 'minio' || config.provider === 'supabase',
    credentials: { accessKeyId: config.accessKeyId || '', secretAccessKey: config.secretAccessKey || '' },
  };
}
