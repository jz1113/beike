import {persistRemoteLocal} from './persistRemoteLocal';
import { resolveStorageRoot } from './storagePaths';
import fs from 'node:fs';
import { resolveDeletableStoragePath } from './safeStoragePath';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectsCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from './prisma';
import { formatUserError } from '@beike/domain/upstreamErrors';
import { supplementEnvFromFile } from './desktopEnvFile';

export type StorageCategory =
  | 'products'           // 1. 商品图片 (azhuo/products/YYYYMM/azhuo_prod_...)
  | 'external'           // 2. 外站采集链接素材 (azhuo/external/YYYYMM/azhuo_ext_...)
  | 'generated/images'   // 3. AI 生成图片 (azhuo/generated/images/YYYYMM/azhuo_gen_img_...)
  | 'generated/videos'   // 3. AI 生成视频 (azhuo/generated/videos/YYYYMM/azhuo_gen_vid_...)
  | 'images'             // 兼容别名 -> generated/images
  | 'videos'             // 兼容别名 -> generated/videos
  | 'assets';            // 风格拆解素材 (azhuo/assets/YYYYMM/azhuo_asset_...)

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
 * 自动从桌面数据目录 .env 文件补齐未加载的对象存储环境变量
 */
function ensureDesktopEnvLoaded(): void {
  if (process.env.S3_BUCKET_NAME && process.env.S3_ACCESS_KEY_ID) return;
  const envPath = process.env.AZHUO_DATA_DIR
    ? path.join(process.env.AZHUO_DATA_DIR, '.env')
    : (process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library/Application Support/com.azhuo.workbench/.env')
        : (process.platform === 'win32'
            ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData/Roaming'), 'com.azhuo.workbench/.env')
            : path.join(os.homedir(), '.config/com.azhuo.workbench/.env')));
  supplementEnvFromFile(envPath);
}


/**
 * 标准化对象存储路径构建器
 * 严格按照业务类别切分独立目录：
 * 1. 商品图片 -> azhuo/products/YYYYMM/azhuo_prod_...
 * 2. 外站采集 -> azhuo/external/YYYYMM/azhuo_ext_...
 * 3. 生成图片 -> azhuo/generated/images/YYYYMM/azhuo_gen_img_...
 * 4. 生成视频 -> azhuo/generated/videos/YYYYMM/azhuo_gen_vid_...
 */
export function buildStorageKey(
  category: StorageCategory = 'generated/images',
  ext: string = 'png',
  customFilename?: string
): string {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const randomSuffix = Math.random().toString(36).slice(2, 8);

  let folder = 'generated/images';
  let filePrefix = 'gen_img';

  if (category === 'products') {
    folder = 'products';
    filePrefix = 'prod';
  } else if (category === 'external') {
    folder = 'external';
    filePrefix = 'ext';
  } else if (category === 'generated/videos' || category === 'videos') {
    folder = 'generated/videos';
    filePrefix = 'gen_vid';
  } else if (category === 'generated/images' || category === 'images') {
    folder = 'generated/images';
    filePrefix = 'gen_img';
  } else if (category === 'assets') {
    folder = 'assets';
    filePrefix = 'asset';
  }

  const filename = customFilename || `azhuo_${filePrefix}_${Date.now()}_${randomSuffix}.${ext}`;
  return `azhuo/${folder}/${yearMonth}/${filename}`;
}

/**
 * 从 Request 或请求 Body 中提取存储配置（仅 body.storageConfig；不再读取 x-storage-config）
 */
export function extractStorageConfigFromRequest(_req: unknown, body?: { storageConfig?: StorageConfig }): StorageConfig | undefined {
  if (body?.storageConfig) return body.storageConfig;
  return undefined;
}

/**
 * 自动根据存储提供商与 Endpoint 推导匹配的 Region，避免 AWS Signature V4 签名错配
 */
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
  return 'us-east-1';
}

/**
 * 获取生效的存储配置 (优先从自定义传参，其次环境变量)
 */
export function resolveStorageConfig(customConfig?: StorageConfig): StorageConfig | null {
  ensureDesktopEnvLoaded();

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

  // 自动根据服务商与 Endpoint 推导匹配的 Region，避免 AWS Signature V4 签名错配
  const region = inferStorageRegion(provider, endpoint, customConfig?.region || process.env.S3_REGION);

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

/**
 * 判断 URL 是否属于当前系统配置的对象存储，并提取对应的对象 Key（如 azhuo/generated/images/...）
 */
export function extractStorageKeyFromUrl(
  url: string,
  bucketOrConfig?: string | StorageConfig
): string | null {
  if (!url || typeof url !== 'string') return null;

  // 1. 本地相对路径: /storage/azhuo/...
  if (url.startsWith('/storage/')) {
    const candidate = url.replace(/^\/storage\//, '').trim();
    return candidate.startsWith('azhuo/') ? candidate : null;
  }
  if (url.startsWith('/azhuo/') || url.startsWith('azhuo/')) {
    return url.replace(/^\/+/, '');
  }

  const config = typeof bucketOrConfig === 'object' 
    ? resolveStorageConfig(bucketOrConfig)
    : resolveStorageConfig();
  const explicitBucket = typeof bucketOrConfig === 'string' ? bucketOrConfig : config?.bucketName;

  try {
    const parsed = new URL(url);
    let pathname = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');

    // 若为 path-style URL (形如 https://endpoint/bucketName/azhuo/...)
    if (explicitBucket && pathname.startsWith(`${explicitBucket}/`)) {
      pathname = pathname.slice(explicitBucket.length + 1);
    }

    if (pathname.startsWith('azhuo/')) {
      return pathname;
    }

    const azhuoIndex = pathname.indexOf('azhuo/');
    if (azhuoIndex !== -1) {
      return pathname.slice(azhuoIndex);
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * 直接通过 S3Client GetObjectCommand 读取对象存储中的私有文件流
 */
export async function getObjectBufferFromStorage(
  key: string,
  customConfig?: StorageConfig
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const config = resolveStorageConfig(customConfig);
  if (!config || !config.bucketName) return null;

  try {
    const s3 = createS3Client(config);
    const cleanKey = key.replace(/^\/+/, '');
    const res = await s3.send(new GetObjectCommand({
      Bucket: config.bucketName,
      Key: cleanKey,
    }));

    if (!res.Body) return null;
    const bytes = await (res.Body as any).transformToByteArray();
    const buffer = Buffer.from(bytes);

    let contentType = res.ContentType;
    if (!contentType || contentType === 'application/octet-stream') {
      const lowerKey = cleanKey.toLowerCase();
      if (lowerKey.endsWith('.png')) contentType = 'image/png';
      else if (lowerKey.endsWith('.jpg') || lowerKey.endsWith('.jpeg')) contentType = 'image/jpeg';
      else if (lowerKey.endsWith('.webp')) contentType = 'image/webp';
      else if (lowerKey.endsWith('.mp4')) contentType = 'video/mp4';
      else if (lowerKey.endsWith('.svg')) contentType = 'image/svg+xml';
      else contentType = 'image/png';
    }

    return { buffer, contentType };
  } catch (err: any) {
    console.warn(`[对象存储-直读] 读取 ${key} 失败:`, err?.message || err);
    return null;
  }
}

/**
 * 创建 S3Client 实例
 */
export function createS3Client(config: StorageConfig): S3Client {
  let endpoint = config.endpoint;
  if (config.provider === 'r2' && config.accountId && !endpoint) {
    endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;
  }

  const region = inferStorageRegion(config.provider, endpoint, config.region);

  return new S3Client({
    region,
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
 * 将 Buffer 上传至对象存储，返回永久公开链接
 */
export async function uploadBufferToStorage(
  buffer: Buffer,
  contentType: string,
  options: {
    category?: StorageCategory;
    keyPrefix?: 'images' | 'videos' | 'assets' | StorageCategory;
    customConfig?: StorageConfig;
    filename?: string;
  } = {},
): Promise<string> {
  const config = resolveStorageConfig(options.customConfig);
  if (!config) {
    throw new Error('未配置对象存储凭证或配置不完整');
  }

  let ext = 'png';
  if (options.category === 'generated/videos' || options.keyPrefix === 'videos' || contentType.includes('mp4')) {
    ext = 'mp4';
  } else if (contentType.includes('jpeg') || contentType.includes('jpg')) {
    ext = 'jpg';
  } else if (contentType.includes('webp')) {
    ext = 'webp';
  }

  const category = options.category || (options.keyPrefix as StorageCategory) || (ext === 'mp4' ? 'generated/videos' : 'generated/images');
  const key = buildStorageKey(category, ext, options.filename);

  const s3 = createS3Client(config);
  try {
    await s3.send(new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: 'public-read',
    }));
  } catch (aclErr: any) {
    // 若存储桶禁用对象级 ACL（如设置了 Bucket Owner Enforced），降级为标准上传
    if (/AccessControlListNotSupported|InvalidArgument|InvalidACL|NotImplemented/i.test(aclErr?.message || '')) {
      await s3.send(new PutObjectCommand({
        Bucket: config.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }));
    } else {
      throw aclErr;
    }
  }

  return buildPermanentUrl(config, key);
}

/**
 * 根据存储配置和对象 Key 组装永久公开访问 URL
 */
function buildPermanentUrl(config: StorageConfig, key: string): string {
  const normalizedPublicDomain = config.publicDomain?.trim().replace(/\/+$/, '');
  if (normalizedPublicDomain) {
    return `${normalizedPublicDomain}/${key}`;
  }
  if (config.provider === 'r2' && config.accountId) {
    return `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucketName}/${key}`;
  }
  if (config.endpoint) {
    if (config.provider === 'oss') {
      const cleanEndpoint = config.endpoint.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
      return `https://${config.bucketName}.${cleanEndpoint}/${key}`;
    }
    return `${config.endpoint}/${config.bucketName}/${key}`;
  }
  return `https://${config.bucketName}.s3.amazonaws.com/${key}`;
}

/**
 * 从远程临时 URL 流式下载并上传至对象存储，返回永久公开链接
 */
export async function uploadRemoteMediaToStorage(
  tempUrl: string, 
  options: { 
    category?: StorageCategory;
    keyPrefix?: 'images' | 'videos' | 'assets' | StorageCategory;
    customConfig?: StorageConfig;
    filename?: string;
  } = {}
): Promise<string> {
  // 严格限定云端存储保存范围：仅允许 AI 生成的图片与视频 (generated/images, generated/videos)
  // 商品采集 (products) 和外站采集 (external) 等严禁上传至对象存储，直接返回原始直链
  const rawCat = options.category || (options.keyPrefix as StorageCategory);
  if (rawCat === 'products' || rawCat === 'external' || rawCat === 'assets') {
    return tempUrl;
  }

  const config = resolveStorageConfig(options.customConfig);
  if (!config) {
    throw new Error('未配置对象存储凭证或配置不完整');
  }

  // 1. 抓取临时多媒体资源（60 秒超时，防止慢网络或大文件下载无限挂起）
  console.log(`[对象存储-转存] 开始抓取临时资源: ${tempUrl.slice(0, 80)}...`);
  const response = await fetch(tempUrl, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) {
    throw new Error(`抓取临时多媒体失败 (HTTP ${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = response.headers.get('content-type') || (options.category === 'generated/videos' || options.keyPrefix === 'videos' ? 'video/mp4' : 'image/png');

  // 2. 解析文件后缀
  let ext = 'png';
  if (options.category === 'generated/videos' || options.keyPrefix === 'videos' || contentType.includes('mp4') || tempUrl.includes('.mp4')) {
    ext = 'mp4';
  } else if (contentType.includes('jpeg') || contentType.includes('jpg') || tempUrl.includes('.jpg') || tempUrl.includes('.jpeg')) {
    ext = 'jpg';
  } else if (contentType.includes('webp') || tempUrl.includes('.webp')) {
    ext = 'webp';
  }

  // 3. 构建时间戳与分类规范路径 (如 azhuo/generated/images/202609/azhuo_gen_img_1788xxx.jpg)
  const category = options.category || (options.keyPrefix as StorageCategory) || (ext === 'mp4' ? 'generated/videos' : 'generated/images');
  const key = buildStorageKey(category, ext, options.filename);

  // 4. 上传至对象存储桶
  const s3 = createS3Client(config);
  try {
    await s3.send(new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: 'public-read',
    }));
  } catch (aclErr: any) {
    if (/AccessControlListNotSupported|InvalidArgument|InvalidACL|NotImplemented/i.test(aclErr?.message || '')) {
      await s3.send(new PutObjectCommand({
        Bucket: config.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType
      }));
    } else {
      throw aclErr;
    }
  }

  // 5. 组装永久公开访问链接
  const permanentUrl = buildPermanentUrl(config, key);

  console.log(`[对象存储-转存] 成功转存至永久链接: ${permanentUrl}`);
  return permanentUrl;
}

/**
 * ⚡ 后台非阻塞异步转存与数据库自动更新服务
 */
export async function persistMediaUrl(
  taskId: string, 
  tempUrl: string, 
  mediaType: 'image' | 'video' | StorageCategory,
  customConfig?: StorageConfig
): Promise<string | null> {
  try {
    const config = resolveStorageConfig(customConfig);
    if (tempUrl.startsWith('/storage/')) return tempUrl;
    if (config?.enabled && isAlreadyPermanentUrl(tempUrl, config.publicDomain)) {
      return tempUrl;
    }

    // 用户规则：云端存储只保存 AI 生成的图视频内容，商品采集和外站采集都不保存
    let category: StorageCategory = 'generated/images';
    if (mediaType === 'video' || mediaType === 'generated/videos' || mediaType === 'videos') {
      category = 'generated/videos';
    } else if (mediaType === 'image' || mediaType === 'generated/images' || mediaType === 'images') {
      category = 'generated/images';
    } else {
      // 其它类型（如 products、external、assets）一律禁止转存到云端存储
      return null;
    }

    let permanentUrl: string | null = null;
    for (let attempt = 1; config?.enabled && attempt <= 2; attempt++) {
      try {
        permanentUrl = await uploadRemoteMediaToStorage(tempUrl, {
          category,
          customConfig: config
        });
        if (permanentUrl) break;
      } catch {
        if (attempt === 1) {
          await new Promise(r => setTimeout(r, 1500));
        }
      }
    }

    if (!permanentUrl) permanentUrl=await persistRemoteLocal(tempUrl,category==='generated/videos');

    // 自动更新数据库中的记录为永久链接
    if (permanentUrl && taskId) {
      await prisma.imageTask.updateMany({
        where: { OR: [{ taskId }, { id: taskId }], resultUrl: tempUrl },
        data: { resultUrl: permanentUrl },
      }).catch(() => { /* Keep the durable file URL even if task metadata is temporarily unavailable. */ });
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
      if (resolved.provider === 'oss') {
        const cleanEndpoint = resolved.endpoint.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        testUrl = `https://${resolved.bucketName}.${cleanEndpoint}/${testKey}`;
      } else {
        testUrl = `${resolved.endpoint}/${resolved.bucketName}/${testKey}`;
      }
    }

    return {
      success: true,
      message: '🎉 存储桶连接与写入权限验证成功！',
      testUrl
    };
  } catch (error: any) {
    return {
      success: false,
      message: `连接失败: ${formatUserError(error, '网络连接超时或凭证无效')}`
    };
  }
}


/**
 * ⚡ 联动物理删除：从阿里云 OSS / S3 及本地磁盘彻底清除关联的媒体文件
 * 确保程序内删除与云端对象存储物理同步，避免沉没垃圾文件
 */
export async function deleteObjectsFromStorage(
  urls: string[],
  customConfig?: StorageConfig
): Promise<{ deleted: number; errors: number }> {
  if (!Array.isArray(urls) || urls.length === 0) {
    return { deleted: 0, errors: 0 };
  }

  const config = resolveStorageConfig(customConfig);
  const keysToDelete = new Set<string>();
  const localPathsToDelete = new Set<string>();

  const localRoot = resolveStorageRoot();

  for (const rawUrl of urls) {
    if (!rawUrl || typeof rawUrl !== 'string') continue;

    const key = extractStorageKeyFromUrl(rawUrl, config?.bucketName);
    if (key) {
      keysToDelete.add(key);
    }

    // 若属于本地磁盘保存的文件
    if (localRoot && rawUrl.startsWith('/storage/azhuo/')) {
      const target = resolveDeletableStoragePath(localRoot, rawUrl);
      if (target) localPathsToDelete.add(target);
    }
  }

  let deletedCount = 0;
  let errorCount = 0;

  // 1. 物理删除本地磁盘媒体文件（异步执行，避免同步阻塞事件循环）
  await Promise.all(
    Array.from(localPathsToDelete).map(async (absPath) => {
      try {
        await fs.promises.unlink(absPath);
        deletedCount++;
      } catch (err: any) {
        if (err?.code !== 'ENOENT') {
          errorCount++;
          console.warn(`[存储物理删除] 本地文件删除失败: ${absPath}`, err);
        }
      }
    })
  );

  // 2. 物理删除云端对象存储（阿里云 OSS / R2 / S3）
  if (config && config.enabled && keysToDelete.size > 0) {
    try {
      const s3 = createS3Client(config);
      const keysArray = Array.from(keysToDelete);

      // S3 DeleteObjectsCommand 批次最多支持 1000 个 Key
      const BATCH_SIZE = 1000;
      for (let i = 0; i < keysArray.length; i += BATCH_SIZE) {
        const batch = keysArray.slice(i, i + BATCH_SIZE);
        try {
          await s3.send(new DeleteObjectsCommand({
            Bucket: config.bucketName,
            Delete: {
              Objects: batch.map(Key => ({ Key })),
              Quiet: true
            }
          }));
          deletedCount += batch.length;
          console.log(`[对象存储-联动删除] 成功从存储桶 ${config.bucketName} 物理清除 ${batch.length} 个对象`);
        } catch (s3BatchErr) {
          console.warn('[对象存储-联动删除] 批量删除遇到异常，降级逐个单删:', s3BatchErr);
          for (const key of batch) {
            try {
              await s3.send(new DeleteObjectCommand({
                Bucket: config.bucketName,
                Key: key
              }));
              deletedCount++;
            } catch {
              errorCount++;
            }
          }
        }
      }
    } catch (s3ClientErr) {
      console.error('[对象存储-联动删除] S3 客户端操作失败:', s3ClientErr);
      errorCount += keysToDelete.size;
    }
  }

  return { deleted: deletedCount, errors: errorCount };
}

/**
 * 🌟 为内部对象存储资源生成带授权签名的临时只读 URL (Presigned URL)
 * 彻底解决第三方 AI 绘图接口在拉取私有 OSS/S3 参考图时因 403 AccessDenied 导致生图失败的问题
 */
export function getPresignedStorageUrl(
  urlOrKey: string,
  expiresInSeconds = 7200,
  customConfig?: StorageConfig
): string | null {
  if (!urlOrKey || typeof urlOrKey !== 'string') return null;

  // 若已经包含签名参数，直接返回原链接避免重复签名
  if (
    urlOrKey.includes('OSSAccessKeyId=') ||
    urlOrKey.includes('X-Amz-Signature=') ||
    urlOrKey.includes('q-signature=')
  ) {
    return urlOrKey;
  }

  const config = resolveStorageConfig(customConfig);
  if (!config || !config.enabled || !config.bucketName) return null;

  const key = extractStorageKeyFromUrl(urlOrKey, config.bucketName);
  if (!key) return null;

  const cleanKey = key.replace(/^\/+/, '');
  const expires = Math.floor(Date.now() / 1000) + Math.max(60, expiresInSeconds);

  // 1. 阿里云 OSS: 按照标准 OSS V1 HMAC-SHA1 签名算法生成 Presigned URL
  if (config.provider === 'oss' && config.accessKeyId && config.secretAccessKey) {
    try {
      const stringToSign = `GET\n\n\n${expires}\n/${config.bucketName}/${cleanKey}`;
      const signature = createHmac('sha1', config.secretAccessKey)
        .update(stringToSign)
        .digest('base64');

      const cleanEndpoint = (config.endpoint || 'https://oss-cn-beijing.aliyuncs.com')
        .replace(/^https?:\/\//i, '')
        .replace(/\/+$/, '');
      const baseUrl = `https://${config.bucketName}.${cleanEndpoint}/${cleanKey}`;
      return `${baseUrl}?OSSAccessKeyId=${encodeURIComponent(config.accessKeyId)}&Expires=${expires}&Signature=${encodeURIComponent(signature)}`;
    } catch (err) {
      console.warn('[对象存储-预签名] 阿里云 OSS 预签名生成失败:', err);
    }
  }

  // 2. 若配置了公开访问域名 (例如绑定了 CDN 或公共域名)，组装标准公开访问 URL
  if (config.publicDomain) {
    return `${config.publicDomain.trim().replace(/\/+$/, '')}/${cleanKey}`;
  }

  return null;
}

