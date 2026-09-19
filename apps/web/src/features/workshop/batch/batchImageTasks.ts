import { apiFetch } from '@/lib/apiClient';
import { getGatewayClientHeaders, getGatewayClientOverrides } from '@/lib/gatewayClient';
import { compressImageToDataUrl } from '@/lib/image-utils';
import { recordModelUsage, resolveModelVendor } from '@/lib/usageTracker';
import { isTransientPollError, imageGenBusinessError, nonRetryableError } from './batchRunnerIo';

/**
 * 若图片为超过 1.2MB 的 base64 data URL，进行压缩优化
 */
export async function compressProductImageIfNeeded(img: string): Promise<string> {
  if (typeof img === 'string' && img.startsWith('data:') && img.length > 1_200_000) {
    try {
      return await compressImageToDataUrl(img, 1400, 0.82);
    } catch (compErr) {
      console.warn('[compressProductImageIfNeeded] 垫图压缩失败，回退原图:', compErr);
    }
  }
  return img;
}

/**
 * 轮询单个异步生图任务状态，处理超时（6分钟）与瞬时重试
 */
export async function pollSingleTask(
  taskId: string,
  _isAborted: () => boolean
): Promise<string> {
  void _isAborted;
  const timeoutMs = 360000;
  const start = Date.now();
  const gatewayHeaders = getGatewayClientHeaders();
  const localUrl = gatewayHeaders['x-custom-base-url'];

  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const pRes = await apiFetch(`/api/generate/image?taskId=${encodeURIComponent(taskId)}`, {
        headers: {
          ...gatewayHeaders,
          ...(localUrl ? { 'x-custom-base-url': localUrl } : {}),
        },
      });
      const pData = await pRes.json().catch(() => null);

      if (!pData) {
        // 瞬时解析失败，继续轮询
        continue;
      }

      if (!pRes.ok || pData.success === false) {
        const businessError = pData.error || pData.failReason;
        if (businessError) {
          throw imageGenBusinessError(String(businessError));
        }
        // HTTP 瞬时异常且无明确业务文案时继续轮询
        continue;
      }

      if (pData.status === 'SUCCESS' && pData.resultUrl) {
        return pData.resultUrl;
      }
      if (pData.status === 'FAILURE' || pData.status === 'FAILED') {
        throw imageGenBusinessError(pData.failReason || pData.error || '生图任务失败');
      }
    } catch (e: unknown) {
      // 业务失败立刻上抛；仅吞网络类瞬时错误
      if (!isTransientPollError(e)) throw e;
    }
  }
  throw nonRetryableError(`生图超时（已等待 6 分钟，任务 ${taskId}）`);
}

export interface SubmitImageGenTaskDeps {
  isAborted: () => boolean;
}

/**
 * 提交生图请求并处理同步返回或启动异步轮询
 */
export async function submitImageGenTask(
  payload: Record<string, any>,
  deps: SubmitImageGenTaskDeps
): Promise<string> {
  if (deps.isAborted()) {
    throw nonRetryableError('已停止后续生图，不提交新任务');
  }
  const { customBaseUrl: localUrl, customApiKey: localApiKey } = getGatewayClientOverrides();

  const finalPayload = {
    ...payload,
    customBaseUrl: localUrl,
    customApiKey: localApiKey,
  };

  const res = await apiFetch('/api/generate/image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getGatewayClientHeaders(),
    },
    body: JSON.stringify(finalPayload),
  });

  const data = await res.json().catch(() => null);
  if (!data) {
    throw nonRetryableError(payload.isGrid2x2 ? '四宫格生图响应解析失败' : '生图响应解析失败');
  }
  if (!res.ok || !data.success) {
    throw nonRetryableError(
      data.error || (payload.isGrid2x2 ? '四宫格生图提交失败' : '生图任务提交失败')
    );
  }

  // 记录生图模型调用
  try {
    const resolvedModelId = data.model || payload.model || 'gpt-image-2';
    recordModelUsage({
      modelId: resolvedModelId,
      modelName: resolvedModelId,
      provider: resolveModelVendor(resolvedModelId),
      type: 'image',
      mediaCount: 1,
      success: true,
    });
  } catch {}

  if (data.status === 'SUCCESS' && data.resultUrl) {
    return data.resultUrl;
  }

  if (data.taskId) {
    return await pollSingleTask(data.taskId, deps.isAborted);
  }

  throw nonRetryableError(
    payload.isGrid2x2 ? '四宫格生图网关未返回有效任务 ID' : '生图网关未返回有效任务 ID'
  );
}
