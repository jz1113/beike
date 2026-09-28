import { deleteTasksFromServer } from '@client/shared/api/deleteTasks';
import { isGenerationDeleted } from '@client/store/persist/generation';
import { useAppStore } from '@client/store';

export interface PermanentDeleteInput {
  id?: string | null;
  taskId?: string | null;
  dbId?: string | null;
  resultUrl?: string | null;
}

export interface PermanentDeleteResult {
  ok: boolean;
  count?: number;
  error?: string;
  ids: string[];
  urls: string[];
  partial?: boolean;
}

const MAX_URL_LENGTH = 512;

function isPersistableUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('data:') || url.startsWith('blob:')) return false;
  return url.length <= MAX_URL_LENGTH;
}

function collectKeys(input: PermanentDeleteInput | PermanentDeleteInput[]): { ids: string[]; urls: string[] } {
  const items = Array.isArray(input) ? input : [input];
  const idSet = new Set<string>();
  const urlSet = new Set<string>();
  for (const item of items) {
    if (!item) continue;
    if (item.id) idSet.add(String(item.id));
    if (item.taskId) idSet.add(String(item.taskId));
    if (item.dbId) idSet.add(String(item.dbId));
    const anyItem = item as any;
    if (anyItem.rawTask) {
      if (anyItem.rawTask.id) idSet.add(String(anyItem.rawTask.id));
      if (anyItem.rawTask.taskId) idSet.add(String(anyItem.rawTask.taskId));
      if (anyItem.rawTask.dbId) idSet.add(String(anyItem.rawTask.dbId));
    }
    const hasIds = Boolean(item.id || item.taskId || item.dbId || anyItem.rawTask?.id || anyItem.rawTask?.taskId || anyItem.rawTask?.dbId);
    if (!hasIds && isPersistableUrl(item.resultUrl)) {
      urlSet.add(item.resultUrl!);
    }
  }
  return { ids: Array.from(idSet), urls: Array.from(urlSet) };
}

export async function permanentDeleteGeneration(
  input: PermanentDeleteInput | PermanentDeleteInput[],
): Promise<PermanentDeleteResult> {
  const { ids, urls } = collectKeys(input);
  if (ids.length === 0 && urls.length === 0) {
    return { ok: false, error: '缺少待删除的任务标识', ids, urls };
  }

  // 🌟 1. 本地 Store 与已删除黑名单坚决优先清除，确保界面即刻消失且防回显
  useAppStore.getState().deleteGenerationPermanently(ids, urls);

  // 🌟 2. 派发服务端物理删除
  const result = await deleteTasksFromServer(ids, urls);
  if (!result.ok) {
    return { ok: false, error: result.error, count: result.count, ids, urls };
  }

  const itemCount = Array.isArray(input) ? input.length : 1;
  const partial = itemCount > 1 && typeof result.count === 'number' && result.count < itemCount;

  return { ok: true, count: result.count, ids, urls, partial };
}

export function filterDbTasksAfterDelete<T extends { id?: string; taskId?: string; resultUrl?: string; dbId?: string }>(
  tasks: T[],
  ids: string[],
  urls: string[],
): T[] {
  const idSet = new Set(ids);
  const urlSet = new Set(urls);
  return tasks.filter(
    (t) =>
      !idSet.has(t.id!) &&
      (!t.taskId || !idSet.has(t.taskId)) &&
      (!t.dbId || !idSet.has(t.dbId)) &&
      (!t.resultUrl || !urlSet.has(t.resultUrl)) &&
      !isGenerationDeleted(t.id, t.taskId, t.resultUrl, t.dbId),
  );
}

export function filterDbTasksFromTombstones<T extends { id?: string; taskId?: string; resultUrl?: string; dbId?: string }>(
  tasks: T[],
): T[] {
  return tasks.filter((t) => !isGenerationDeleted(t.id, t.taskId, t.resultUrl, t.dbId));
}
