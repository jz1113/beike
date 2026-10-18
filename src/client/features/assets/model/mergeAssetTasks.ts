import { isGenerationDeleted } from '@client/store/persist/generation';
import { getAspectRatioFromSize } from '@shared/domain/media/drawing';
import { getAssetTime, matchesAssetTime, resolveAssetMediaType, type AssetMediaCategory, type AssetTimeFilter } from '@client/shared/utils/assetTaskData';
import type { useAppStore } from '@client/store';
import { isPureAgentDialogue } from './agentAssetFilter';

type AppState = ReturnType<typeof useAppStore.getState>;

export interface MergedAssetTask {
  id: string;
  dbId?: string;
  taskId?: string;
  resultUrl?: string;
  status?: string;
  title?: string;
  prompt?: string;
  batchId?: string;
  sessionId?: string;
  sessionTitle?: string;
  progress?: string;
  failReason?: string;
  size?: string;
  quality?: string;
  createdAt?: unknown;
  model?: string;
  mediaType?: string;
  aspectRatio?: string;
  referenceImages?: string[];
  referenceImageUrl?: string;
  images?: string[];
  sourceImageUrl?: string;
  useReferenceImage?: boolean;
  rawTask?: { id?: string; status?: string; resultUrl?: string; referenceImages?: string[] };
  batchTitle?: string;
  canvasProjectTitle?: string;
  duration?: number | string;
  coverUrl?: string;
  isUploaded?: boolean;
}

interface MergeAssetTaskInput {
  dbTasks: MergedAssetTask[];
  generationTasks: AppState['generationTasks'];
  sessions: AppState['sessions'];
  canvasTasks: MergedAssetTask[];
  mediaCategory: AssetMediaCategory;
  searchKeyword: string;
  timeFilter: AssetTimeFilter;
  now?: Date;
  serverHistoryComplete?: boolean;
}

export function mergeAssetTasks({ dbTasks, generationTasks, sessions, canvasTasks, mediaCategory, searchKeyword, timeFilter, now, serverHistoryComplete = false }: MergeAssetTaskInput) {
  // Drafts in the global engine take precedence over archived session copies.
  const memoryTasks = new Map<string, MergedAssetTask>();
  const sessionMap = new Map<string, { sessionId: string; sessionTitle: string }>();
  const sessionByTaskId = new Map<string, { sessionId: string; sessionTitle: string } | null>();
  const activeDbTasks = dbTasks.filter((task) => !isGenerationDeleted(task.id, task.taskId, task.resultUrl, task.dbId));
  const archivedIds = new Set(activeDbTasks.map((task) => task.id));
  for (const task of generationTasks || []) {
    if (isPureAgentDialogue(task)) continue;
    const key = task.id || task.dbId || task.taskId;
    if (key) memoryTasks.set(key, task);
  }
  for (const session of sessions || []) {
    for (const task of session.tasks || []) {
      if (isPureAgentDialogue(task)) continue;
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
  const memoryById = new Map<string, MergedAssetTask>();
  const memoryByResult = new Map<string, MergedAssetTask[]>();
  const memoryByTaskId = new Map<string, MergedAssetTask[]>();
  const dbByTaskId = new Map<string, MergedAssetTask[]>();
  const matchedMemory = new Set<MergedAssetTask>();
  function indexMany(index: Map<string, MergedAssetTask[]>, key: string | undefined, task: MergedAssetTask) {
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

  function matchMemory(db: MergedAssetTask) {
    const exact = memoryById.get(db.id) || (db.dbId ? memoryById.get(db.dbId) : undefined);
    if (exact) return exact;
    const sameResult = db.resultUrl ? memoryByResult.get(db.resultUrl) : undefined;
    if (sameResult?.length === 1) return sameResult[0];
    const candidates = db.taskId ? memoryByTaskId.get(db.taskId) : undefined;
    // One upstream request can produce several archive rows: never patch them all with one draft.
    const taskId = db.taskId;
    return taskId && candidates?.length === 1 && dbByTaskId.get(taskId)?.length === 1 ? candidates[0] : undefined;
  }

  function normalizeTask(db: MergedAssetTask, memory?: MergedAssetTask, archived = false) {
    // Defined database fields overlay draft metadata; drafts retain metadata absent from the archive.
    const combined = { ...memory, ...Object.fromEntries(Object.entries(db).filter(([, value]) => value != null)) };
    // The server owns terminal states. Local completion only bridges a pending archive update.
    const source = db.status === 'SUCCESS' || db.status === 'FAILURE' ? db : memory || db;
    const resultUrl = source.status === 'FAILURE' ? undefined : source.resultUrl;
    const status = resultUrl ? 'SUCCESS' : source.status || 'IN_PROGRESS';
    const sessionFor = (id?: string) => id ? sessionMap.get(id) : undefined;
    const session = sessionFor(db.id) || sessionFor(db.dbId) || sessionFor(memory?.id)
      || sessionFor(memory?.dbId) || (db.taskId ? sessionByTaskId.get(db.taskId) : undefined);
    const referenceImages = db.referenceImages || memory?.referenceImages || db.images || memory?.images || combined.rawTask?.referenceImages;
    const referenceImageUrl = db.referenceImageUrl || memory?.referenceImageUrl || db.sourceImageUrl || memory?.sourceImageUrl;
    const resolvedType = resolveAssetMediaType(db.mediaType || memory?.mediaType, db.model || memory?.model, resultUrl);

    return {
      ...combined,
      id: db.id || memory?.id || db.taskId || '',
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
      mediaType: resolvedType,
      aspectRatio: db.aspectRatio || (db.size ? getAspectRatioFromSize(db.size) : memory?.aspectRatio || (memory?.size ? getAspectRatioFromSize(memory.size) : '1:1')),
      referenceImages,
      referenceImageUrl,
      images: referenceImages || combined.images,
      sourceImageUrl: referenceImageUrl || combined.sourceImageUrl,
      useReferenceImage: Boolean(referenceImages?.length || referenceImageUrl || combined.useReferenceImage),
      rawTask: { ...combined, status, resultUrl },
    };
  }

  const tasksById = new Map<string, MergedAssetTask>();
  for (const db of activeDbTasks) {
    if (isPureAgentDialogue(db)) continue;
    const memory = matchMemory(db);
    if (memory) matchedMemory.add(memory);
    const task = normalizeTask(db, memory, true);
    if (task.id) tasksById.set(task.id, task);
  }
  for (const memory of memoryTasks.values()) {
    if (isPureAgentDialogue(memory)) continue;
    if (isGenerationDeleted(memory.id, memory.taskId, memory.resultUrl, memory.dbId)) continue;
    if (serverHistoryComplete && memory.dbId && !archivedIds.has(memory.dbId)
      && (memory.status === 'SUCCESS' || memory.status === 'FAILURE')) continue;
    if (matchedMemory.has(memory) || (memory.taskId && dbByTaskId.has(memory.taskId))) continue;
    const task = normalizeTask(memory);
    if (task.id) tasksById.set(task.id, task);
  }

  let list = mediaCategory === 'canvas' ? [...canvasTasks] : Array.from(tasksById.values());
  if (mediaCategory !== 'canvas' && mediaCategory !== 'all') {
    list = list.filter((task) => {
      if (mediaCategory === 'image') return task.mediaType === 'image' || task.mediaType === 'depth-image';
      if (mediaCategory === 'video') return task.mediaType === 'video' || task.mediaType === 'depth-video';
      if (mediaCategory === 'audio') return task.mediaType === 'audio';
      if (mediaCategory === 'document') return task.mediaType === 'doc' || task.mediaType === 'document';
      return true;
    });
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
