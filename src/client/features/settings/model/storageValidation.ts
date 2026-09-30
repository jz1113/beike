export interface StorageDraft {
  provider: 'r2' | 'oss' | 'cos' | 's3' | 'minio' | 'supabase';
  accountId: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicDomain: string;
}

function validHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname) &&
      !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

export function storageProviderError(provider:string,endpoint:string) {
  if (!validHttpUrl(endpoint)) return '请填写有效的 HTTP 或 HTTPS 对象存储 Endpoint';
  const host = new URL(endpoint.trim()).hostname.toLowerCase();
  if(provider==='cos' && /(^|\.)aliyuncs\.com$/.test(host))return '当前选择腾讯云 COS，但端点仍是阿里云 OSS，请填写腾讯云的端点及配套密钥';
  if(provider==='oss' && /(^|\.)myqcloud\.com$/.test(host))return '当前选择阿里云 OSS，但端点仍是腾讯云 COS，请填写阿里云的端点及配套密钥';
  return '';
}

export function storageConfigError(config: StorageDraft, options: { requirePublicDomain?: boolean } = {}) {
  if (config.provider === 'r2' && !config.endpoint.trim()) {
    if (!/^[a-zA-Z0-9]+$/.test(config.accountId.trim())) return '请填写 R2 账户 ID，或提供完整的 Endpoint';
  } else {
    const error = storageProviderError(config.provider, config.endpoint);
    if (error) return error;
  }
  if (!config.bucketName.trim()) return '请填写存储桶名称';
  if (!config.accessKeyId.trim() || !config.secretAccessKey.trim()) return '请填写完整的访问密钥 ID 和秘密访问密钥';
  if (config.publicDomain.trim() && !validHttpUrl(config.publicDomain)) return '公开访问域名必须是有效的 HTTP 或 HTTPS 地址';
  if (['r2', 'supabase'].includes(config.provider)) {
    if (options.requirePublicDomain !== false && !config.publicDomain.trim()) return '启用转存或迁移前，请填写可公开读取媒体的访问域名';
    if (config.publicDomain.trim()) {
      const url = new URL(config.publicDomain.trim());
      if (/(^|\.)r2\.cloudflarestorage\.com$/i.test(url.hostname) || /\/storage\/v1\/s3(?:\/|$)/i.test(url.pathname)) return '公开访问域名不能使用需要鉴权的 S3 API 端点';
    }
  }
  return '';
}
