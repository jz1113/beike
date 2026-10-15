import type { AssetTaskBatch } from './assetBatch';
import { getAssetMediaKind } from './assetMedia';
import { useI18nStore, TRANSLATIONS, type SupportedLocale } from '@client/shared/i18n';

type Task = AssetTaskBatch['tasks'][number];

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
  let list = [...tasks];
  if (opts.sourceType === 'uploaded') {
    list = list.filter((t) => t.isUploaded || t.sourceImageUrl || t.referenceImageUrl);
  }
  if (opts.mediaCategory !== 'all') {
    list = list.filter((t) => getAssetMediaKind(t) === opts.mediaCategory);
  }
  if (opts.statusFilter && opts.statusFilter !== 'all') {
    if (opts.statusFilter === 'completed') {
      list = list.filter((t) => t.resultUrl && t.status !== 'FAILURE');
    } else if (opts.statusFilter === 'failed') {
      list = list.filter((t) => t.status === 'FAILURE');
    }
  }
  if (opts.timeFilter && opts.timeFilter !== 'all') {
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();
    const yesterdayMs = todayMs - 86400000;
    list = list.filter((t) => {
      const time = new Date(t.createdAt).getTime() || 0;
      if (opts.timeFilter === 'today') return time >= todayMs;
      if (opts.timeFilter === 'yesterday') return time >= yesterdayMs && time < todayMs;
      if (opts.timeFilter === '7days') return time >= now - 7 * 86400000;
      if (opts.timeFilter === '30days') return time >= now - 30 * 86400000;
      return true;
    });
  }
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
    const timeA = new Date(a.createdAt).getTime() || 0;
    const timeB = new Date(b.createdAt).getTime() || 0;
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
  const yesterdayStart = todayStart - 86400000;
  const time = d.getTime();

  if (time >= todayStart) {
    return { key: 'today', label: t.today, order: 9999999999 };
  }
  if (time >= yesterdayStart) {
    return { key: 'yesterday', label: t.yesterday, order: 9999999998 };
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
