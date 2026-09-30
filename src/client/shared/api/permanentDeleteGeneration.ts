import { deleteTasksFromServer, type DeleteTasksOptions, type MediaCleanupResult } from '@client/shared/api/deleteTasks';
import { isGenerationDeleted } from '@client/store/persist/generation';
import { useAppStore } from '@client/store';

export interface PermanentDeleteInput {
  id?: string | null;
  taskId?: string | null;
  dbId?: string | null;
  resultUrl?: string | null;
  rawTask?: PermanentDeleteInput;
}

export interface PermanentDeleteResult {
  ok: boolean;
  count?: number;
  error?: string;
  ids: string[];
  urls: string[];
  partial?: boolean;
  mediaCleanup?: MediaCleanupResult;
  warning?: string;
}

function isPersistableUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('data:') || url.startsWith('blob:')) return false;
  return true;
}

function collectKeys(input: PermanentDeleteInput | PermanentDeleteInput[]): { ids: string[]; urls: string[]; localAliases: Map<string, string[]> } {
  const items = Array.isArray(input) ? input : [input];
  const idSet = new Set<string>();
  const urlSet = new Set<string>();
  const localAliases = new Map<string, string[]>();
  for (const item of items) {
    if (!item) continue;
    const databaseId = item.dbId || item.rawTask?.dbId;
    if (databaseId) {
      // One upstream submission can produce several database output rows.
      // A known database identity must never expand into deleting that whole submission.
      idSet.add(String(databaseId));
      localAliases.set(String(databaseId), [item.id, item.rawTask?.id].filter((id): id is string => Boolean(id && id !== item.taskId && id !== item.rawTask?.taskId)));
      continue;
    }
    if (item.id) idSet.add(String(item.id));
    if (item.taskId) idSet.add(String(item.taskId));
    if (item.dbId) idSet.add(String(item.dbId));
    if (item.rawTask) {
      if (item.rawTask.id) idSet.add(String(item.rawTask.id));
      if (item.rawTask.taskId) idSet.add(String(item.rawTask.taskId));
      if (item.rawTask.dbId) idSet.add(String(item.rawTask.dbId));
    }
    const hasIds = Boolean(item.id || item.taskId || item.dbId || item.rawTask?.id || item.rawTask?.taskId || item.rawTask?.dbId);
    if (!hasIds && isPersistableUrl(item.resultUrl)) {
      urlSet.add(item.resultUrl!);
    }
  }
  return { ids: Array.from(idSet), urls: Array.from(urlSet), localAliases };
}

export async function permanentDeleteGeneration(
  input: PermanentDeleteInput | PermanentDeleteInput[],
  options?: DeleteTasksOptions,
): Promise<PermanentDeleteResult> {
  const { ids, urls, localAliases } = collectKeys(input);
  if (ids.length === 0 && urls.length === 0) {
    return { ok: false, error: '缺少待删除的任务标识', ids, urls };
  }

  // Commit local removal only for requests the server has acknowledged. Failed
  // requests must leave records available so the user can retry the deletion.
  const result = await deleteTasksFromServer(ids, urls, options);
  const confirmedIds = Array.from(new Set((result.ids || []).flatMap((id) => [id, ...(localAliases.get(id) || [])])));
  const confirmedUrls = result.urls || [];
  if (confirmedIds.length > 0 || confirmedUrls.length > 0) {
    useAppStore.getState().deleteGenerationPermanently(confirmedIds, confirmedUrls);
  }
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      count: result.count,
      ids: confirmedIds,
      urls: confirmedUrls,
      partial: confirmedIds.length > 0 || confirmedUrls.length > 0,
      mediaCleanup: result.mediaCleanup,
      warning: result.warning,
    };
  }

  return { ok: true, count: result.count, ids: confirmedIds, urls: confirmedUrls, mediaCleanup: result.mediaCleanup, warning: result.warning };
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
