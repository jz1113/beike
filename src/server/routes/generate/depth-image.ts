import { jsonResponse } from '../../core/http';
import {
  DEPTH_IMAGE_LIMITS,
  DEPTH_MODEL_SETUP_COMMAND,
  resolveDepthQuality,
  resolveDepthVideoStyle,
} from '@shared/domain/media/depthVideo';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { extractStorageConfigFromRequest } from '@server/infrastructure/storage/storage';
import { checkDepthModelReady } from '../../services/depth/depthEnvCheck';
import { runDepthImageJob } from '../../services/depth/depthImagePipeline';
import { depthInputDigest, guardDepthSubmission, readDepthSubmissionReceipt } from '../../services/tasks/depthSubmissionGuard';

/**
 * POST /api/generate/depth-image
 */
export async function POST(req: Request) {
  try {
    const depthModelReady = await checkDepthModelReady();
    if (!depthModelReady) {
      return jsonResponse({
        success: false,
        submissionRejected: true,
        error: `深度模型未就绪，请在终端执行：${DEPTH_MODEL_SETUP_COMMAND}`,
      }, 503);
    }

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return jsonResponse({ success: false, error: '请使用 multipart/form-data 上传图片' }, 400);
    }

    const form = await req.formData();
    const file = form.get('image');
    if (!file || !(file instanceof File)) {
      return jsonResponse({ success: false, error: '缺少图片文件 image' }, 400);
    }
    if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|gif)$/i.test(file.name)) {
      return jsonResponse({ success: false, error: '请上传 JPG / PNG / WebP 图片文件' }, 400);
    }
    if (file.size > DEPTH_IMAGE_LIMITS.maxBytes) {
      return jsonResponse({
        success: false,
        error: `图片过大，请控制在 ${Math.round(DEPTH_IMAGE_LIMITS.maxBytes / 1024 / 1024)}MB 以内`,
      }, 400);
    }

    const style = resolveDepthVideoStyle({ style: form.get('style') });
    const quality = resolveDepthQuality(form.get('quality'));
    const storageConfig = extractStorageConfigFromRequest(req);
    const imageBuffer = Buffer.from(await file.arrayBuffer());
    return guardDepthSubmission(req, 'depth-image', form.get('clientTaskId'), {
      fileDigest: depthInputDigest(imageBuffer), style, quality,
    }, async () => {
      const { resultUrl, meta } = await runDepthImageJob({ imageBuffer, style, quality, storageConfig });
      return jsonResponse({
        success: true, resultUrl, style, quality,
        modelId: meta?.modelId, inferenceSizePx: meta?.inferenceSizePx, device: meta?.device,
      });
    });
  } catch (error: unknown) {
    console.error('[深度图片] 生成失败:', error);
    return jsonResponse({
      success: false,
      submissionRejected: true,
      error: formatUserError(error, '深度图片生成失败'),
    }, 500);
  }
}

export async function GET(req: Request) {
  return readDepthSubmissionReceipt(req, 'depth-image');
}
