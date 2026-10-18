export type AssetMediaCategory = 'image' | 'video' | 'audio' | 'canvas' | 'all' | 'document';
export type AssetTimeFilter = 'all' | 'today' | 'yesterday' | '7days' | '30days';

export function getAssetTime(createdAt: unknown): number {
  const time = typeof createdAt === 'number' ? createdAt : new Date(String(createdAt ?? '')).getTime();
  return Number.isFinite(time) ? time : 0;
}

/** Explicit media metadata takes precedence over model names and signed URL query parameters. */
export function resolveAssetMediaType(mediaType: unknown, model: unknown, resultUrl: unknown): string {
  const explicit = String(mediaType || '').toLowerCase();
  if (['image', 'video', 'audio', 'depth-image', 'depth-video', 'doc', 'document'].includes(explicit)) {
    return explicit === 'document' ? 'doc' : explicit;
  }
  const path = String(resultUrl || '').split(/[?#]/)[0].toLowerCase();
  if (/\.(mp3|wav|m4a|aac|ogg|flac)$/.test(path)) return 'audio';
  if (/\.(pdf|docx?|txt|md|markdown|pptx?)$/.test(path)) return 'doc';
  if (/\.(mp4|webm|mov|m4v)$/.test(path)) return 'video';
  if (/video|seedance|veo|kling|sora|minimax|h3|wan|vidu|omni_flash/i.test(String(model || ''))) return 'video';
  return 'image';
}

export function matchesAssetTime(createdAt: unknown, filter: AssetTimeFilter, now = new Date()): boolean {
  if (filter === 'all') return true;
  const time = getAssetTime(createdAt);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (filter === 'today') return time >= today.getTime() && time < tomorrow.getTime();
  if (filter === 'yesterday') return time >= yesterday.getTime() && time < today.getTime();
  return time >= now.getTime() - (filter === '7days' ? 7 : 30) * 86400000 && time <= now.getTime();
}

/** Use raw server counts; deduplication and deletion tombstones must not drive pagination. */
export function getNextAssetPage(lastPage: { tasks: unknown[]; total: number }, page: number, pageSize = 40): number | undefined {
  return lastPage.tasks.length > 0 && page * pageSize < lastPage.total ? page + 1 : undefined;
}

interface AssetPollingTask {
  status?: string;
  resultUrl?: string;
  createdAt?: unknown;
}

/** Old unfinished history stays visible, but cannot start an endless background polling loop. */
export function isAssetTaskPollable(task: AssetPollingTask, now = Date.now()): boolean {
  const createdAt = getAssetTime(task.createdAt);
  return !task.resultUrl && ['IN_PROGRESS', 'PENDING', 'IDLE'].includes(task.status || '')
    && createdAt > 0 && createdAt <= now && now - createdAt <= 24 * 60 * 60 * 1000;
}

/** The first page detects new records; stable completed pages do not need repeated requests. */
export function getAssetPollingPages(pages: Array<{ tasks: AssetPollingTask[] }>, pageParams: number[], now = Date.now()): number[] {
  if (!pages.some((page) => page.tasks.some((task) => isAssetTaskPollable(task, now)))) return [];
  const targets = new Set<number>([1]);
  pages.forEach((page, index) => {
    if (page.tasks.some((task) => isAssetTaskPollable(task, now))) targets.add(pageParams[index]);
  });
  return [...targets].filter((page) => Number.isInteger(page) && page > 0).sort((a, b) => a - b);
}

/** Insertions/deletions change offset boundaries and require a consistent history refresh. */
export function hasAssetPageMembershipChanged<T extends { id: string }>(previous: { tasks: T[]; total: number }, next: { tasks: T[]; total: number }): boolean {
  return previous.total !== next.total || previous.tasks.length !== next.tasks.length
    || previous.tasks.some((task, index) => task.id !== next.tasks[index]?.id);
}

export async function loadAssetPollingPages<T>(pages: number[], load: (page: number) => Promise<T>): Promise<Array<{ page: number; data: T }>> {
  const results: Array<{ page: number; data: T }> = [];
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(3, pages.length) }, async () => {
    while (nextIndex < pages.length) {
      const index = nextIndex++;
      results[index] = { page: pages[index], data: await load(pages[index]) };
    }
  }));
  return results;
}

export function getAssetDownloadExtension(mediaType: unknown, url: unknown): string {
  const extension = String(url || '').split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (extension && ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'mp4', 'webm', 'mov', 'mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'pdf', 'docx', 'pptx', 'md', 'txt'].includes(extension)) return extension;
  if (mediaType === 'video' || mediaType === 'depth-video') return 'mp4';
  if (mediaType === 'audio') return 'mp3';
  if (mediaType === 'doc' || mediaType === 'document') return 'md';
  return 'jpg';
}
