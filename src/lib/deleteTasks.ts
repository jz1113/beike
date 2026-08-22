import { apiFetch } from '@/lib/apiClient';

export interface DeleteTasksResult {
  ok: boolean;
  count?: number;
  error?: string;
}

export async function deleteTasksFromServer(
  ids: string[],
  urls: string[] = [],
): Promise<DeleteTasksResult> {
  try {
    const res = await apiFetch('/api/assets/tasks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, urls }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      return {
        ok: false,
        error: data?.error || `删除失败 (${res.status})`,
      };
    }
    const count = typeof data.count === 'number' ? data.count : 0;
    if (count === 0) {
      return {
        ok: false,
        count: 0,
        error: '未能匹配到数据库记录，请刷新后重试',
      };
    }
    return { ok: true, count };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '网络异常';
    return { ok: false, error: message };
  }
}

export async function clearFailedTasksFromServer(): Promise<DeleteTasksResult> {
  try {
    const res = await apiFetch('/api/assets/tasks?clearFailed=true', { method: 'DELETE' });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      return {
        ok: false,
        error: data?.error || `清理失败 (${res.status})`,
      };
    }
    return { ok: true, count: data.count };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '网络异常';
    return { ok: false, error: message };
  }
}
