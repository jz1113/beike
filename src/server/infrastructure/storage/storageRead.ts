import { Readable } from 'node:stream';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { guessMediaDownloadMime } from '@shared/domain/media/mediaDownload';
import { createS3Client, resolveStorageConfig, type StorageConfig } from './storage';

/** Private media exports consume the SDK body as a stream, never as a full Buffer. */
export async function getObjectStreamFromStorage(
  key: string,
  signal?: AbortSignal,
  customConfig?: StorageConfig,
): Promise<{ body: ReadableStream<Uint8Array>; contentType: string; contentLength?: number } | null> {
  const config = resolveStorageConfig(customConfig);
  if (!config || !config.bucketName) return null;
  try {
    const result = await createS3Client(config).send(new GetObjectCommand({
      Bucket: config.bucketName,
      Key: key.replace(/^\/+/, ''),
    }), { abortSignal: signal });
    if (!result.Body) return null;
    const contentType = result.ContentType && result.ContentType !== 'application/octet-stream'
      ? result.ContentType : guessMediaDownloadMime(key);
    const body = result.Body instanceof Readable
      ? Readable.toWeb(result.Body, { strategy: { highWaterMark: 64 * 1024, size: (chunk: Uint8Array) => chunk.byteLength } }) as ReadableStream<Uint8Array>
      : result.Body.transformToWebStream();
    return { body, contentType, contentLength: result.ContentLength };
  } catch {
    return null;
  }
}
