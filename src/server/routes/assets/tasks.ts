import { jsonResponse } from '../../core/http';
import { readJsonBody } from '../../core/validate';
import { assetTaskRepository } from '@server/repositories/assetTasks';
import { isAdminAuthorized, unauthorizedJson } from '@server/infrastructure/auth/apiAuth';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { removeAssetTasks } from '@server/services/library/removeAssetTasks';

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

/** DELETE /api/assets/tasks: remove records, retain media until references are reviewed. */
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const body = await readJsonBody(req, null);
    const protectUrls = Array.isArray(body?.protectUrls) ? body.protectUrls.filter((url: unknown): url is string => typeof url === 'string' && Boolean(url.trim())) : [];
    const clearFailed = searchParams.get('clearFailed') === 'true' || body?.clearFailed === true;
    const clearAll = searchParams.get('clearAll') === 'true' || body?.clearAll === true;
    if (clearAll) {
      if (!isAdminAuthorized(req)) return unauthorizedJson('clearAll requires admin token');
      return jsonResponse(await removeAssetTasks({ all: true }, protectUrls));
    }
    if (clearFailed) return jsonResponse(await removeAssetTasks({ failed: true }, protectUrls));
    const targetIds: string[] = [];
    const targetUrls: string[] = [];
    const collect = (target: string[], value: unknown) => { if (typeof value === 'string' && value.trim()) target.push(value.trim()); };
    collect(targetIds, searchParams.get('id'));
    searchParams.get('ids')?.split(',').forEach((id) => collect(targetIds, id));
    collect(targetIds, body?.id);
    if (Array.isArray(body?.ids)) body.ids.forEach((id: unknown) => collect(targetIds, id));
    collect(targetUrls, searchParams.get('url'));
    searchParams.get('urls')?.split(',').forEach((url) => collect(targetUrls, url));
    collect(targetUrls, body?.url);
    if (Array.isArray(body?.urls)) body.urls.forEach((url: unknown) => collect(targetUrls, url));
    const ids = Array.from(new Set(targetIds));
    const urls = Array.from(new Set(targetUrls));
    if (ids.length === 0 && urls.length === 0) return jsonResponse({ success: false, error: '缺少待删除的任务 ID 或 URL' }, 400);
    return jsonResponse(await removeAssetTasks({ ids, urls }, protectUrls));
  } catch (error: unknown) {
    console.error('删除生图任务失败:', error);
    return jsonResponse({ success: false, error: formatUserError(error) }, 500);
  }
}
