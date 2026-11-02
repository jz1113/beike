import { describe, expect, it, vi } from 'vitest';
import type { SalesBgmCandidate } from '@shared/domain/sales';
import { addBgmUploadFiles, formatBgmDuration, matchesBgmDuration, runBgmImportBatch, type BgmImportItem } from './salesBgmImport';

const file = (name = '配乐.mp3') => new File(['music'], name, { type: 'audio/mpeg', lastModified: 1 });
const bgm = { durationSec: 12 } as SalesBgmCandidate;

describe('BGM duration filters', () => {
  it('uses exclusive boundaries and excludes unknown durations from short tracks', () => {
    expect(matchesBgmDuration(15, 'short')).toBe(true);
    expect(matchesBgmDuration(15, 'medium')).toBe(false);
    expect(matchesBgmDuration(30, 'medium')).toBe(true);
    expect(matchesBgmDuration(30, 'long')).toBe(false);
    expect(matchesBgmDuration(31, 'long')).toBe(true);
    expect(matchesBgmDuration(undefined, 'short')).toBe(false);
    expect(matchesBgmDuration(0, 'short')).toBe(false);
    expect(formatBgmDuration(12.234)).toBe('12.2 秒');
    expect(formatBgmDuration(undefined)).toBe('时长待识别');
  });
});

describe('batch BGM uploads', () => {
  it('keeps valid files, deduplicates repeated selections, and reports bad files', () => {
    const large = file('超大.wav');
    Object.defineProperty(large, 'size', { value: 32 * 1024 * 1024 + 1 });
    const first = addBgmUploadFiles([], [file(), file('视频.mp4'), large, new File([], '空.mp3')]);
    expect(first.items).toHaveLength(1);
    expect(first.items[0].title).toBe('配乐');
    expect(first.errors).toHaveLength(3);
    const second = addBgmUploadFiles(first.items, [file(), file('另一首.M4A')]);
    expect(second.items).toHaveLength(2);
  });

  it('caps a batch at 30 across several selections', () => {
    const first = addBgmUploadFiles([], Array.from({ length: 29 }, (_, index) => file(`${index}.mp3`)));
    const next = addBgmUploadFiles(first.items, [file('30.mp3'), file('31.mp3')]);
    expect(next.items).toHaveLength(30);
    expect(next.errors).toEqual(['每批最多 30 首，请完成本批后继续导入']);
  });

  it('retries failed saves with a newly chosen duration without reuploading or repeating successful items', async () => {
    let items = addBgmUploadFiles([], [file('失败.mp3'), file('成功.mp3')]).items;
    const update = (key: string, patch: Partial<BgmImportItem>) => { items = items.map((item) => item.key === key ? { ...item, ...patch } : item); };
    const upload = vi.fn().mockResolvedValueOnce('/storage/first.mp3').mockResolvedValueOnce('/storage/second.mp3');
    const save = vi.fn().mockRejectedValueOnce(new Error('暂时不可用')).mockResolvedValue(bgm);
    const signal = new AbortController().signal;
    expect(await runBgmImportBatch(items, undefined, signal, { upload, save }, update)).toBe(1);
    expect(items.map((item) => item.status)).toEqual(['error', 'done']);
    expect(items[0]).toMatchObject({ audioUrl: '/storage/first.mp3', error: '暂时不可用' });
    expect(await runBgmImportBatch(items, 10, signal, { upload, save }, update)).toBe(1);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenCalledTimes(3);
    expect(save).toHaveBeenLastCalledWith({ title: '失败', audioUrl: '/storage/first.mp3', durationSec: 10 }, signal);
    expect(items.every((item) => item.status === 'done')).toBe(true);
  });

  it('imports builtins without an upload and stops the queue when disposed', async () => {
    const controller = new AbortController();
    const upload = vi.fn();
    const save = vi.fn().mockImplementation(async () => { controller.abort(); return bgm; });
    const update = vi.fn();
    const items: BgmImportItem[] = [
      { key: 'builtin-a', builtinId: 'builtin-a', title: '内置 A', status: 'queued' },
      { key: 'builtin-b', builtinId: 'builtin-b', title: '内置 B', status: 'queued' },
    ];
    expect(await runBgmImportBatch(items, undefined, controller.signal, { upload, save }, update)).toBe(0);
    expect(upload).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ title: '内置 A', builtinId: 'builtin-a', durationSec: undefined }, controller.signal);
    expect(update).not.toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ status: 'done' }));
  });
});
