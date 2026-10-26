import type { MergedAssetTask } from './mergeAssetTasks';
import { getAssetTime, matchesAssetTime } from '@client/shared/utils/assetTaskData';
import { getAssetMediaKind } from './assetMedia';
import { isPureAgentDialogue } from './agentAssetFilter';
import { useI18nStore, TRANSLATIONS, type SupportedLocale } from '@client/shared/i18n';

type Task = MergedAssetTask;

export interface TimelineGroup {
  key: string;
  label: string;
  order: number;
  tasks: Task[];
}

export interface MaterialFilterOptions {
  sourceType: 'ai' | 'uploaded';
  mediaCategory: 'all' | 'image' | 'video' | 'audio' | 'document';
  statusFilter?: 'all' | 'completed' | 'failed';
  timeFilter?: 'all' | 'today' | 'yesterday' | '7days' | '30days';
  searchInput: string;
  sortOrder: 'newest' | 'oldest' | 'name';
}

export function filterMaterialTasks(tasks: Task[], opts: MaterialFilterOptions): Task[] {
  let list = tasks.filter((t) => !isPureAgentDialogue(t));
  // A reference attached to a generation is not an independent uploaded asset.
  list = list.filter((task) => opts.sourceType === 'uploaded' ? task.isUploaded === true : !task.isUploaded);
  if (opts.mediaCategory !== 'all') {
    list = list.filter((t) => getAssetMediaKind(t) === opts.mediaCategory);
  }
  if (opts.statusFilter && opts.statusFilter !== 'all') {
    if (opts.statusFilter === 'completed') {
      list = list.filter((t) => (t.resultUrl || getAssetMediaKind(t) === 'document') && t.status !== 'FAILURE');
    } else if (opts.statusFilter === 'failed') {
      list = list.filter((t) => t.status === 'FAILURE');
    }
  }
  list = list.filter((task) => matchesAssetTime(task.createdAt, opts.timeFilter || 'all'));
  const kw = opts.searchInput.trim().toLowerCase();
  if (kw) {
    list = list.filter((t) => (t.title || t.prompt || '').toLowerCase().includes(kw));
  }
  return list.sort((a, b) => {
    if (opts.sortOrder === 'name') {
      const titleA = a.title || a.prompt || '';
      const titleB = b.title || b.prompt || '';
      const currentLocale = useI18nStore.getState().locale || 'zh-CN';
      return titleA.localeCompare(titleB, currentLocale);
    }
    const timeA = getAssetTime(a.createdAt);
    const timeB = getAssetTime(b.createdAt);
    return opts.sortOrder === 'oldest' ? timeA - timeB : timeB - timeA;
  });
}

export function formatTimelineDate(
  timestamp: unknown,
  locale?: SupportedLocale
): { key: string; label: string; order: number } {
  const currentLocale = locale || useI18nStore.getState().locale || 'zh-CN';
  const t = TRANSLATIONS[currentLocale]?.assets?.timeline || TRANSLATIONS['zh-CN'].assets.timeline;

  const d = new Date(timestamp as string | number);
  if (isNaN(d.getTime())) {
    return { key: 'earlier', label: t.earlier, order: 0 };
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterdayStart = yesterday.getTime();
  const time = d.getTime();

  if (time >= todayStart) {
    return { key: 'today', label: t.today, order: todayStart };
  }
  if (time >= yesterdayStart) {
    return { key: 'yesterday', label: t.yesterday, order: yesterdayStart };
  }

  const isSameYear = d.getFullYear() === now.getFullYear();
  const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const label = d.toLocaleDateString(currentLocale, isSameYear ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' });
  const order = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  return { key, label, order };
}

export function groupTasksByTimeline(
  tasks: Task[],
  sortOrder: 'newest' | 'oldest' | 'name',
  locale?: SupportedLocale
): TimelineGroup[] {
  if (sortOrder === 'name') {
    return tasks.length ? [{ key: 'name', label: '', order: 0, tasks }] : [];
  }
  const map = new Map<string, { label: string; order: number; tasks: Task[] }>();

  for (const task of tasks) {
    const { key, label, order } = formatTimelineDate(task.createdAt, locale);
    if (!map.has(key)) {
      map.set(key, { label, order, tasks: [] });
    }
    map.get(key)!.tasks.push(task);
  }

  return Array.from(map.entries())
    .map(([key, group]) => ({ key, ...group }))
    .sort((a, b) => (sortOrder === 'oldest' ? a.order - b.order : b.order - a.order));
}
