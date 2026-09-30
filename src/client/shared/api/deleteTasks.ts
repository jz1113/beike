import { apiFetch } from '@client/shared/api/apiClient';
import { formatUserError } from '@shared/domain/models/upstreamErrors';

export interface MediaCleanupResult { deleted: number; errors: number; skipped: number; deferred: number }
export interface DeleteTasksOptions { protectUrls?: string[] }

export interface DeleteTasksResult {
  ok: boolean;
  count?: number;
  error?: string;
  /** Keys confirmed absent by successful requests, including idempotent deletes. */
  ids?: string[];
  urls?: string[];
  mediaCleanup?: MediaCleanupResult;
  warning?: string;
}

interface DeleteResponse { success?: boolean; error?: string; count?: number; mediaCleanup?: Partial<MediaCleanupResult>; warning?: string }

function parseMediaCleanup(cleanup?: Partial<MediaCleanupResult>): MediaCleanupResult | undefined {
  if (!cleanup || typeof cleanup !== 'object') return undefined;
  const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return { deleted: count(cleanup.deleted), errors: count(cleanup.errors), skipped: count(cleanup.skipped), deferred: count(cleanup.deferred) };
}

const CHUNK_SIZE = 50;

function gatewayErrorMessage(status: number): string {
  if (status === 502 || status === 503 || status === 504) {
    return '无法连接 API 服务，请确认已启动 API（npm run dev:api）或重启桌面端';
  }
  return `删除失败 (${status})`;
}

async function parseDeleteResponse(res: Response): Promise<{
  data: DeleteResponse | null;
  rawText: string;
}> {
  const rawText = await res.text().catch(() => '');
  let data: DeleteResponse | null = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    if (!res.ok && rawText) {
      console.warn('[deleteTasks] 非 JSON 响应:', res.status, rawText.slice(0, 200));
    }
  }
  return { data, rawText };
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function deleteTasksChunk(ids: string[], urls: string[], options?: DeleteTasksOptions): Promise<DeleteTasksResult> {
  const res = await apiFetch('/api/assets/tasks', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, urls, protectUrls: options?.protectUrls?.filter((url) => url && !url.startsWith('data:') && !url.startsWith('blob:')) }),
  });
  const { data } = await parseDeleteResponse(res);

  if (!res.ok || !data?.success) {
    return {
      ok: false,
      error: data?.error || gatewayErrorMessage(res.status),
    };
  }

  const count = typeof data.count === 'number' ? data.count : 0;
  return { ok: true, count, ids, urls, mediaCleanup: parseMediaCleanup(data.mediaCleanup), warning: typeof data.warning === 'string' ? data.warning : undefined };
}

export async function deleteTasksFromServer(
  ids: string[],
  urls: string[] = [],
  options?: DeleteTasksOptions,
): Promise<DeleteTasksResult> {
  let totalCount = 0;
  const confirmedIds: string[] = [];
  const confirmedUrls: string[] = [];
  const mediaCleanup: MediaCleanupResult = { deleted: 0, errors: 0, skipped: 0, deferred: 0 };
  const warnings = new Set<string>();
  try {
    const safeIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
    const safeUrls = Array.from(new Set(urls.filter(
      (u) =>
        u &&
        !u.startsWith('data:') &&
        !u.startsWith('blob:'),
    )));

    if (safeIds.length === 0 && safeUrls.length === 0) {
      return { ok: false, error: '缺少待删除的任务 ID 或 URL' };
    }

    const idChunks = safeIds.length > 0 ? chunkArray(safeIds, CHUNK_SIZE) : [[]];
    const urlChunks = safeUrls.length > 0 ? chunkArray(safeUrls, CHUNK_SIZE) : [[]];
    const pairCount = Math.max(idChunks.length, urlChunks.length);

    for (let i = 0; i < pairCount; i++) {
      const chunkIds = idChunks[i] ?? [];
      const chunkUrls = urlChunks[i] ?? [];
      if (chunkIds.length === 0 && chunkUrls.length === 0) continue;

      const result = await deleteTasksChunk(chunkIds, chunkUrls, options);
      if (!result.ok) {
        return { ...result, count: totalCount, ids: confirmedIds, urls: confirmedUrls, mediaCleanup, warning: Array.from(warnings).join('；') || undefined };
      }
      if (result.mediaCleanup) for (const key of Object.keys(mediaCleanup) as Array<keyof MediaCleanupResult>) mediaCleanup[key] += result.mediaCleanup[key];
      if (result.warning) warnings.add(result.warning);
      totalCount += result.count ?? 0;
      confirmedIds.push(...chunkIds);
      confirmedUrls.push(...chunkUrls);
    }

    // An empty match is a successful idempotent deletion. It also lets local-only
    // drafts and old browser history be removed after the server confirms absence.
    return { ok: true, count: totalCount, ids: confirmedIds, urls: confirmedUrls, mediaCleanup, warning: Array.from(warnings).join('；') || undefined };
  } catch (err: unknown) {
    return { ok: false, error: formatUserError(err, '网络异常'), count: totalCount, ids: confirmedIds, urls: confirmedUrls, mediaCleanup, warning: Array.from(warnings).join('；') || undefined };
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
    return { ok: true, count: data.count, mediaCleanup: parseMediaCleanup(data.mediaCleanup), warning: typeof data.warning === 'string' ? data.warning : undefined };
  } catch (err: unknown) {
    return { ok: false, error: formatUserError(err, '网络异常') };
  }
}
