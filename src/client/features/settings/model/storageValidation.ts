export type StorageProvider =
  | 'oss'
  | 'qiniu'
  | 'cloudinary'
  | 'cos'
  | 'r2'
  | 's3'
  | 'minio'
  | 'supabase';

export interface StorageDraft {
  provider: StorageProvider;
  accountId: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicDomain: string;
  apiPrefix?: string;
  materialsPrefix?: string;
  cloudName?: string;
  zone?: string;
}

export const QINIU_ZONES = [
  { id: 'z2', name: '华南-广东 (z2)', endpoint: 'https://s3-cn-south-1.qiniucs.com' },
  { id: 'z0', name: '华东-浙江 (z0)', endpoint: 'https://s3-cn-east-1.qiniucs.com' },
  { id: 'cn-east-2', name: '华东-浙江2 (cn-east-2)', endpoint: 'https://s3-cn-east-2.qiniucs.com' },
  { id: 'z1', name: '华北-河北 (z1)', endpoint: 'https://s3-cn-north-1.qiniucs.com' },
  { id: 'na0', name: '北美-洛杉矶 (na0)', endpoint: 'https://s3-us-north-1.qiniucs.com' },
  { id: 'as0', name: '亚太-新加坡 (as0)', endpoint: 'https://s3-ap-southeast-1.qiniucs.com' },
  { id: 'ap-northeast-1', name: '亚太-首尔 (ap-northeast-1)', endpoint: 'https://s3-ap-northeast-1.qiniucs.com' },
] as const;

export function normalizeStorageUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function validHttpUrl(value: string) {
  try {
    const url = new URL(normalizeStorageUrl(value));
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname) &&
      !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

export function storageProviderError(provider: string, endpoint: string) {
  if (provider === 'cloudinary') return '';
  if (provider === 'qiniu') return '';
  if (!validHttpUrl(endpoint)) return '请填写有效的 HTTP 或 HTTPS 对象存储 Endpoint';
  const host = new URL(normalizeStorageUrl(endpoint)).hostname.toLowerCase();
  if (provider === 'cos' && /(^|\.)aliyuncs\.com$/.test(host)) return '当前选择腾讯云 COS，但端点仍是阿里云 OSS，请填写腾讯云端点及配套密钥';
  if (provider === 'oss' && /(^|\.)myqcloud\.com$/.test(host)) return '当前选择阿里云 OSS，但端点仍是腾讯云 COS，请填写阿里云端点及配套密钥';
  return '';
}

export function storageConfigError(config: StorageDraft, options: { requirePublicDomain?: boolean } = {}) {
  if (config.provider === 'cloudinary') {
    if (!config.cloudName?.trim()) return '请填写 Cloudinary 的 Cloud Name';
    if (!config.accessKeyId.trim() || !config.secretAccessKey.trim()) return '请填写完整的 Cloudinary API Key 和 API Secret';
    return '';
  }

  if (config.provider === 'qiniu') {
    if (!config.bucketName.trim()) return '请填写七牛云存储桶 (Bucket) 名称';
    if (!config.accessKeyId.trim() || !config.secretAccessKey.trim()) return '请填写七牛云 Access Key 和 Secret Key';
    if (!config.publicDomain.trim()) return '请填写七牛云外链域名 / CDN 测试域名';
    if (!validHttpUrl(config.publicDomain)) return '七牛云外链域名必须是有效的域名或 HTTP(S) 地址';
    return '';
  }

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
      const url = new URL(normalizeStorageUrl(config.publicDomain));
      if (/(^|\.)r2\.cloudflarestorage\.com$/i.test(url.hostname) || /\/storage\/v1\/s3(?:\/|$)/i.test(url.pathname)) return '公开访问域名不能使用需要鉴权的 S3 API 端点';
    }
  }
  return '';
}
