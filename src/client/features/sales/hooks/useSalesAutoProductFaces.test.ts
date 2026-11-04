import { beforeEach, describe, expect, it, vi } from 'vitest';
import { autoMaskProductImage } from '../api/salesProductFaceImage';
import { emptySalesCollection, type SalesCollectionState } from '../model/salesCollectionDraft';
import type { ProductFaceEdit } from '../model/salesProductFaces';
import { useSalesAutoProductFaces } from './useSalesAutoProductFaces';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[], pending: [] as (() => void)[], cleanups: new Map<number, () => void>() }));
vi.mock('react', async () => (await import('./salesProductionTestRuntime')).salesProductionTestHooks(hooks));
vi.mock('../api/salesProductFaceImage', () => ({ autoMaskProductImage: vi.fn() }));
const mask: ProductFaceEdit = { url: '/masked-shirt', regions: [{ x: 0, y: 0, width: 0.2, height: 0.2 }] };
let state: SalesCollectionState;
const commit = (recipe: (previous: SalesCollectionState) => SalesCollectionState) => { state = recipe(state); };
function Render() {
  hooks.index = 0;
  const result = useSalesAutoProductFaces(state, commit);
  hooks.pending.splice(0).forEach((effect) => effect());
  return result;
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
beforeEach(() => {
  vi.resetAllMocks();
  hooks.slots = []; hooks.pending = []; hooks.cleanups.clear();
  state = emptySalesCollection();
  state.imageCatalog = [{ index: 0, url: '/shirt', role: 'main' }, { index: 1, url: '/bag', role: 'detail' }];
});
describe('automatic product face masking', () => {
  it('processes the selected batch before any script exists, and reuses no-face results and masks', async () => {
    Render(); expect(autoMaskProductImage).not.toHaveBeenCalled();
    state.colorSelection.confirmedImageUrls = ['/shirt', '/bag'];
    vi.mocked(autoMaskProductImage).mockResolvedValueOnce(mask).mockResolvedValueOnce({ url: '/bag', regions: [] });
    expect(Render().pending).toBe(2); await settle();
    expect(Render().pending).toBe(1); await settle();
    expect(Render().pending).toBe(0);
    state.colorSelection.confirmedImageUrls = []; Render();
    state.colorSelection.confirmedImageUrls = ['/shirt']; Render();
    expect(autoMaskProductImage).toHaveBeenCalledTimes(2);
    expect(state.productionPlan.productFaceEdits).toEqual({ '/shirt': mask, '/bag': { url: '/bag', regions: [] } });
  });

  it('continues after one failure and retries only missing results', async () => {
    state.colorSelection.confirmedImageUrls = ['/shirt', '/bag'];
    vi.mocked(autoMaskProductImage).mockRejectedValueOnce(new Error('upload failed'))
      .mockResolvedValueOnce({ url: '/bag', regions: [] }).mockResolvedValueOnce(mask);
    Render(); await settle();
    expect(Render().failed).toBe(1); await settle();
    Render().retry(); Render(); await settle();
    expect(Render()).toMatchObject({ pending: 0, failed: 0 });
    expect(vi.mocked(autoMaskProductImage).mock.calls.map(([url]) => url)).toEqual(['/shirt', '/bag', '/shirt']);
  });

  it.each(['deselect', 'switch product', 'manual edit'])('drops stale detection after %s', async (change) => {
    let resolve!: (value: ProductFaceEdit) => void;
    vi.mocked(autoMaskProductImage).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    state.colorSelection.confirmedImageUrls = ['/shirt']; Render();
    const manual = { url: '/shirt', regions: [] };
    if (change === 'deselect') state.colorSelection.confirmedImageUrls = [];
    if (change === 'switch product') state.activeProductId = 'next';
    if (change === 'manual edit') state.productionPlan.productFaceEdits = { '/shirt': manual };
    // Deliver the old response before React runs effect cleanup for the new state.
    resolve(mask); await settle();
    expect(state.productionPlan.productFaceEdits['/shirt']).toEqual(change === 'manual edit' ? manual : undefined);
  });
});
