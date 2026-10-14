import { isGenerationDeleted } from '@client/store/persist/generation';
import { getAspectRatioFromSize } from '@shared/domain/media/drawing';
import { getAssetTime, matchesAssetTime, resolveAssetMediaType, type AssetMediaCategory, type AssetTimeFilter } from '@client/shared/utils/assetTaskData';
import type { useAppStore } from '@client/store';

type AppState = ReturnType<typeof useAppStore.getState>;
interface MergeAssetTaskInput {
  dbTasks: any[];
  generationTasks: AppState['generationTasks'];
  sessions: AppState['sessions'];
  canvasTasks: any[];
  mediaCategory: AssetMediaCategory;
  searchKeyword: string;
  timeFilter: AssetTimeFilter;
  now?: Date;
  serverHistoryComplete?: boolean;
}

export function mergeAssetTasks({ dbTasks, generationTasks, sessions, canvasTasks, mediaCategory, searchKeyword, timeFilter, now, serverHistoryComplete = false }: MergeAssetTaskInput) {
  // Drafts in the global engine take precedence over archived session copies.
  const memoryTasks = new Map<string, any>();
  const sessionMap = new Map<string, { sessionId: string; sessionTitle: string }>();
  const sessionByTaskId = new Map<string, { sessionId: string; sessionTitle: string } | null>();
  const activeDbTasks = dbTasks.filter((task) => !isGenerationDeleted(task.id, task.taskId, task.resultUrl, task.dbId));
  const archivedIds = new Set(activeDbTasks.map((task) => task.id));
  for (const task of generationTasks || []) {
    const key = task.id || task.dbId || task.taskId;
    if (key) memoryTasks.set(key, task);
  }
  for (const session of sessions || []) {
    for (const task of session.tasks || []) {
      const key = task.id || task.dbId || task.taskId;
      if (key && !memoryTasks.has(key)) memoryTasks.set(key, task);
      const info = { sessionId: session.id, sessionTitle: session.title };
      for (const alias of [task.id, task.dbId]) {
        if (alias) sessionMap.set(alias, { sessionId: session.id, sessionTitle: session.title });
      }
      if (task.taskId) {
        if (!sessionByTaskId.has(task.taskId)) sessionByTaskId.set(task.taskId, info);
        else if (sessionByTaskId.get(task.taskId)?.sessionId !== session.id) sessionByTaskId.set(task.taskId, null);
      }
    }
  }
  const memoryById = new Map<string, any>();
  const memoryByResult = new Map<string, any[]>();
  const memoryByTaskId = new Map<string, any[]>();
  const dbByTaskId = new Map<string, any[]>();
  const matchedMemory = new Set<any>();
  function indexMany(index: Map<string, any[]>, key: string | undefined, task: any) {
    if (!key) return;
    const tasks = index.get(key);
    if (tasks) tasks.push(task);
    else index.set(key, [task]);
  }
  for (const task of memoryTasks.values()) {
    if (task.id) memoryById.set(task.id, task);
    if (task.dbId) memoryById.set(task.dbId, task);
    indexMany(memoryByResult, task.resultUrl, task);
    indexMany(memoryByTaskId, task.taskId, task);
  }
  for (const task of activeDbTasks) indexMany(dbByTaskId, task.taskId, task);

  function matchMemory(db: any) {
    const exact = memoryById.get(db.id) || memoryById.get(db.dbId);
    if (exact) return exact;
    const sameResult = db.resultUrl ? memoryByResult.get(db.resultUrl) : undefined;
    if (sameResult?.length === 1) return sameResult[0];
    const candidates = db.taskId ? memoryByTaskId.get(db.taskId) : undefined;
    // One upstream request can produce several archive rows: never patch them all with one draft.
    return candidates?.length === 1 && dbByTaskId.get(db.taskId)?.length === 1 ? candidates[0] : undefined;
  }

  function normalizeTask(db: any, memory?: any, archived = false) {
    // Defined database fields overlay draft metadata; drafts retain metadata absent from the archive.
    const combined = { ...memory, ...Object.fromEntries(Object.entries(db).filter(([, value]) => value != null)) };
    // The server owns terminal states. Local completion only bridges a pending archive update.
    const source = db.status === 'SUCCESS' || db.status === 'FAILURE' ? db : memory || db;
    const resultUrl = source.status === 'FAILURE' ? undefined : source.resultUrl;
    const status = resultUrl ? 'SUCCESS' : source.status || 'IN_PROGRESS';
    const session = sessionMap.get(db.id) || sessionMap.get(db.dbId) || sessionMap.get(memory?.id)
      || sessionMap.get(memory?.dbId) || sessionByTaskId.get(db.taskId);
    const referenceImages = db.referenceImages || memory?.referenceImages || db.images || memory?.images || combined.rawTask?.referenceImages;
    const referenceImageUrl = db.referenceImageUrl || memory?.referenceImageUrl || db.sourceImageUrl || memory?.sourceImageUrl;

    return {
      ...combined,
      id: db.id || memory?.id || db.taskId,
      dbId: archived ? db.id : db.dbId || memory?.dbId,
      taskId: db.taskId || memory?.taskId,
      title: db.title || memory?.title,
      prompt: db.prompt || memory?.prompt || '',
      batchId: db.batchId || memory?.batchId,
      sessionId: db.sessionId || memory?.sessionId || session?.sessionId,
      sessionTitle: db.sessionTitle || memory?.sessionTitle || session?.sessionTitle,
      status,
      resultUrl,
      progress: status === 'SUCCESS' ? '100%' : status === 'FAILURE' ? '0%' : source.progress,
      failReason: status === 'FAILURE' ? source.failReason || db.failReason || memory?.failReason : undefined,
      size: db.size || memory?.size,
      quality: db.quality || memory?.quality,
      createdAt: getAssetTime(db.createdAt ?? memory?.createdAt),
      model: db.model || memory?.model,
      mediaType: resolveAssetMediaType(db.mediaType || memory?.mediaType, db.model || memory?.model, resultUrl),
      aspectRatio: db.aspectRatio || (db.size ? getAspectRatioFromSize(db.size) : memory?.aspectRatio || (memory?.size ? getAspectRatioFromSize(memory.size) : '1:1')),
      referenceImages,
      referenceImageUrl,
      images: referenceImages || combined.images,
      sourceImageUrl: referenceImageUrl || combined.sourceImageUrl,
      useReferenceImage: Boolean(referenceImages?.length || referenceImageUrl || combined.useReferenceImage),
      rawTask: { ...combined, status, resultUrl },
    };
  }

  const tasksById = new Map<string, any>();
  for (const db of activeDbTasks) {
    const memory = matchMemory(db);
    if (memory) matchedMemory.add(memory);
    const task = normalizeTask(db, memory, true);
    if (task.id) tasksById.set(task.id, task);
  }
  for (const memory of memoryTasks.values()) {
    if (isGenerationDeleted(memory.id, memory.taskId, memory.resultUrl, memory.dbId)) continue;
    if (serverHistoryComplete && memory.dbId && !archivedIds.has(memory.dbId)
      && (memory.status === 'SUCCESS' || memory.status === 'FAILURE')) continue;
    if (matchedMemory.has(memory) || (memory.taskId && dbByTaskId.has(memory.taskId))) continue;
    const task = normalizeTask(memory);
    if (task.id) tasksById.set(task.id, task);
  }

  let list = mediaCategory === 'canvas' ? [...canvasTasks] : Array.from(tasksById.values());
  if (mediaCategory !== 'canvas') {
    list = list.filter((task) => mediaCategory === 'image'
      ? task.mediaType === 'image' || task.mediaType === 'depth-image'
      : mediaCategory === 'video'
        ? task.mediaType === 'video' || task.mediaType === 'depth-video'
        : task.mediaType === 'audio');
  }
  const keyword = searchKeyword.trim().toLowerCase();
  if (keyword) {
    list = list.filter((task) => [task.prompt, task.title, task.sessionTitle, task.batchTitle, task.canvasProjectTitle, task.model]
      .some((value) => typeof value === 'string' && value.toLowerCase().includes(keyword)));
  }
  list = list.filter((task) => matchesAssetTime(task.createdAt, timeFilter, now));
  list.sort((a, b) => getAssetTime(b.createdAt) - getAssetTime(a.createdAt));
  return list;
}
