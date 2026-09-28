import { jsonResponse } from '../../core/http';
import { readJsonBody } from '../../core/validate';
import { assetTaskRepository } from '@server/repositories/assetTasks';
import { isAdminAuthorized, unauthorizedJson } from '@server/infrastructure/auth/apiAuth';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { deleteObjectsFromStorage } from '@server/infrastructure/storage/storage';

const PROMPT_SUMMARY_LEN = 120;

export function truncatePrompt(prompt?: string | null): string | undefined {
  if (!prompt) return prompt ?? undefined;
  if (prompt.length <= PROMPT_SUMMARY_LEN) return prompt;
  return `${prompt.slice(0, PROMPT_SUMMARY_LEN)}…`;
}

export function mapTaskSummary(t: {
  id: string;
  taskId: string | null;
  prompt: string;
  model: string | null;
  mediaType: string | null;
  size: string | null;
  quality: string | null;
  status: string;
  resultUrl: string | null;
  failReason: string | null;
  createdAt: Date;
  product: unknown;
}, fullDetail: boolean) {
  if (fullDetail) {
    return {
      id: t.id,
      taskId: t.taskId,
      prompt: t.prompt,
      promptSnippet: truncatePrompt(t.prompt),
      model: t.model,
      mediaType: t.mediaType,
      size: t.size,
      quality: t.quality,
      status: t.status,
      resultUrl: t.resultUrl,
      failReason: t.failReason,
      createdAt: t.createdAt,
      product: t.product,
    };
  }
  return {
    id: t.id,
    taskId: t.taskId,
    prompt: t.prompt,
    promptSnippet: truncatePrompt(t.prompt),
    model: t.model,
    mediaType: t.mediaType,
    size: t.size,
    quality: t.quality,
    status: t.status,
    resultUrl: t.resultUrl,
    failReason: t.failReason ? truncatePrompt(t.failReason) : null,
    createdAt: t.createdAt,
    product: t.product,
  };
}

/**
 * GET /api/assets/tasks
 * 获取历史生图任务列表（分页）；默认 summary 模式裁剪 prompt
 * GET /api/assets/tasks/:id — 单条详情（完整字段）
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const detailId = searchParams.get('id');
    if (detailId) {
      const task = await assetTaskRepository.findDetail(detailId);
      if (!task) {
        return jsonResponse({ success: false, error: '任务不存在' }, 404);
      }
      return jsonResponse({
        success: true,
        task: mapTaskSummary(task, true),
      });
    }

    const productId = searchParams.get('productId');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const detail = searchParams.get('detail') === 'true' || searchParams.get('detail') === '1';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get('pageSize') || '100', 10) || 100));

    const { total, tasks } = await assetTaskRepository.list({ productId, status, search, page, pageSize });

    return jsonResponse({
      success: true,
      page,
      pageSize,
      total,
      tasks: tasks.map((t) => mapTaskSummary(t, detail)),
    });
  } catch (error: unknown) {
    console.error('获取历史生图任务失败:', error);
    return jsonResponse({ success: false, error: formatUserError(error, '获取任务失败') }, 500);
  }
}

/**
 * DELETE /api/assets/tasks
 */
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const body = await readJsonBody(req, null);

    const id = searchParams.get('id');
    const idsParam = searchParams.get('ids');
    const urlParam = searchParams.get('url');
    const urlsParam = searchParams.get('urls');
    const clearFailed = searchParams.get('clearFailed') === 'true' || body?.clearFailed === true;
    const clearAll = searchParams.get('clearAll') === 'true' || body?.clearAll === true;

    if (clearFailed) {
      const count = await assetTaskRepository.deleteFailed();
      return jsonResponse({ success: true, count });
    }

    if (clearAll) {
      if (!isAdminAuthorized(req)) {
        return unauthorizedJson('clearAll requires admin token');
      }
      const allUrls = await assetTaskRepository.findAllResultUrls();
      if (allUrls.length > 0) {
        deleteObjectsFromStorage(allUrls).catch((err) => {
          console.warn('[清空任务-OSS清理异常]', err);
        });
      }
      const count = await assetTaskRepository.deleteAll();
      return jsonResponse({ success: true, count });
    }

    let targetIds: string[] = [];
    let targetUrls: string[] = [];

    if (id) targetIds.push(id);
    if (idsParam) targetIds.push(...idsParam.split(',').map((s) => s.trim()).filter(Boolean));
    if (body?.id) targetIds.push(String(body.id));
    if (body?.ids && Array.isArray(body.ids)) targetIds.push(...body.ids.map(String));

    if (urlParam) targetUrls.push(urlParam);
    if (urlsParam) targetUrls.push(...urlsParam.split(',').map((s) => s.trim()).filter(Boolean));
    if (body?.url) targetUrls.push(String(body.url));
    if (body?.urls && Array.isArray(body.urls)) targetUrls.push(...body.urls.map(String));

    targetIds = Array.from(new Set(targetIds.map((s) => s.trim()).filter(Boolean)));
    targetUrls = Array.from(new Set(targetUrls.map((s) => s.trim()).filter(Boolean)));

    if (targetIds.length === 0 && targetUrls.length === 0) {
      return jsonResponse({ success: false, error: '缺少待删除的任务 ID 或 URL' }, 400);
    }

    const mediaUrlsToDelete = [
      ...(await assetTaskRepository.findResultUrls(targetIds, targetUrls)),
      ...targetUrls,
    ];

    if (mediaUrlsToDelete.length > 0) {
      deleteObjectsFromStorage(mediaUrlsToDelete).catch((err) => {
        console.warn('[删除任务-OSS清理异常]', err);
      });
    }

    const count = await assetTaskRepository.deleteSelected(targetIds, targetUrls);

    return jsonResponse({ success: true, count });
  } catch (error: unknown) {
    console.error('删除生图任务失败:', error);
    return jsonResponse({ success: false, error: formatUserError(error) }, 500);
  }
}
