export interface TaskBatch<T = any> {
  batchId: string;
  title?: string;
  prompt: string;
  model: string;
  size?: string;
  quality?: string;
  createdAt: string | number;
  tasks: T[];
}

export function extractBaseTheme(prompt?: string, title?: string): string {
  const raw = `${title || ''} ${prompt || ''}`.trim();
  if (!raw) return '';
  return raw
    .replace(/第\s*\d+\s*[张幅页图步套]/g, '')
    .replace(/分镜\s*[\d一二三四五六七八九十]+/g, '')
    .replace(/【分镜\s*[\d一二三四五六七八九十]+】/g, '')
    .replace(/镜头\s*[\d一二三四五六七八九十]+/g, '')
    .replace(/shot\s*\d+/gi, '')
    .replace(/\(\s*\d+\s*\/\s*\d+\s*\)/g, '')
    .replace(/（\s*\d+\s*\/\s*\d+\s*）/g, '')
    .replace(/[，,。.\n\r]/g, ' ')
    .trim()
    .slice(0, 32);
}

export function areTasksInSameBatch(taskA: any, timeA: number, taskB: any, timeB: number): boolean {
  const sessionA = taskA.sessionId || taskA.rawTask?.sessionId;
  const sessionB = taskB.sessionId || taskB.rawTask?.sessionId;
  if (sessionA && sessionB && sessionA !== sessionB) return false;
  if (taskA.batchId && taskB.batchId && taskA.batchId === taskB.batchId) {
    return true;
  }
  // Conversation identities stay authoritative; timing and similar prompts cannot merge them.
  if (sessionA || sessionB) return Boolean(sessionA && sessionA === sessionB);
  if (taskA.batchId || taskB.batchId) return false;

  const timeDiff = Math.abs(timeA - timeB);
  if (timeDiff > 90000) {
    return false;
  }

  if (taskA.productId && taskB.productId && taskA.productId === taskB.productId) {
    return true;
  }

  const themeA = extractBaseTheme(taskA.prompt, taskA.title);
  const themeB = extractBaseTheme(taskB.prompt, taskB.title);

  if (themeA && themeB) {
    if (themeA === themeB || themeA.includes(themeB) || themeB.includes(themeA)) {
      return true;
    }
    let commonLen = 0;
    const minLen = Math.min(themeA.length, themeB.length);
    while (commonLen < minLen && themeA[commonLen] === themeB[commonLen]) {
      commonLen++;
    }
    if (commonLen >= 4) {
      return true;
    }
  }

  if (taskA.prompt && taskB.prompt && String(taskA.prompt).trim() === String(taskB.prompt).trim() && timeDiff < 60000) {
    return true;
  }

  if (timeDiff < 4000 && taskA.model === taskB.model) {
    return true;
  }

  return false;
}

function getTaskTime(task: any): number {
  return typeof task.createdAt === 'number'
    ? task.createdAt
    : new Date(task.createdAt || 0).getTime();
}

function isVideoTask(task: any): boolean {
  return (
    task.mediaType === 'video' ||
    task.mediaType === 'depth-video' ||
    (typeof task.id === 'string' && task.id.startsWith('depth_')) ||
    (typeof task.taskId === 'string' && task.taskId.startsWith('depth_')) ||
    (typeof task.resultUrl === 'string' && task.resultUrl.includes('.mp4'))
  );
}

function sortBatchTasks<T>(tasks: T[]): void {
  if (tasks.length <= 1) return;
  tasks.sort((a: any, b: any) => {
    if (typeof a.shotNo === 'number' && typeof b.shotNo === 'number') {
      return a.shotNo - b.shotNo;
    }
    const titleOrPromptA = `${a.title || ''} ${a.prompt || ''}`;
    const titleOrPromptB = `${b.title || ''} ${b.prompt || ''}`;
    const numA = titleOrPromptA.match(/第\s*(\d+)\s*张/)?.[1] || titleOrPromptA.match(/分镜\s*(\d+)/)?.[1];
    const numB = titleOrPromptB.match(/第\s*(\d+)\s*张/)?.[1] || titleOrPromptB.match(/分镜\s*(\d+)/)?.[1];
    if (numA && numB) {
      return parseInt(numA, 10) - parseInt(numB, 10);
    }
    return getTaskTime(a) - getTaskTime(b);
  });
}

export function groupTasksIntoBatches<T = any>(
  tasks: T[],
  options?: {
    /** Conversation feed: group only results from one explicit submission. */
    bySubmissionOnly?: boolean;
    isVideoTask?: (task: T) => boolean;
    defaultVideoModel?: string;
    defaultImageModel?: string;
    defaultVideoSize?: string;
    defaultImageSize?: string;
    resolveQuality?: (task: T, isVideo: boolean) => string | undefined;
  },
): TaskBatch<T>[] {
  if (!tasks || tasks.length === 0) return [];

  const detectVideo = options?.isVideoTask ?? ((task: any) => isVideoTask(task));
  const defaultVideoModel = options?.defaultVideoModel ?? 'doubao-seedance-2.5';
  const defaultImageModel = options?.defaultImageModel ?? 'gpt-image-2';
  const defaultVideoSize = options?.defaultVideoSize ?? '16:9';
  const defaultImageSize = options?.defaultImageSize ?? '3:4';

  const items = tasks.map((task, idx) => ({
    task,
    time: getTaskTime(task),
    idx,
  }));

  items.sort((a, b) => b.time - a.time);

  const groups: TaskBatch<T>[] = [];
  const batchIdMap = new Map<string, TaskBatch<T>>();
  const sessionIdMap = new Map<string, TaskBatch<T>>();

  items.forEach(({ task, time, idx }) => {
    const row = task as any;
    let targetBatch: TaskBatch<T> | undefined;

    // 🌟 1. 最高优先级：如果任务归属于某个生图会话 (sessionId)，则无论时间相隔多久、多轮生成，均归入同一个文件夹批次！
    const rawSessionId = options?.bySubmissionOnly ? undefined : row.sessionId || row.rawTask?.sessionId;
    const rawSessionTitle = options?.bySubmissionOnly ? undefined : row.sessionTitle || row.rawTask?.sessionTitle;

    if (rawSessionId) {
      targetBatch = sessionIdMap.get(String(rawSessionId));
    }

    // 🌟 2. 次优先级：按明确的 batchId 归并
    if (!targetBatch && row.batchId) {
      targetBatch = batchIdMap.get(String(row.batchId));
      const targetSessionId = (targetBatch?.tasks[0] as any)?.sessionId || (targetBatch?.tasks[0] as any)?.rawTask?.sessionId;
      if (rawSessionId && targetSessionId && rawSessionId !== targetSessionId) targetBatch = undefined;
    }

    // 🌟 3. 第三优先级：90 秒时间窗口与主题相似度启发式聚类 (适用于未绑定会话的历史散客任务)
    if (!targetBatch && !options?.bySubmissionOnly) {
      for (let i = groups.length - 1; i >= 0; i--) {
        const candidate = groups[i];
        const candTime = getTaskTime(candidate.tasks[0]);
        if (Math.abs(time - candTime) > 90000) break;
        if (areTasksInSameBatch(row, time, candidate.tasks[0], candTime)) {
          targetBatch = candidate;
          break;
        }
      }
    }

    if (targetBatch) {
      targetBatch.tasks.push(task);
      if (row.batchId) batchIdMap.set(String(row.batchId), targetBatch);
      if (rawSessionId) sessionIdMap.set(String(rawSessionId), targetBatch);
      // 如果该批次先前没有设置 title，或者当前任务携带了更完整的 sessionTitle，补充更新
      if (rawSessionTitle && (!targetBatch.title || targetBatch.title === 'AI 生图创作' || targetBatch.title === 'AI 批量分镜生图')) {
        targetBatch.title = rawSessionTitle;
      }
      return;
    }

    const isTaskVideo = detectVideo(task);
    const uniqueFallbackId = rawSessionId 
      ? `session_${rawSessionId}` 
      : String(row.batchId || (row.id || row.taskId ? `batch-${row.id || row.taskId}` : `batch-${time}-${idx}`));

    const taskQuality =
      options?.resolveQuality?.(task, isTaskVideo) ??
      (isTaskVideo
        ? row.quality === 'high' || !row.quality
          ? '720P'
          : String(row.quality)
        : String(row.quality || 'medium'));

    // 标题优先采用对话名称 (sessionTitle)，其次为任务 title
    const batchTitle = rawSessionTitle || row.batchTitle || row.title;

    const newBatch: TaskBatch<T> = {
      batchId: uniqueFallbackId,
      prompt: String(row.prompt || ''),
      title: batchTitle,
      model: String(row.model || (isTaskVideo ? defaultVideoModel : defaultImageModel)),
      size: String(row.size || (isTaskVideo ? defaultVideoSize : defaultImageSize)),
      quality: taskQuality,
      createdAt: row.createdAt ?? time,
      tasks: [task],
    };

    groups.push(newBatch);
    if (rawSessionId) {
      sessionIdMap.set(String(rawSessionId), newBatch);
    }
    if (row.batchId) {
      batchIdMap.set(String(row.batchId), newBatch);
    }
  });

  groups.forEach((group) => {
    sortBatchTasks(group.tasks);
    const first = group.tasks[0] as any;
    if (first?.prompt && !group.prompt) {
      group.prompt = first.prompt;
    }
  });

  return groups;
}
