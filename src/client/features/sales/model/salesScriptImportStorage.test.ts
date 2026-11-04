import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeScriptTemplate } from '@shared/domain/sales';
import type { SalesScriptImportItem } from './salesScriptImport';
import { readSalesScriptImport, saveSalesScriptImport } from './salesScriptImportStorage';

const context = vi.hoisted(() => ({ workspace: 'workspace-a' }));
vi.mock('@client/shared/api/workspaceClient', () => ({ getWorkspaceSecret: () => context.workspace }));
const storage = new Map<string, string>();
const script = normalizeScriptTemplate({ title: '展示动作', durationSec: 3, shots: [{ start: 0, end: 3, beats: [{ start: 0, end: 3, action: '转身' }] }] })!;
const item: SalesScriptImportItem = { key: 'one', name: '动作.mp4', file: new File(['video'], '动作.mp4'), size: 5, lastModified: 12, saveId: 'script_one', status: 'saving', error: '',
  video: { success: true, videoUrl: '/one.mp4', videoHash: 'hash', durationSec: 3, aspectRatio: '9:16', hasAudio: false, sizeBytes: 5 },
  result: { script, model: 'vision', promptVersion: 'v1', videoHash: 'hash' },
  includeDepth: true, depthOperationId: 'operation-one', depthState: 'submitted', depthTaskId: 'accepted-task' };

beforeEach(() => {
  storage.clear(); context.workspace = 'workspace-a';
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
});
afterEach(() => vi.unstubAllGlobals());

describe('batch script import checkpoints', () => {
  it('retains completed analysis and accepted depth receipts across reloads without serializing local files', () => {
    saveSalesScriptImport([item]);
    const [restored] = readSalesScriptImport();
    expect(restored).toMatchObject({ status: 'queued', saveId: 'script_one', result: item.result, video: item.video,
      includeDepth: true, depthOperationId: 'operation-one', depthState: 'submitted', depthTaskId: 'accepted-task' });
    expect(restored.file).toBeUndefined();
    expect([...storage.values()][0]).not.toContain('"file"');
  });
  it('isolates each workspace’s recovery queue and clears only the active workspace', () => {
    saveSalesScriptImport([item]);
    context.workspace = 'workspace-b';
    expect(readSalesScriptImport()).toEqual([]);
    saveSalesScriptImport([]);
    saveSalesScriptImport([{ ...item, key: 'two', status: 'done', scriptId: 'script_two' }]);
    context.workspace = 'workspace-a';
    expect(readSalesScriptImport()).toHaveLength(1);
    saveSalesScriptImport([]);
    context.workspace = 'workspace-b';
    expect(readSalesScriptImport()[0]).toMatchObject({ key: 'two', status: 'done', scriptId: 'script_two' });
  });
  it('ignores malformed queue records and invalid cached analysis without treating them as saved results', () => {
    saveSalesScriptImport([item]);
    const key = [...storage.keys()][0];
    const saved = JSON.parse(storage.get(key)!);
    saved.items.push({ key: 'broken', size: -1 });
    saved.items[0].result.script = {};
    saved.items[0].video = { videoUrl: '/broken.mp4' };
    storage.set(key, JSON.stringify(saved));
    expect(readSalesScriptImport()).toHaveLength(1);
    expect(readSalesScriptImport()[0].result).toBeUndefined();
    expect(readSalesScriptImport()[0].video).toBeUndefined();
    storage.set(key, '{');
    expect(readSalesScriptImport()).toEqual([]);
  });
  it('surfaces checkpoint failures so the caller can stop before submitting more work', () => {
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('quota'); } });
    expect(() => saveSalesScriptImport([item])).toThrow('quota');
  });
});
