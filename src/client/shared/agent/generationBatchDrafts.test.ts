import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BatchGenerationSettings, BatchPromptDraft } from './buildGenerationPromptBatch';
import { assistantPromptSource } from './generationBatchSources';
import { readGenerationBatchDraft, saveGenerationBatchDraft } from './generationBatchDrafts';

const KEY = 'beike_agent_generation_drafts_v1';
const reply = { id: 'reply', role: 'assistant' as const, timestamp: 1,
  content: '## 封面\n```image-prompt\n柔和光影，商品居中\n```\n## 视频\n```video-prompt\n镜头推进，总时长5秒\n```' };
const source = assistantPromptSource([reply], reply, 'session');
const settings: BatchGenerationSettings = { imageModel: 'image-channel', imageAspect: '3:4', imageQuality: 'high',
  videoModel: 'video-channel', videoAspect: '9:16', videoResolution: '720P', videoDuration: 5, videoRefMode: 'omni' };
let values: Map<string, string>;

beforeEach(() => {
  values = new Map();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('saved generation prompt drafts', () => {
  it('round-trips complete edits and settings without altering original source identity', () => {
    const entries: BatchPromptDraft[] = source.entries.map((entry, index) => ({ ...entry,
      title: `编辑标题${index}`, prompt: `编辑后的光影构图 ${index}`, referenceIndexes: [0, 2], aspect: '1:1', duration: 8 }));
    const before = structuredClone(source);
    saveGenerationBatchDraft(source.sourceId, entries, settings);
    expect(readGenerationBatchDraft(source)).toEqual({ entries, settings });
    expect(source).toEqual(before);
    expect(readGenerationBatchDraft({ ...source, sourceId: 'different-session-source' })).toBeUndefined();
  });

  it('replaces this source only and retains another session draft', () => {
    saveGenerationBatchDraft('other-session-source', source.entries, settings);
    saveGenerationBatchDraft(source.sourceId, source.entries, settings);
    const edited = [{ ...source.entries[0], prompt: '最新保存的构图' }];
    saveGenerationBatchDraft(source.sourceId, edited, { ...settings, imageQuality: 'low' });
    expect(readGenerationBatchDraft(source)).toEqual({ entries: edited, settings: { ...settings, imageQuality: 'low' } });
    expect(readGenerationBatchDraft({ ...source, sourceId: 'other-session-source' })).toEqual({ entries: source.entries, settings });
  });

  it('returns no draft only when the journal or the source entry is absent', () => {
    expect(readGenerationBatchDraft(source)).toBeUndefined();
    values.set(KEY, '{}');
    expect(readGenerationBatchDraft(source)).toBeUndefined();
  });

  it.each(['{', 'null', '[]', 'false'])('rejects invalid journal %s without overwriting it', raw => {
    values.set(KEY, raw);
    expect(() => readGenerationBatchDraft(source)).toThrow();
    expect(() => saveGenerationBatchDraft(source.sourceId, source.entries, settings)).toThrow();
    expect(values.get(KEY)).toBe(raw);
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it('rejects a draft referencing entries from another reply', () => {
    saveGenerationBatchDraft(source.sourceId, [{ ...source.entries[0], id: 'foreign-entry' }], settings);
    expect(() => readGenerationBatchDraft(source)).toThrow('已失效');
  });

  it.each([
    { entries: [{ ...source.entries[0], prompt: '' }], settings },
    { entries: [{ ...source.entries[0], referenceIndexes: [-1] }], settings },
    { entries: [{ ...source.entries[0], referenceIndexes: [50] }], settings },
    { entries: source.entries, settings: { ...settings, imageQuality: 'invalid' } },
    { entries: source.entries, settings: { ...settings, videoDuration: null } },
  ])('rejects invalid stored draft fields before followup can use them', invalid => {
    values.set(KEY, JSON.stringify({ [source.sourceId]: invalid }));
    expect(() => readGenerationBatchDraft(source)).toThrow('已失效');
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it('validates before writing and preserves an existing draft on quota refusal', () => {
    saveGenerationBatchDraft(source.sourceId, source.entries, settings);
    const before = values.get(KEY);
    expect(() => saveGenerationBatchDraft(source.sourceId, [{ ...source.entries[0], prompt: '' }], settings)).toThrow();
    vi.mocked(localStorage.setItem).mockImplementation(() => { throw new Error('QuotaExceededError'); });
    expect(() => saveGenerationBatchDraft(source.sourceId, [{ ...source.entries[0], prompt: '新的光影' }], settings)).toThrow('不会启动生成');
    expect(values.get(KEY)).toBe(before);
    expect(readGenerationBatchDraft(source)?.entries).toEqual(source.entries);
  });
});
