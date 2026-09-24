import { jsonResponse } from '../../core/http';
import { uploadBufferToStorage, extractStorageConfigFromRequest, resolveStorageConfig, getPresignedStorageUrl } from '@beike/server-kit/storage';
import { formatUserError } from '@beike/domain/upstreamErrors';

/**
 * POST /api/generate/upload-ref
 * 用于将前端本地上传的参考图片或参考视频上传至对象存储，生成公网可访问的 URL 供大模型（如 Seedance 2.5）调取
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return jsonResponse({ success: false, error: '请使用 multipart/form-data 格式上传文件' }, 400);
    }

    const form = await req.formData().catch(() => null);
    if (!form) {
      return jsonResponse({ success: false, error: '无法解析上传的数据' }, 400);
    }

    const file = form.get('file');
    if (!file || !(file instanceof File)) {
      return jsonResponse({ success: false, error: '缺少待上传文件 (file 字段)' }, 400);
    }

    const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(file.name);
    const mime = isVideo ? (file.type || 'video/mp4') : (file.type || 'image/jpeg');

    const storageConfig = extractStorageConfigFromRequest(req);
    const resolved = resolveStorageConfig(storageConfig);

    const buffer = Buffer.from(await file.arrayBuffer());

    // 1. 如果已配置对象存储，直接上传至云端并返回永久公网 URL
    if (resolved) {
      try {
        const storedUrl = await uploadBufferToStorage(buffer, mime, {
          category: 'refs',
          customConfig: storageConfig,
          filename: file.name,
          withThumb: false,
        });
        const signedUrl = getPresignedStorageUrl(storedUrl, 6 * 60 * 60, storageConfig)
          || (resolved.provider === 'oss' ? null : storedUrl);
        if (!signedUrl) {
          return jsonResponse({ success: false, error: '参考文件已上传，但无法生成临时访问签名' }, 500);
        }

        return jsonResponse({
          success: true,
          url: signedUrl,
          mediaType: isVideo ? 'video' : 'image',
          filename: file.name,
        });
      } catch (uploadErr: any) {
        console.warn('[upload-ref] 对象存储上传失败:', uploadErr);
        return jsonResponse({
          success: false,
          error: `对象存储上传失败: ${formatUserError(uploadErr, '请检查存储配置')}`,
        }, 500);
      }
    }

    // 2. 如果未配置对象存储
    if (isVideo) {
      return jsonResponse({
        success: false,
        error: '当前未配置对象存储（OSS/R2/COS/S3）。Seedance 官方要求参考视频必须为公网可访问链接，请在系统【设置 -> 对象存储】中完成配置，或直接输入公网视频链接。',
      }, 400);
    }

    // 图片在未配置存储时，回退转为 base64 data URL
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${mime};base64,${base64}`;
    return jsonResponse({
      success: true,
      url: dataUrl,
      mediaType: 'image',
      filename: file.name,
    });
  } catch (err: any) {
    console.error('[upload-ref] 异常:', err);
    return jsonResponse({
      success: false,
      error: formatUserError(err, '素材上传异常'),
    }, 500);
  }
}
