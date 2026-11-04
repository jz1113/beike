import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { findSalesAssetDraftJob, readSalesAssetDraft, restoreSalesAssetDraftJob, salesAssetDraftKey, writeSalesAssetDraft, type SalesAssetDraft } from './salesAssetDraft';
import type { SalesAssetViewJob } from '@shared/contracts/salesAssetViews';

let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  });
});
afterEach(() => vi.unstubAllGlobals());
const draft: SalesAssetDraft = {
  fields: { name: '人物', group: 'female', voiceId: 'voice' }, views: { main: '/main.jpg', face: '/face.jpg' }, extraImages: ['/extra.jpg'], model: 'model',
  request: { key: 'original-key', jobId: 'background-job', assetId: 'saved-asset', model: 'model', references: ['/main.jpg'], prompt: 'original prompt', promptVersion: 'v1', taskId: 'task', resultUrl: '/grid.png', images: { face: '/face.jpg' } },
};

it('retains the form, references, idempotency key, task and completed images across reloads', () => {
  const key = salesAssetDraftKey('workspace', 'persona');
  writeSalesAssetDraft(key, draft);
  expect(readSalesAssetDraft(key)).toEqual(draft);
});

it('isolates drafts between workspaces, asset kinds, and existing asset IDs', () => {
  const key = salesAssetDraftKey('workspace-a', 'persona');
  writeSalesAssetDraft(key, draft);
  expect(readSalesAssetDraft(salesAssetDraftKey('workspace-b', 'persona'))).toBeNull();
  expect(readSalesAssetDraft(salesAssetDraftKey('workspace-a', 'scene'))).toBeNull();
  expect(readSalesAssetDraft(salesAssetDraftKey('workspace-a', 'persona', 'existing-id'))).toBeNull();
  expect(readSalesAssetDraft(key)).toEqual(draft);
});

it('does not replace existing image references when only form fields were saved', () => {
  const key = salesAssetDraftKey('workspace', 'scene', 'existing');
  writeSalesAssetDraft(key, { fields: { name: '修改名称' } });
  expect(readSalesAssetDraft(key)).toMatchObject({ fields: { name: '修改名称' } });
  expect(readSalesAssetDraft(key)?.views).toBeUndefined();
  expect(readSalesAssetDraft(key)?.extraImages).toBeUndefined();
});

it('ignores corrupt drafts without deleting their original bytes', () => {
  values.set('corrupt', '{');
  expect(readSalesAssetDraft('corrupt')).toBeNull();
  expect(values.get('corrupt')).toBe('{');
  values.set('invalid', JSON.stringify({ fields: { name: 123 }, views: { main: {} }, request: { key: 'k', model: {}, references: null } }));
  expect(readSalesAssetDraft('invalid')).toMatchObject({ fields: {}, views: {}, request: null });
});

const completed: SalesAssetViewJob = { id: 'background-job', key: 'original-key', kind: 'persona', assetId: 'saved-asset', model: 'model', status: 'completed',
  images: { face: '/completed-face.jpg', front: '/completed-front.jpg' }, error: '', createdAt: '', updatedAt: '',
  creation: { referenceImageUrl: '/reference.jpg', imageUrl: '/generated-main.jpg', prompt: '人物提示词' } };

it('matches submission receipts by identity instead of an asset name or another asset kind', () => {
  expect(findSalesAssetDraftJob(draft, 'persona', [completed])).toBe(completed);
  expect(findSalesAssetDraftJob(draft, 'scene', [completed])).toBeUndefined();
  expect(findSalesAssetDraftJob(draft, 'persona', [{ ...completed, assetId: 'other' }])).toBeUndefined();
  expect(findSalesAssetDraftJob({ fields: {}, request: { key: 'original-key', model: 'model', references: ['/reference.jpg'] } }, 'persona', [completed])).toBe(completed);
});

it('restores a background result after closing the window without losing local field edits or manual views', () => {
  const waiting: SalesAssetDraft = { fields: { name: '用户后来修改的名称' }, views: { main: '', face: '/manual-face.jpg', front: '' },
    creation: { referenceImageUrl: '/reference.jpg' }, request: { key: 'original-key', model: 'model', references: ['/reference.jpg'] } };
  const restored = restoreSalesAssetDraftJob(waiting, completed);
  expect(restored.fields.name).toBe('用户后来修改的名称');
  expect(restored.views).toEqual({ main: '/generated-main.jpg', face: '/manual-face.jpg', front: '/completed-front.jpg' });
  expect(restored.request).toMatchObject({ jobId: completed.id, assetId: completed.assetId, key: 'original-key', images: completed.images });
  expect(waiting.views?.front).toBe('');
});

it('preserves explicit view removals after a result was already recorded and rejects unrelated results', () => {
  const edited = { ...draft, views: { main: '/main.jpg', face: '' } };
  expect(restoreSalesAssetDraftJob(edited, completed).views?.face).toBe('');
  expect(restoreSalesAssetDraftJob(edited, { ...completed, assetId: 'different' })).toBe(edited);
});
