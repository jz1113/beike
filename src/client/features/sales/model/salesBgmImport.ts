import type { SalesBgmCandidate } from '@shared/domain/sales';

export type BgmDurationFilter = 'all' | 'short' | 'medium' | 'long';
export const BGM_DURATION_FILTERS = [
  { value: 'all', label: '全部时长' },
  { value: 'short', label: '15 秒以内' },
  { value: 'medium', label: '15–30 秒' },
  { value: 'long', label: '30 秒以上' },
] as const;

export function matchesBgmDuration(duration: number | undefined, filter: BgmDurationFilter): boolean {
  if (filter === 'all') return true;
  if (!duration || !Number.isFinite(duration)) return false;
  return filter === 'short' ? duration <= 15 : filter === 'medium' ? duration > 15 && duration <= 30 : duration > 30;
}

export function formatBgmDuration(duration: number | undefined): string {
  if (!duration || !Number.isFinite(duration)) return '时长待识别';
  return `${Number(duration.toFixed(1))} 秒`;
}

export interface BgmImportItem {
  key: string;
  title: string;
  file?: File;
  builtinId?: string;
  audioUrl?: string;
  status: 'queued' | 'uploading' | 'saving' | 'done' | 'error';
  error?: string;
  durationSec?: number;
}

const MAX_FILES = 30;
const MAX_AUDIO_BYTES = 32 * 1024 * 1024;

export function addBgmUploadFiles(existing: readonly BgmImportItem[], files: readonly File[]) {
  const items = [...existing];
  const errors: string[] = [];
  for (const file of files) {
    const key = `file:${file.name}:${file.size}:${file.lastModified}`;
    if (items.some((item) => item.key === key)) continue;
    if (!/\.(mp3|wav|m4a|aac|ogg|flac|opus)$/i.test(file.name)) {
      errors.push(`${file.name}：请选择 MP3、WAV、M4A、AAC、OGG、FLAC 或 OPUS 音频`);
      continue;
    }
    if (!file.size || file.size > MAX_AUDIO_BYTES) {
      errors.push(`${file.name}：文件须大于 0 且不超过 32 MB`);
      continue;
    }
    if (items.length >= MAX_FILES) { errors.push('每批最多 30 首，请完成本批后继续导入'); break; }
    items.push({ key, title: file.name.replace(/\.[^.]+$/, '').slice(0, 200) || '未命名配乐', file, status: 'queued' });
  }
  return { items, errors };
}

interface BgmImportServices {
  upload: (file: File, signal: AbortSignal) => Promise<string>;
  save: (input: { title: string; audioUrl?: string; builtinId?: string; durationSec?: number }, signal: AbortSignal) => Promise<SalesBgmCandidate>;
}

// Keep uploaded URLs in the queue so retrying a failed save does not upload again.
export async function runBgmImportBatch(
  items: readonly BgmImportItem[], durationSec: number | undefined, signal: AbortSignal,
  services: BgmImportServices, onUpdate: (key: string, patch: Partial<BgmImportItem>) => void,
): Promise<number> {
  let saved = 0;
  for (const item of items) {
    if (signal.aborted) break;
    if (item.status === 'done') continue;
    try {
      let audioUrl = item.audioUrl;
      if (item.file && !audioUrl) {
        onUpdate(item.key, { status: 'uploading', error: '' });
        audioUrl = await services.upload(item.file, signal);
        signal.throwIfAborted();
        onUpdate(item.key, { audioUrl });
      }
      onUpdate(item.key, { status: 'saving', error: '' });
      const bgm = await services.save({ title: item.title, ...(item.builtinId ? { builtinId: item.builtinId } : { audioUrl }), durationSec }, signal);
      signal.throwIfAborted();
      saved += 1;
      onUpdate(item.key, { status: 'done', durationSec: bgm.durationSec, error: '' });
    } catch (error) {
      if (signal.aborted) break;
      onUpdate(item.key, { status: 'error', error: error instanceof Error ? error.message : '导入失败，请重试' });
    }
  }
  return saved;
}
