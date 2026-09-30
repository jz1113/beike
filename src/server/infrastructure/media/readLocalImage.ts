import { MAX_PROXY_BYTES } from '../network/safeUrl';

export async function readLocalImage(file: string, signal?: AbortSignal): Promise<Buffer> {
  signal?.throwIfAborted();
  const fs = await import('node:fs');
  if ((await fs.promises.stat(file)).size > MAX_PROXY_BYTES) throw new Error('图片超过 25MB 大小限制');
  const stream = fs.createReadStream(file, { signal });
  const chunks: Buffer[] = []; let bytes = 0;
  try {
    for await (const chunk of stream) {
      signal?.throwIfAborted();
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > MAX_PROXY_BYTES) throw new Error('图片超过 25MB 大小限制');
      chunks.push(buffer);
    }
    return Buffer.concat(chunks, bytes);
  } finally { stream.destroy(); }
}

