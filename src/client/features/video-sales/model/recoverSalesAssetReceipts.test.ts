import { describe, expect, it, vi } from 'vitest';
import type { SalesCreativeAsset, VideoSalesScript } from '@shared/domain/video-sales';
import { recoverSalesAssetReceipts } from './recoverSalesAssetReceipts';

it('queries interrupted image receipts with their saved model even after the plan became stale', async () => {
  const asset: SalesCreativeAsset = { id: 'person', label: '人物', kind: 'person', prompt: '原图设定', required: true,
    status: 'uncertain', taskId: 'paid-image', sourceRevision: 'old-inputs', modelId: 'original-model', attempts: 1 };
  const script = { planStale: true, assets: [asset] } as VideoSalesScript;
  const generate = vi.fn(async () => '/original-person.jpg');
  await recoverSalesAssetReceipts({ script, isAborted: () => false, updateAsset: (_, patch) => Object.assign(asset, patch) }, generate);
  expect(generate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ existingTaskId: 'paid-image', imageModel: 'original-model' }));
  expect(asset).toMatchObject({ status: 'done', validation: 'pending', sourceRevision: 'old-inputs', attempts: 1, url: '/original-person.jpg' });
});

describe('image receipt recovery safety', () => {
  it('keeps unknown submissions without receipts for manual reconciliation, without another request', async () => {
    const generate = vi.fn(async () => '/must-not-submit.jpg');
    await recoverSalesAssetReceipts({ script: { assets: [{ id: 'unknown', status: 'uncertain' }] } as VideoSalesScript, isAborted: () => false, updateAsset: vi.fn() }, generate);
    expect(generate).not.toHaveBeenCalled();
  });
});
