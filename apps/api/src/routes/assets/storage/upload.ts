import { randomUUID } from 'node:crypto';
import { readJsonBody } from '../../../core/validate';
import { jsonResponse } from '../../../core/http';
import { persistBufferToStorage, persistDataUrlToStorage } from '@beike/server-kit/persistDataUrl';
import type { StorageCategory, StorageConfig } from '@beike/server-kit/storage';
import { formatUserError } from '@beike/domain/upstreamErrors';

/**
 * POST /api/assets/storage/upload
 * 接收多媒体文件（图片切片、商品图、生成资产等）持久化上传至云端对象存储（阿里云 OSS / R2 等）或本地回退存储
 * 返回永久在线公开链接
 */
export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') || '';
    const urls: string[] = [];

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const category = (form.get('category') as StorageCategory) || 'generated/images';
      let customConfig: StorageConfig | undefined;
      const rawConfig = form.get('customConfig');
      if (typeof rawConfig === 'string') {
        try {
          customConfig = JSON.parse(rawConfig);
        } catch {
          /* ignore */
        }
      }

      // 提取文件列表
      const files: File[] = [];
      for (const value of form.values()) {
        if (value instanceof File) {
          files.push(value);
        }
      }

      if (files.length === 0) {
        return jsonResponse({ success: false, error: '未接收到待上传的文件' }, 400);
      }

      for (const file of files) {
        const arrayBuf = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        const extensions: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska' };
        Object.assign(extensions, { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac' });
        const originalExtension = file.name.split('.').pop()?.toLowerCase() || '';
        const mime = (file.type && file.type !== 'application/octet-stream' ? file.type : '') || extensions[originalExtension] || 'application/octet-stream';
        const extension = Object.keys(extensions).find((key) => extensions[key] === mime) || 'bin';
        const permanentUrl = await persistBufferToStorage(buffer, mime, {
          category,
          customConfig,
          filename: `${randomUUID()}.${extension}`,
        });
        urls.push(permanentUrl);
      }
    } else {
      const body = await readJsonBody(req, {});
      const category = (body.category as StorageCategory) || 'generated/images';
      const customConfig: StorageConfig | undefined = body.customConfig;
      
      const rawDataUrls: string[] = [];
      if (typeof body.dataUrl === 'string' && body.dataUrl) {
        rawDataUrls.push(body.dataUrl);
      }
      if (Array.isArray(body.dataUrls)) {
        rawDataUrls.push(...body.dataUrls.filter((u: unknown) => typeof u === 'string' && u));
      }

      if (rawDataUrls.length === 0) {
        return jsonResponse({ success: false, error: '缺少待上传的 dataUrl 或 dataUrls' }, 400);
      }

      for (const du of rawDataUrls) {
        const permanentUrl = await persistDataUrlToStorage(du, {
          category,
          customConfig,
        });
        urls.push(permanentUrl);
      }
    }

    return jsonResponse({
      success: true,
      url: urls[0] || '',
      urls,
      count: urls.length,
    });
  } catch (err: unknown) {
    console.error('[StorageUpload] 上传异常:', err);
    return jsonResponse({
      success: false,
      error: formatUserError(err, '媒体上传至存储失败'),
    }, 500);
  }
}
