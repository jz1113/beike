import { apiFetch } from '@/shared/api/apiClient';
import { formatUserError } from '@beike/domain/upstreamErrors';

export interface DeleteTasksResult {
  ok: boolean;
  count?: number;
  error?: string;
}

const CHUNK_SIZE = 50;
const MAX_URL_LENGTH = 512;

function gatewayErrorMessage(status: number): string {
  if (status === 502 || status === 503 || status === 504) {
    return '无法连接 API 服务，请确认已启动 API（npm run dev:api）或重启桌面端';
  }
  return `删除失败 (${status})`;
}

async function parseDeleteResponse(res: Response): Promise<{
  data: { success?: boolean; error?: string; count?: number } | null;
  rawText: string;
}> {
  const rawText = await res.text().catch(() => '');
  let data: { success?: boolean; error?: string; count?: number } | null = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    if (!res.ok && rawText) {
      console.warn('[deleteTasks] 非 JSON 响应:', res.status, rawText.slice(0, 200));
    }
  }
  return { data, rawText };
}

function buildDeleteUrl(ids: string[], urls: string[]): string {
  const params = new URLSearchParams();
  if (ids.length > 0) params.set('ids', ids.join(','));
  if (urls.length > 0) params.set('urls', urls.join(','));
  return `/api/assets/tasks?${params.toString()}`;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function deleteTasksChunk(ids: string[], urls: string[]): Promise<DeleteTasksResult> {
  const res = await apiFetch(buildDeleteUrl(ids, urls), { method: 'DELETE' });
  const { data } = await parseDeleteResponse(res);

  if (!res.ok || !data?.success) {
    return {
      ok: false,
      error: data?.error || gatewayErrorMessage(res.status),
    };
  }

  const count = typeof data.count === 'number' ? data.count : 0;
  return { ok: true, count };
}

export async function deleteTasksFromServer(
  ids: string[],
  urls: string[] = [],
): Promise<DeleteTasksResult> {
  try {
    const safeUrls = urls.filter(
      (u) =>
        u &&
        !u.startsWith('data:') &&
        !u.startsWith('blob:') &&
        u.length <= MAX_URL_LENGTH,
    );

    if (ids.length === 0 && safeUrls.length === 0) {
      return { ok: false, error: '缺少待删除的任务 ID 或 URL' };
    }

    const idChunks = ids.length > 0 ? chunkArray(ids, CHUNK_SIZE) : [[]];
    const urlChunks = safeUrls.length > 0 ? chunkArray(safeUrls, CHUNK_SIZE) : [[]];
    const pairCount = Math.max(idChunks.length, urlChunks.length);

    let totalCount = 0;
    for (let i = 0; i < pairCount; i++) {
      const chunkIds = idChunks[i] ?? [];
      const chunkUrls = urlChunks[i] ?? [];
      if (chunkIds.length === 0 && chunkUrls.length === 0) continue;

      const result = await deleteTasksChunk(chunkIds, chunkUrls);
      if (!result.ok) return result;
      totalCount += result.count ?? 0;
    }

    if (totalCount === 0) {
      return {
        ok: false,
        count: 0,
        error: '未能匹配到数据库记录，请刷新后重试',
      };
    }
    return { ok: true, count: totalCount };
  } catch (err: unknown) {
    return { ok: false, error: formatUserError(err, '网络异常') };
  }
}

export async function clearFailedTasksFromServer(): Promise<DeleteTasksResult> {
  try {
    const res = await apiFetch('/api/assets/tasks?clearFailed=true', { method: 'DELETE' });
    const { data } = await parseDeleteResponse(res);
    if (!res.ok || !data?.success) {
      return {
        ok: false,
        error: data?.error || gatewayErrorMessage(res.status),
      };
    }
    return { ok: true, count: data.count };
  } catch (err: unknown) {
    return { ok: false, error: formatUserError(err, '网络异常') };
  }
}
