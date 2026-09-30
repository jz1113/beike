export { deleteObjectsFromStorage } from './storageCleanup';
import { getKnownManagedStorageKey } from './storageOwnership';
import { resolveStorageConfiguration, storageClientOptions, type StorageConfig } from './storageConfiguration';
import { testResolvedStorageConnection } from './storageConnectionTest';
import { isPermanentStorageUrl } from './storageUrlPermanence';
export { inferStorageRegion, type StorageConfig } from './storageConfiguration';
import {persistRemoteLocal} from './persistRemoteLocal';
import { extractKnownStorageKey } from './storageUrl';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import sharp from 'sharp';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from '../database/prisma';
import { getWorkspaceId, runWithWorkspace } from '../workspace/workspaceContext';
import { supplementEnvFromFile } from '../config/desktopEnvFile';
import { guessMediaDownloadMime } from '@shared/domain/media/mediaDownload';

export type StorageCategory =
  | 'products'           // 1. 商品图片 (azhuo/products/YYYYMM/azhuo_prod_...)
  | 'external'           // 2. 外站采集链接素材 (azhuo/external/YYYYMM/azhuo_ext_...)
  | 'generated/images'   // 3. AI 生成图片 (azhuo/generated/images/YYYYMM/azhuo_gen_img_...)
  | 'generated/videos'   // 3. AI 生成视频 (azhuo/generated/videos/YYYYMM/azhuo_gen_vid_...)
  | 'images'             // 兼容别名 -> generated/images
  | 'videos'             // 兼容别名 -> generated/videos
  | 'assets'             // 风格拆解素材 (azhuo/assets/YYYYMM/azhuo_asset_...)
  | 'refs';              // 模型参考文件 (azhuo/refs/YYYYMM/azhuo_ref_...)，短期中转

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
  } else if (category === 'refs') {
    folder = 'refs';
    filePrefix = 'ref';
  }

  const filename = customFilename || `azhuo_${filePrefix}_${Date.now()}_${randomSuffix}.${ext}`;
  return `azhuo/${folder}/${yearMonth}/${filename}`;
}

/**
 * 从请求体或 x-storage-config 读取存储配置。
 * GET 轮询没有 body，客户端把同一份配置放在请求头里。
 */
export function extractStorageConfigFromRequest(req: unknown, body?: { storageConfig?: StorageConfig }): StorageConfig | undefined {
  if (body?.storageConfig) return body.storageConfig;
  const headers = req && typeof req === 'object' && 'headers' in req
    ? (req as { headers?: { get?: (name: string) => string | null } }).headers
    : undefined;
  const raw = headers?.get?.('x-storage-config');
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as StorageConfig;
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** 获取生效配置，同时保留明确关闭与明确清空的设置。 */
export function resolveStorageConfig(customConfig?: StorageConfig): StorageConfig | null {
  ensureDesktopEnvLoaded();
  return resolveStorageConfiguration(customConfig, process.env);
}

/**
 * 判断 URL 是否属于当前系统配置的对象存储，并提取对应的对象 Key（如 azhuo/generated/images/...）
 */
export function extractStorageKeyFromUrl(
  url: string,
  bucketOrConfig?: string | StorageConfig
): string | null {
  if (!url || typeof url !== 'string') return null;
  if (!/^https?:\/\//i.test(url)) return extractKnownStorageKey(url);
  const config = typeof bucketOrConfig === 'object'
    ? resolveStorageConfig(bucketOrConfig)
    : resolveStorageConfig();
  return extractKnownStorageKey(url, typeof bucketOrConfig === 'string' ? { ...config, bucketName: bucketOrConfig } : config);
}

/** Strict managed-object identity; signed query parameters do not change ownership. */
export function getManagedStorageKey(rawUrl: string, customConfig?: StorageConfig): string | null {
  return getKnownManagedStorageKey(rawUrl, resolveStorageConfig(customConfig));
}

/**
 * 直接通过 S3Client GetObjectCommand 读取对象存储中的私有文件流
 */
export async function getObjectBufferFromStorage(
  key: string,
  customConfig?: StorageConfig,
  options: { quiet?: boolean; signal?: AbortSignal; maxBytes?: number } = {},
): Promise<{ buffer: Buffer; contentType: string } | null> {
  options.signal?.throwIfAborted();
  const config = resolveStorageConfig(customConfig);
  if (!config || !config.bucketName) return null;
  const maxBytes = options.maxBytes ?? 100 * 1024 * 1024;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('对象读取大小限制无效');
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000);
  type ObjectBody = AsyncIterable<Uint8Array> & { destroy?: () => void; getReader?: () => ReadableStreamDefaultReader<Uint8Array>; cancel?: () => Promise<void> };
  let body: ObjectBody | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const close = () => { body?.destroy?.(); void (reader?.cancel() || body?.cancel?.())?.catch(() => undefined); };
  try {
    const cleanKey = key.replace(/^\/+/, '');
    if (!cleanKey.startsWith('azhuo/') || /[\x00-\x1f\\%?#]/.test(cleanKey) || cleanKey.split('/').some(part => !part || part === '.' || part === '..')) return null;
    const res = await createS3Client(config).send(new GetObjectCommand({ Bucket: config.bucketName, Key: cleanKey }), { abortSignal: signal });
    body = res.Body as ObjectBody | undefined;
    signal.throwIfAborted();
    if (!body) return null;
    if (Number(res.ContentLength) > maxBytes) throw new Error('对象超过读取大小限制');
    const chunks: Buffer[] = [];
    let bytes = 0;
    const append = (chunk: Uint8Array) => {
      signal.throwIfAborted();
      bytes += chunk.byteLength;
      if (bytes > maxBytes) throw new Error('对象超过读取大小限制');
      chunks.push(Buffer.from(chunk));
    };
    signal.addEventListener('abort', close, { once: true });
    if (body.getReader) {
      reader = body.getReader();
      while (true) { const chunk = await reader.read(); if (chunk.done) break; append(chunk.value); }
    } else if (body[Symbol.asyncIterator]) {
      for await (const chunk of body) append(chunk);
    } else throw new Error('对象响应没有可读取的流');
    signal.throwIfAborted();
    let contentType = res.ContentType;
    if (!contentType || contentType === 'application/octet-stream') {
      contentType = guessMediaDownloadMime(cleanKey);
    }
    return { buffer: Buffer.concat(chunks, bytes), contentType };
  } catch {
    signal.throwIfAborted();
    if (!options.quiet) console.warn('[对象存储-直读] 读取失败或资源超过大小限制');
    return null;
  } finally {
    signal.removeEventListener('abort', close);
    close();
    reader?.releaseLock();
  }
}

/**
 * 创建 S3Client 实例
 */
export function createS3Client(config: StorageConfig): S3Client {
  return new S3Client(storageClientOptions(config));
}

export function isAlreadyPermanentUrl(url: string, publicDomain?: string): boolean {
  return isPermanentStorageUrl(url, publicDomain);
}

const OBJECT_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export function thumbStorageKey(key: string): string {
  return key.replace(/(\.[^./]+)$/, '_thumb.webp');
}

function filenameWithExt(filename: string | undefined, ext: string): string | undefined {
  if (!filename) return undefined;
  const base = filename.replace(/\.[^.]+$/, '');
  return `${base}.${ext}`;
}

async function prepareStoredImage(buffer: Buffer): Promise<{ buffer: Buffer; thumb: Buffer } | null> {
  try {
    const webp = await sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
    const thumb = await sharp(webp)
      .resize({ width: 480, withoutEnlargement: true, fit: 'inside' })
      .webp({ quality: 80 })
      .toBuffer();
    return { buffer: webp, thumb };
  } catch (err) {
    console.warn('[对象存储] 图片压缩失败，改为上传原文件:', err);
    return null;
  }
}

async function putPrivateObject(
  config: StorageConfig,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const s3 = createS3Client(config);
  await s3.send(new PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: OBJECT_CACHE_CONTROL,
  }));
}

/**
 * 将 Buffer 上传至对象存储。对象保持私有，图片会压成 WebP 并另存缩略图。
 */
export async function uploadBufferToStorage(
  buffer: Buffer,
  contentType: string,
  options: {
    category?: StorageCategory;
    keyPrefix?: 'images' | 'videos' | 'assets' | StorageCategory;
    customConfig?: StorageConfig;
    filename?: string;
    withThumb?: boolean;
  } = {},
): Promise<string> {
  const config = resolveStorageConfig(options.customConfig);
  if (!config) {
    throw new Error('未配置对象存储凭证或配置不完整');
  }

  const isVideo = options.category === 'generated/videos' || options.keyPrefix === 'videos' || contentType.includes('video') || contentType.includes('mp4');
  let body = buffer;
  let storedType = contentType;
  let ext = isVideo ? 'mp4' : 'png';
  let thumb: Buffer | null = null;

  if (!isVideo) {
    const prepared = await prepareStoredImage(buffer);
    if (prepared) {
      body = prepared.buffer;
      thumb = prepared.thumb;
      storedType = 'image/webp';
      ext = 'webp';
    } else if (contentType.includes('jpeg') || contentType.includes('jpg')) {
      ext = 'jpg';
    } else if (contentType.includes('webp')) {
      ext = 'webp';
    }
  }

  const category = options.category || (options.keyPrefix as StorageCategory) || (isVideo ? 'generated/videos' : 'generated/images');
  const key = buildStorageKey(category, ext, filenameWithExt(options.filename, ext));
  await putPrivateObject(config, key, body, storedType);
  if (thumb && options.withThumb !== false && category !== 'refs') {
    await putPrivateObject(config, thumbStorageKey(key), thumb, 'image/webp').catch((err) => {
      console.warn('[对象存储] 缩略图上传失败:', err);
    });
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
  const permanentUrl = await uploadBufferToStorage(buffer, contentType, options);

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
  const workspaceId = getWorkspaceId();
  try {
    const config = resolveStorageConfig(customConfig);
    if (tempUrl.startsWith('/storage/')) return tempUrl;

    let category: StorageCategory = 'generated/images';
    const isVideo = mediaType === 'video' || mediaType === 'generated/videos' || mediaType === 'videos';
    if (isVideo) {
      category = 'generated/videos';
    } else if (mediaType === 'image' || mediaType === 'generated/images' || mediaType === 'images') {
      category = 'generated/images';
    } else {
      return null;
    }

    if (!config?.persistResults) {
      return persistRemoteLocal(tempUrl, isVideo);
    }
    if (isAlreadyPermanentUrl(tempUrl, config.publicDomain)) {
      return tempUrl;
    }

    let permanentUrl: string | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
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
      const persistMeta = () => prisma.imageTask.updateMany({
        where: { OR: [{ taskId }, { id: taskId }], resultUrl: tempUrl },
        data: { resultUrl: permanentUrl },
      }).catch(() => { /* Keep the durable file URL even if task metadata is temporarily unavailable. */ });
      await (workspaceId ? runWithWorkspace(workspaceId, persistMeta) : persistMeta());
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
export async function testStorageConnection(config: StorageConfig) {
  return testResolvedStorageConnection(resolveStorageConfig({ ...config, persistResults: false }));
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
