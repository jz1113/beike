import { resolveStorageRoot, toWorkspaceStorageKey } from './storagePaths';
import fs from 'node:fs';
import path from 'node:path';
import type { StorageConfig, StorageCategory } from './storage';
import { resolveStorageConfig, uploadBufferToStorage, buildStorageKey } from './storage';

function parseDataUrl(dataUrl: string): { contentType: string; buffer: Buffer } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
}

function saveBufferToLocalStorage(
  buffer: Buffer,
  contentType: string,
  category: StorageCategory = 'generated/images',
  customFilename?: string
): string {
  const root = resolveStorageRoot();

  let ext = 'png';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';
  else if (contentType.includes('webp')) ext = 'webp';
  else if (contentType.includes('mp4')) ext = 'mp4';

  const relKey = toWorkspaceStorageKey(buildStorageKey(category, ext, customFilename));
  const absPath = path.join(root, relKey);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, buffer);

  return `/storage/${relKey}`;
}

/**
 * 将二进制媒体持久化为可引用的路径（云存储优先，回退本地 storage 目录）
 */
export async function persistBufferToStorage(
  buffer: Buffer,
  contentType: string,
  options: {
    category?: StorageCategory;
    keyPrefix?: 'images' | 'videos' | StorageCategory;
    customConfig?: StorageConfig;
    filename?: string;
  } = {},
): Promise<string> {
  const category: StorageCategory =
    options.category ||
    (options.keyPrefix as StorageCategory) ||
    (contentType.includes('video') ? 'generated/videos' : 'generated/images');
  const config = resolveStorageConfig(options.customConfig);

  if (config?.persistResults) {
    try {
      return await uploadBufferToStorage(buffer, contentType, {
        category,
        customConfig: config,
        filename: options.filename,
      });
    } catch {
      /* fall through to local */
    }
  }

  return saveBufferToLocalStorage(buffer, contentType, category, options.filename);
}

/**
 * 将 data: URL 持久化为可引用的路径（云存储优先，回退本地 storage 目录）
 */
export async function persistDataUrlToStorage(
  dataUrl: string,
  options: {
    category?: StorageCategory;
    keyPrefix?: 'images' | 'videos' | StorageCategory;
    customConfig?: StorageConfig;
    filename?: string;
  } = {},
): Promise<string> {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    throw new Error('无效的 data URL');
  }

  const category: StorageCategory =
    options.category ||
    (options.keyPrefix as StorageCategory) ||
    (parsed.contentType.includes('video') ? 'generated/videos' : 'generated/images');
  const config = resolveStorageConfig(options.customConfig);

  if (config?.persistResults) {
    try {
      return await uploadBufferToStorage(parsed.buffer, parsed.contentType, {
        category,
        customConfig: config,
        filename: options.filename,
      });
    } catch {
      /* fall through to local */
    }
  }

  return saveBufferToLocalStorage(parsed.buffer, parsed.contentType, category, options.filename);
}
