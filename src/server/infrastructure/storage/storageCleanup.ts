import fs from 'node:fs';
import { S3Client, DeleteObjectsCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { resolveStorageRoot } from './storagePaths';
import { resolveDeletableStoragePath } from './safeStoragePath';
import { resolveStorageConfiguration, storageClientOptions, type StorageConfig } from './storageConfiguration';
import { getKnownManagedStorageKey } from './storageOwnership';

/**
 * ⚡ 联动物理删除：从阿里云 OSS / S3 及本地磁盘彻底清除关联的媒体文件
 * 确保程序内删除与云端对象存储物理同步，避免沉没垃圾文件
 */
export async function cleanupStorageObjects(
  urls: string[],
  config?: StorageConfig | null
): Promise<{ deleted: number; errors: number }> {
  if (!Array.isArray(urls) || urls.length === 0) {
    return { deleted: 0, errors: 0 };
  }

  const keysToDelete = new Set<string>();
  const localPathsToDelete = new Set<string>();

  const localRoot = resolveStorageRoot();

  for (const rawUrl of urls) {
    if (!rawUrl || typeof rawUrl !== 'string') continue;

    const key = getKnownManagedStorageKey(rawUrl, config);
    if (key) {
      keysToDelete.add(key);
    }

    // 若属于本地磁盘保存的文件
    if (localRoot && rawUrl.startsWith('/storage/azhuo/')) {
      const target = resolveDeletableStoragePath(localRoot, rawUrl.split(/[?#]/)[0]);
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
      } catch (err: unknown) {
        if (!(err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT')) {
          errorCount++;
          console.warn(`[存储物理删除] 本地文件删除失败: ${absPath}`, err);
        }
      }
    })
  );

  // 2. 物理删除云端对象存储（阿里云 OSS / R2 / S3）
  if (config && config.enabled && keysToDelete.size > 0) {
    try {
      const s3 = new S3Client(storageClientOptions(config));
      const keysArray = Array.from(keysToDelete);

      // S3 DeleteObjectsCommand 批次最多支持 1000 个 Key
      const BATCH_SIZE = 1000;
      for (let i = 0; i < keysArray.length; i += BATCH_SIZE) {
        const batch = keysArray.slice(i, i + BATCH_SIZE);
        try {
          const result = await s3.send(new DeleteObjectsCommand({
            Bucket: config.bucketName,
            Delete: {
              Objects: batch.map(Key => ({ Key })),
              Quiet: true
            }
          }));
          const failedKeys = new Set((result.Errors || []).map((error) => error.Key).filter(Boolean));
          const unnamedErrors = (result.Errors || []).filter((error) => !error.Key).length;
          const failedCount = Math.min(batch.length, failedKeys.size + unnamedErrors);
          deletedCount += batch.length - failedCount;
          errorCount += failedCount;
          if (failedCount > 0) console.warn(`[对象存储-联动删除] ${failedCount} 个对象未能删除`);
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

/** Preserve the public cleanup interface for callers using either storage module. */
export function deleteObjectsFromStorage(urls: string[], customConfig?: StorageConfig) {
  return cleanupStorageObjects(urls, resolveStorageConfiguration(customConfig, process.env));
}
