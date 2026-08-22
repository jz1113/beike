import { deleteTasksFromServer } from '@/lib/deleteTasks';
import { isGenerationDeleted } from '@/store/persist';
import { useAppStore } from '@/store/useAppStore';

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

function collectKeys(input: PermanentDeleteInput | PermanentDeleteInput[]): { ids: string[]; urls: string[] } {
  const items = Array.isArray(input) ? input : [input];
  const idSet = new Set<string>();
  const urlSet = new Set<string>();
  for (const item of items) {
    if (item.id) idSet.add(item.id);
    if (item.taskId) idSet.add(item.taskId);
    if (item.dbId) idSet.add(item.dbId);
    if (item.resultUrl) urlSet.add(item.resultUrl);
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

  const result = await deleteTasksFromServer(ids, urls);
  if (!result.ok) {
    return { ok: false, error: result.error, count: result.count, ids, urls };
  }

  useAppStore.getState().deleteGenerationPermanently(ids, urls);

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
