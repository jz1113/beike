import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from './prisma';

export interface StorageConfig {
  enabled?: boolean;
  provider?: 'r2' | 'oss' | 'cos' | 's3' | 'minio' | 'supabase';
  accountId?: string;      // Cloudflare Account ID
  endpoint?: string;       // S3 / R2 / OSS 端点 URL
  accessKeyId?: string;    // Access Key ID
  secretAccessKey?: string;// Secret Access Key
  bucketName?: string;     // 存储桶名称
  publicDomain?: string;   // 公开访问域名 (如 https://pub-xxx.r2.dev 或 https://cdn.domain.com)
  region?: string;         // 区域 (R2 默认为 auto，AWS S3 为 us-east-1 等)
}

/**
 * 从 Request 或请求 Body 中提取前端传递的存储配置
 */
export function extractStorageConfigFromRequest(req: any, body?: any): StorageConfig | undefined {
  if (body?.storageConfig) return body.storageConfig;
  const headerVal = req?.headers?.get ? req.headers.get('x-storage-config') : null;
  if (headerVal) {
    try {
      const decoded = Buffer.from(headerVal, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    } catch {
      try {
        return JSON.parse(headerVal);
      } catch {}
    }
  }
  return undefined;
}

/**
 * 获取生效的存储配置 (优先从自定义传参，其次环境变量)
 */
export function resolveStorageConfig(customConfig?: StorageConfig): StorageConfig | null {
  const enabled = customConfig?.enabled ?? (process.env.STORAGE_ENABLED === 'true' || Boolean(process.env.R2_ACCOUNT_ID || process.env.S3_ENDPOINT));
  
  const provider = customConfig?.provider || (process.env.STORAGE_PROVIDER as any) || 'r2';
  const accountId = customConfig?.accountId || process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || '';
  let endpoint = customConfig?.endpoint || process.env.S3_ENDPOINT || '';
  const accessKeyId = customConfig?.accessKeyId || process.env.S3_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID || '';
  const secretAccessKey = customConfig?.secretAccessKey || process.env.S3_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY || '';
  const bucketName = customConfig?.bucketName || process.env.S3_BUCKET_NAME || process.env.R2_BUCKET_NAME || '';
  let publicDomain = customConfig?.publicDomain || process.env.S3_PUBLIC_DOMAIN || process.env.R2_PUBLIC_DOMAIN || '';

  // Cloudflare R2 智能补全 endpoint
  if (provider === 'r2' && accountId && !endpoint) {
    endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  }

  // 基础校验：必须有 Key、Secret 和 Bucket
  if (!accessKeyId || !secretAccessKey || !bucketName) {
    return null;
  }

  // 公开域名去除末尾斜杠
  if (publicDomain) {
    publicDomain = publicDomain.trim().replace(/\/+$/, '');
  }

  return {
    enabled,
    provider,
    accountId,
    endpoint: endpoint.trim().replace(/\/+$/, ''),
    accessKeyId: accessKeyId.trim(),
    secretAccessKey: secretAccessKey.trim(),
    bucketName: bucketName.trim(),
    publicDomain,
    region: customConfig?.region || process.env.S3_REGION || (provider === 'r2' ? 'auto' : 'us-east-1')
  };
}

/**
 * 创建 S3Client 实例
 */
export function createS3Client(config: StorageConfig): S3Client {
  let endpoint = config.endpoint;
  if (config.provider === 'r2' && config.accountId && !endpoint) {
    endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;
  }

  return new S3Client({
    region: config.region || (config.provider === 'r2' ? 'auto' : 'us-east-1'),
    endpoint: endpoint || undefined,
    credentials: {
      accessKeyId: config.accessKeyId || '',
      secretAccessKey: config.secretAccessKey || ''
    }
  });
}

/**
 * 判断 URL 是否已经是持久化对象存储链接（无需重复转存）
 */
export function isAlreadyPermanentUrl(url: string, publicDomain?: string): boolean {
  if (!url || typeof url !== 'string') return false;
  if (publicDomain && url.startsWith(publicDomain)) return true;
  // 如果链接包含主流不可过期域名或自定义存储桶
  if (url.includes('.r2.dev') || url.includes('.aliyuncs.com') || url.includes('.myqcloud.com') || url.includes('.amazonaws.com')) {
    return true;
  }
  return false;
}

/**
 * 从远程临时 URL 流式下载并上传至对象存储，返回永久公开链接
 */
export async function uploadRemoteMediaToStorage(
  tempUrl: string, 
  options: { 
    keyPrefix?: 'images' | 'videos' | 'assets';
    customConfig?: StorageConfig;
    filename?: string;
  } = {}
): Promise<string> {
  const config = resolveStorageConfig(options.customConfig);
  if (!config) {
    throw new Error('未配置对象存储凭证或配置不完整');
  }

  // 1. 抓取临时多媒体资源
  console.log(`[对象存储-转存] 开始抓取临时资源: ${tempUrl.slice(0, 80)}...`);
  const response = await fetch(tempUrl);
  if (!response.ok) {
    throw new Error(`抓取临时多媒体失败 (HTTP ${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = response.headers.get('content-type') || (options.keyPrefix === 'videos' ? 'video/mp4' : 'image/png');

  // 2. 解析文件后缀
  let ext = 'png';
  if (options.keyPrefix === 'videos' || contentType.includes('mp4') || tempUrl.includes('.mp4')) {
    ext = 'mp4';
  } else if (contentType.includes('jpeg') || contentType.includes('jpg') || tempUrl.includes('.jpg') || tempUrl.includes('.jpeg')) {
    ext = 'jpg';
  } else if (contentType.includes('webp') || tempUrl.includes('.webp')) {
    ext = 'webp';
  }

  // 3. 构建时间戳路径 (如 azhuo/images/202608/media_1786860000_a1b2c.png)
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const prefix = options.keyPrefix || (ext === 'mp4' ? 'videos' : 'images');
  const filename = options.filename || `azhuo_${prefix}_${Date.now()}_${randomSuffix}.${ext}`;
  const key = `azhuo/${prefix}/${yearMonth}/${filename}`;

  // 4. 上传至对象存储桶
  const s3 = createS3Client(config);
  await s3.send(new PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType
  }));

  // 5. 组装永久公开访问链接
  let permanentUrl = '';
  if (config.publicDomain) {
    permanentUrl = `${config.publicDomain}/${key}`;
  } else if (config.provider === 'r2' && config.publicDomain) {
    permanentUrl = `${config.publicDomain}/${key}`;
  } else if (config.endpoint) {
    permanentUrl = `${config.endpoint}/${config.bucketName}/${key}`;
  } else {
    permanentUrl = `https://${config.bucketName}.s3.amazonaws.com/${key}`;
  }

  console.log(`[对象存储-转存] 成功转存至永久链接: ${permanentUrl}`);
  return permanentUrl;
}

/**
 * ⚡ 后台非阻塞异步转存与数据库自动更新服务
 */
export async function persistMediaUrl(
  taskId: string, 
  tempUrl: string, 
  mediaType: 'image' | 'video',
  customConfig?: StorageConfig
): Promise<string | null> {
  try {
    const config = resolveStorageConfig(customConfig);
    if (!config || !config.enabled) {
      return null;
    }

    if (isAlreadyPermanentUrl(tempUrl, config.publicDomain)) {
      return tempUrl;
    }

    let permanentUrl: string | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        permanentUrl = await uploadRemoteMediaToStorage(tempUrl, {
          keyPrefix: mediaType === 'video' ? 'videos' : 'images',
          customConfig: config
        });
        if (permanentUrl) break;
      } catch (uploadErr) {
        if (attempt === 1) {
          await new Promise(r => setTimeout(r, 1500));
        }
      }
    }

    // 自动更新数据库中的记录为永久链接
    if (permanentUrl && taskId) {
      await prisma.imageTask.updateMany({
        where: {
          OR: [
            { taskId: taskId },
            { id: taskId }
          ]
        },
        data: {
          resultUrl: permanentUrl
        }
      });
      console.log(`[对象存储-入库] 任务 ${taskId} 数据库链接已平滑切换为永久链接`);
    }

    return permanentUrl;
  } catch (err: any) {
    console.warn(`[对象存储-异步转存告警] 任务 ${taskId} 转存失败 (不影响临时呈现):`, err.message);
    return null;
  }
}

/**
 * 测试对象存储连通性与写入权限
 */
export async function testStorageConnection(config: StorageConfig): Promise<{
  success: boolean;
  message?: string;
  testUrl?: string;
}> {
  try {
    const resolved = resolveStorageConfig(config);
    if (!resolved) {
      return { success: false, message: '配置不完整，请填写 Access Key ID、Secret 和 存储桶名称' };
    }

    const s3 = createS3Client(resolved);
    const testKey = `azhuo/health_check_${Date.now()}.txt`;
    const testBody = Buffer.from(`Azhuo Studio Cloud Storage Health Check - ${new Date().toISOString()}`);

    await s3.send(new PutObjectCommand({
      Bucket: resolved.bucketName,
      Key: testKey,
      Body: testBody,
      ContentType: 'text/plain'
    }));

    let testUrl = '';
    if (resolved.publicDomain) {
      testUrl = `${resolved.publicDomain}/${testKey}`;
    } else if (resolved.endpoint) {
      testUrl = `${resolved.endpoint}/${resolved.bucketName}/${testKey}`;
    }

    return {
      success: true,
      message: '🎉 存储桶连接与写入权限验证成功！',
      testUrl
    };
  } catch (error: any) {
    return {
      success: false,
      message: `连接失败: ${error.message || '网络连接超时或凭证无效'}`
    };
  }
}
