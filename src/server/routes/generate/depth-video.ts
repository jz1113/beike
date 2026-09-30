import { jsonResponse } from '../../core/http';
import { readJsonBody } from '../../core/validate';
import { generationTaskRepository } from '@server/repositories/generationTasks';
import { DepthVideoSubmitBodySchema } from '@shared/contracts';
import {
  DEPTH_MODEL_SETUP_COMMAND,
  DEPTH_VIDEO_LIMITS,
  resolveDepthQuality,
  resolveDepthVideoStyle,
} from '@shared/domain/media/depthVideo';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { checkDepthModelReady } from '../../services/depth/depthEnvCheck';
import { createDepthVideoTask, getDepthVideoRuntimeState } from '../../services/depth/depthVideoPipeline';
import { checkFfmpegAvailable } from '../../services/media/videoFrames';
import { depthInputDigest, guardDepthSubmission, readDepthSubmissionReceipt } from '../../services/tasks/depthSubmissionGuard';

async function ensureDepthEnvReady() {
  const ffmpegOk = await checkFfmpegAvailable();
  if (!ffmpegOk) {
    return jsonResponse({
      success: false,
      submissionRejected: true,
      error: '深度动作捕捉服务未就绪：请重启 API 服务（npm run dev:api）或执行 npm run setup:depth-env',
    }, 503);
  }

  const depthModelReady = await checkDepthModelReady();
  if (!depthModelReady) {
    return jsonResponse({
      success: false,
      submissionRejected: true,
      error: `深度模型未就绪，请在终端执行：${DEPTH_MODEL_SETUP_COMMAND}`,
    }, 503);
  }

  return null;
}

/**
 * POST /api/generate/depth-video
 */
export async function POST(req: Request) {
  try {
    const envError = await ensureDepthEnvReady();
    if (envError) return envError;

    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
      if (contentLength > DEPTH_VIDEO_LIMITS.maxDataUrlBytes + 2 * 1024 * 1024) {
        return jsonResponse({
          success: false,
          error: `视频过大，请控制在 ${Math.round(DEPTH_VIDEO_LIMITS.maxDataUrlBytes / 1024 / 1024)}MB 以内`,
        }, 400);
      }

      let form: FormData;
      try {
        form = await req.formData();
      } catch {
        return jsonResponse({
          success: false,
          error: '视频上传解析失败，请检查视频文件完整性或控制视频大小',
        }, 400);
      }
      const file = form.get('video');
      if (!file || !(file instanceof File)) {
        return jsonResponse({ success: false, error: '缺少视频文件 video' }, 400);
      }
      if (!file.type.startsWith('video/') && !/\.(mp4|webm|mov|m4v)$/i.test(file.name)) {
        return jsonResponse({ success: false, error: '请上传 MP4 / WebM / MOV 视频文件' }, 400);
      }
      if (file.size > DEPTH_VIDEO_LIMITS.maxDataUrlBytes) {
        return jsonResponse({
          success: false,
          error: `视频过大，请控制在 ${Math.round(DEPTH_VIDEO_LIMITS.maxDataUrlBytes / 1024 / 1024)}MB 以内`,
        }, 400);
      }

      const style = resolveDepthVideoStyle({ style: form.get('style') });
      const quality = resolveDepthQuality(form.get('quality'));
      const videoBuffer = Buffer.from(await file.arrayBuffer());
      return guardDepthSubmission(req, 'depth-video', form.get('clientTaskId'), {
        fileDigest: depthInputDigest(videoBuffer), style, quality,
      }, async () => {
        const { taskId, recordId } = await createDepthVideoTask(req, { videoBuffer, style, quality });
        return jsonResponse({ success: true, taskId, recordId, status: 'IN_PROGRESS', style, quality });
      });
    }

    const rawBody = await readJsonBody(req);
    const parsed = DepthVideoSubmitBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonResponse({
        success: false,
        error: parsed.error.issues[0]?.message || '请求参数无效',
      }, 400);
    }

    const style = resolveDepthVideoStyle(parsed.data);
    const quality = resolveDepthQuality(parsed.data.quality);
    return guardDepthSubmission(req, 'depth-video', rawBody.clientTaskId, {
      inputDigest: depthInputDigest(Buffer.from(parsed.data.videoDataUrl || parsed.data.videoUrl || '')), style, quality,
    }, async () => {
      const { taskId, recordId } = await createDepthVideoTask(req, {
        videoDataUrl: parsed.data.videoDataUrl, videoUrl: parsed.data.videoUrl, style, quality,
      });
      return jsonResponse({ success: true, taskId, recordId, status: 'IN_PROGRESS', style, quality });
    });
  } catch (error: unknown) {
    console.error('[深度动作捕捉] 提交失败:', error);
    return jsonResponse({
      success: false,
      error: formatUserError(error, '深度动作捕捉任务提交失败'),
      submissionRejected: true,
    }, 500);
  }
}

/**
 * GET /api/generate/depth-video?taskId=
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    if (!searchParams.get('taskId') && searchParams.has('taskKey')) return readDepthSubmissionReceipt(req, 'depth-video');
    const taskId = searchParams.get('taskId');
    if (!taskId) {
      return jsonResponse({ success: false, error: '缺少 taskId 参数' }, 400);
    }

    const record = await generationTaskRepository.findByIdOrTaskId(taskId);
    if (!record) {
      return jsonResponse({ success: false, error: '任务不存在' }, 404);
    }

    const runtime = getDepthVideoRuntimeState(taskId);
    let status = (record.status || 'IN_PROGRESS') as 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE';
    let failReason = record.failReason;

    // 幽灵任务自动熔断：如果内存中无存活 Worker，且数据库标记为 IN_PROGRESS
    if (!runtime && status === 'IN_PROGRESS') {
      const ageMs = Date.now() - new Date(record.createdAt).getTime();
      // 如果已超过 45 秒仍无任何内存 Worker 状态，说明服务已重启或 Worker 异常中断
      if (ageMs > 45_000) {
        status = 'FAILURE';
        failReason = '任务执行已超时或已中断';
        await generationTaskRepository.markFailed(record.id, failReason).catch(() => undefined);
      }
    }

    const progress = runtime?.progress || (status === 'SUCCESS' ? '100%' : status === 'FAILURE' ? '0%' : '10%');

    return jsonResponse({
      success: true,
      taskId,
      status,
      progress,
      stage: runtime?.stage,
      resultUrl: record.resultUrl,
      failReason,
      modelId: runtime?.inferenceMeta?.modelId,
      inferenceSizePx: runtime?.inferenceMeta?.inferenceSizePx,
      device: runtime?.inferenceMeta?.device,
      quality: runtime?.inferenceMeta?.quality ?? record.quality,
    });
  } catch (error: unknown) {
    console.error('[深度动作捕捉] 轮询失败:', error);
    return jsonResponse({
      success: false,
      error: formatUserError(error, '查询深度动作捕捉任务失败'),
    }, 500);
  }
}
