import type { GenerationTask } from '@/types/app-store';
import { groupTasksIntoBatches as groupTasksCore } from '@/shared/utils/taskBatchGrouping';

export type TimeFilter = 'all' | 'today' | '7days' | '30days' | '90days' | 'custom';
export type ModeFilter = 'all' | 'image' | 'video' | 'depth-image' | 'depth-video';
export type StatusFilter = 'all' | 'success' | 'progress' | 'failure';

export interface TaskBatchGroup {
  batchId: string;
  prompt: string;
  title?: string;
  model: string;
  size: string;
  quality?: string;
  referenceImageUrl?: string;
  createdAt: number;
  tasks: GenerationTask[];
}

export interface DateBatchGroup {
  dateLabel: string;
  batches: TaskBatchGroup[];
}

export interface FlatBatchItem {
  dateLabel: string;
  batch: TaskBatchGroup;
  bIdx: number;
}

const VIDEO_MODEL_RE =
  /seedance|veo|kling|minimax|h3|hailuo|wan|vidu|luma|hunyuan/i;

export function isGenerateVideoTask(task: GenerationTask): boolean {
  return (
    task.mediaType === 'depth-video' ||
    task.mediaType === 'video' ||
    Boolean(task.resultUrl?.includes('.mp4')) ||
    (task.id || '').startsWith('depth_') ||
    (task.taskId || '').startsWith('depth_') ||
    Boolean(task.model && VIDEO_MODEL_RE.test(task.model))
  );
}

/**
 * 格式化日期为 YY-MM-DD 紧凑字符串 (如 26-09-05)
 */
export function formatDateYYMMDD(val: Date | string | number): string {
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function filterGenerationTasks(
  tasks: GenerationTask[],
  opts: {
    searchQuery: string;
    timeFilter: TimeFilter;
    modeFilter: ModeFilter;
    statusFilter: StatusFilter;
    customStartDate?: string;
    customEndDate?: string;
  },
): GenerationTask[] {
  const { searchQuery, timeFilter, modeFilter, statusFilter, customStartDate, customEndDate } = opts;

  return tasks.filter((t) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchPrompt = t.prompt && t.prompt.toLowerCase().includes(q);
      const matchTitle = t.title && t.title.toLowerCase().includes(q);
      if (!matchPrompt && !matchTitle) return false;
    }

    if (timeFilter !== 'all') {
      const createdAt =
        typeof t.createdAt === 'number' ? t.createdAt : new Date(t.createdAt || 0).getTime();
      const diffMs = Date.now() - createdAt;
      if (timeFilter === 'today') {
        const startOfToday = new Date().setHours(0, 0, 0, 0);
        if (createdAt < startOfToday) return false;
      } else if (timeFilter === '7days') {
        if (diffMs > 7 * 24 * 60 * 60 * 1000) return false;
      } else if (timeFilter === '30days') {
        if (diffMs > 30 * 24 * 60 * 60 * 1000) return false;
      } else if (timeFilter === '90days') {
        if (diffMs > 90 * 24 * 60 * 60 * 1000) return false;
      } else if (timeFilter === 'custom') {
        if (customStartDate) {
          const startMs = new Date(customStartDate).setHours(0, 0, 0, 0);
          if (createdAt < startMs) return false;
        }
        if (customEndDate) {
          const endMs = new Date(customEndDate).setHours(23, 59, 59, 999);
          if (createdAt > endMs) return false;
        }
      }
    }

    if (modeFilter !== 'all') {
      const isDepthVid =
        t.mediaType === 'depth-video' ||
        (t.id || '').startsWith('depth_') ||
        (t.taskId || '').startsWith('depth_') ||
        Boolean(t.model && /depth-video|depth_video/i.test(t.model));
      const isDepthImg = t.mediaType === 'depth-image';
      const isVid = !isDepthVid && isGenerateVideoTask(t);
      const isImg = !isDepthVid && !isDepthImg && !isVid;

      if (modeFilter === 'image' && !isImg) return false;
      if (modeFilter === 'video' && !isVid) return false;
      if (modeFilter === 'depth-image' && !isDepthImg) return false;
      if (modeFilter === 'depth-video' && !isDepthVid) return false;
    }

    if (statusFilter === 'success' && t.status !== 'SUCCESS') return false;
    if (statusFilter === 'progress' && t.status !== 'IN_PROGRESS') return false;
    if (statusFilter === 'failure' && t.status !== 'FAILURE') return false;

    return true;
  });
}

/**
 * 🌟 核心业务逻辑：按时间范围严格筛选对话列表 (filterChatSessionsByTime)
 */
export function filterChatSessionsByTime<T extends { id: string; createdAt: number; tasks?: GenerationTask[] }>(
  sessions: T[],
  timeFilter: TimeFilter,
  customStartDate?: string,
  customEndDate?: string,
): T[] {
  if (timeFilter === 'all') return sessions;

  return sessions.filter((sess) => {
    // 优先取该对话内任务最新的生成时间，若无任务则取对话自身创建时间
    const taskTimes = (sess.tasks || []).map((t) =>
      typeof t.createdAt === 'number' ? t.createdAt : new Date(t.createdAt || 0).getTime(),
    );
    const sessionTime =
      taskTimes.length > 0 ? Math.max(...taskTimes, sess.createdAt || 0) : (sess.createdAt || 0);

    const diffMs = Date.now() - sessionTime;

    if (timeFilter === 'today') {
      const startOfToday = new Date().setHours(0, 0, 0, 0);
      return sessionTime >= startOfToday;
    }
    if (timeFilter === '7days') {
      return diffMs <= 7 * 24 * 60 * 60 * 1000;
    }
    if (timeFilter === '30days') {
      return diffMs <= 30 * 24 * 60 * 60 * 1000;
    }
    if (timeFilter === '90days') {
      return diffMs <= 90 * 24 * 60 * 60 * 1000;
    }
    if (timeFilter === 'custom') {
      if (customStartDate) {
        const startMs = new Date(customStartDate).setHours(0, 0, 0, 0);
        if (sessionTime < startMs) return false;
      }
      if (customEndDate) {
        const endMs = new Date(customEndDate).setHours(23, 59, 59, 999);
        if (sessionTime > endMs) return false;
      }
      return true;
    }
    return true;
  });
}

export function groupTasksIntoBatches(filteredTasks: GenerationTask[]): TaskBatchGroup[] {
  const batches = groupTasksCore(filteredTasks, {
    bySubmissionOnly: true,
    isVideoTask: isGenerateVideoTask,
    resolveQuality: (task, isVideo) =>
      isVideo
        ? task.quality === 'high' || !task.quality
          ? task.videoResolution || '720P'
          : task.quality
        : task.quality || 'medium',
  }).map((batch) => ({
    batchId: batch.batchId,
    prompt: batch.prompt,
    title: batch.title,
    model: batch.model,
    size: batch.size || (isGenerateVideoTask(batch.tasks[0]) ? '16:9' : '3:4'),
    quality: batch.quality,
    referenceImageUrl: batch.tasks[0]?.referenceImageUrl,
    createdAt:
      typeof batch.createdAt === 'number'
        ? batch.createdAt
        : new Date(batch.createdAt || 0).getTime() || Date.now(),
    // Core grouping already orders by shotNo (then title sequence for legacy tasks).
    // Re-sorting by timestamp here undoes that order after async task updates.
    tasks: (batch.tasks as GenerationTask[]).slice(),
  }));

  // 🌟 自上而下时间线：最早生成的批次在上方，最新生成的任务在最下方
  return batches.sort((a, b) => a.createdAt - b.createdAt);
}

export function groupBatchesByDate(taskBatches: TaskBatchGroup[]): DateBatchGroup[] {
  const groups: DateBatchGroup[] = [];
  const now = new Date();
  const todayStr = now.toDateString();
  const yDay = new Date();
  yDay.setDate(yDay.getDate() - 1);
  const yesterdayStr = yDay.toDateString();

  taskBatches.forEach((batch) => {
    const d = new Date(batch.createdAt || Date.now());
    let label = '更早';
    if (d.toDateString() === todayStr) {
      label = '今天';
    } else if (d.toDateString() === yesterdayStr) {
      label = '昨天';
    } else {
      label = `${d.getMonth() + 1}月${d.getDate()}日`;
    }

    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.dateLabel === label) {
      lastGroup.batches.push(batch);
    } else {
      groups.push({ dateLabel: label, batches: [batch] });
    }
  });

  return groups;
}

export function flattenDateBatches(dateGroupedBatches: DateBatchGroup[]): FlatBatchItem[] {
  const out: FlatBatchItem[] = [];
  dateGroupedBatches.forEach((group) => {
    group.batches.forEach((batch, bIdx) => {
      out.push({ dateLabel: group.dateLabel, batch, bIdx });
    });
  });
  return out;
}
