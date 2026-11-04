import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { moveScriptBundleProgress, purgeRemovedScriptBundles, readPausedScriptBundles, readRemovedScriptBundles, savePausedScriptBundles, type SalesScriptBundleJob } from './salesScriptBundle';

const context = vi.hoisted(() => ({ workspace: 'workspace-a' }));
vi.mock('@client/shared/api/workspaceClient', () => ({ getWorkspaceSecret: () => context.workspace }));

const job: SalesScriptBundleJob = { videoUrl: '/video.mp4', name: 'video.mp4', model: '', scriptId: '', operationId: 'one', taskId: '', resultUrl: '', depthState: 'prepared', analysisError: '', depthError: '' };
const other = { ...job, operationId: 'two' };

beforeEach(() => {
  context.workspace = 'workspace-a';
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
});
afterEach(() => vi.unstubAllGlobals());

describe('paused script progress', () => {
  it('persists independently recoverable deletions without changing other checkpoints', () => {
    savePausedScriptBundles([job, other]);
    moveScriptBundleProgress('one');
    expect(readPausedScriptBundles()).toEqual([other]);
    expect(readRemovedScriptBundles()).toEqual([job]);
    moveScriptBundleProgress('two');
    expect(readPausedScriptBundles()).toEqual([]);
    expect(readRemovedScriptBundles()).toEqual([job, other]);
    moveScriptBundleProgress('one', true);
    expect(readPausedScriptBundles()).toEqual([job]);
    expect(readRemovedScriptBundles()).toEqual([other]);
    savePausedScriptBundles([job, { ...other, operationId: 'three' }]);
    expect(readRemovedScriptBundles()).toEqual([other]);
  });
  it('does not expose or delete another workspace’s checkpoints', () => {
    savePausedScriptBundles([job]);
    moveScriptBundleProgress('one');
    context.workspace = 'workspace-b';
    expect(readPausedScriptBundles()).toEqual([]);
    moveScriptBundleProgress('one');
    purgeRemovedScriptBundles(['one']);
    context.workspace = 'workspace-a';
    expect(readRemovedScriptBundles()).toEqual([job]);
  });
  it('permanently removes only the selected deleted checkpoint', () => {
    const active = { ...job, operationId: 'active' };
    savePausedScriptBundles([job, other, active]);
    moveScriptBundleProgress('one');
    moveScriptBundleProgress('two');
    expect(purgeRemovedScriptBundles(['one'])).toEqual([other]);
    expect(readPausedScriptBundles()).toEqual([active]);
    expect(readRemovedScriptBundles()).toEqual([other]);
    moveScriptBundleProgress('one', true);
    expect(readPausedScriptBundles()).toEqual([active]);
  });
  it('permanently removes a selected batch while preserving active and later-deleted jobs', () => {
    const active = { ...job, operationId: 'active' };
    const later = { ...job, operationId: 'later' };
    savePausedScriptBundles([job, other, active, later]);
    moveScriptBundleProgress('one');
    moveScriptBundleProgress('two');
    const selected = readRemovedScriptBundles().map((entry) => entry.operationId);
    moveScriptBundleProgress('later');
    expect(purgeRemovedScriptBundles(selected)).toEqual([later]);
    expect(readPausedScriptBundles()).toEqual([active]);
    expect(readRemovedScriptBundles()).toEqual([later]);
  });
});
