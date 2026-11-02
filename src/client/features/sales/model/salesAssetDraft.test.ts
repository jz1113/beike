import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readSalesAssetDraft, salesAssetDraftKey, writeSalesAssetDraft, type SalesAssetDraft } from './salesAssetDraft';

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
