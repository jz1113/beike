import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type SetStateAction } from 'react';
import { renderToString } from 'react-dom/server';
import type { BatchProductItem } from '../model/batchTypes';
import { useBatchCollection } from './useBatchCollection';

const { runBatchCollect } = vi.hoisted(() => ({ runBatchCollect: vi.fn() }));
vi.mock('../model/collection/batchCollect', async importOriginal => ({
  ...await importOriginal<typeof import('../model/collection/batchCollect')>(), runBatchCollect,
}));

function product(id: string, status: BatchProductItem['status'] = 'pending'): BatchProductItem {
  return {
    id, itemId: id, platform: 'jd', title: id, price: 0, category: '', brand: '', coverImage: '',
    mainImages: [], skuImages: [], detailImages: [], props: {}, status, selected: true,
    allTypedImages: [], selectedProductImages: [], prompts: [], tasks: [],
  };
}

function setup(items: BatchProductItem[]) {
  const itemsRef = { current: items };
  const onCollected = vi.fn();
  const setItems = (update: SetStateAction<BatchProductItem[]>) => {
    itemsRef.current = typeof update === 'function' ? update(itemsRef.current) : update;
  };
  const options = {
    items, itemsRef, setItems, batchInputText: '', setBatchInputText: vi.fn(), showToast: vi.fn(), onCollected,
  };
  let collection!: ReturnType<typeof useBatchCollection>;
  function Harness() {
    collection = useBatchCollection(options);
    return null;
  }
  renderToString(createElement(Harness));
  return { collection, itemsRef, onCollected };
}

beforeEach(() => { runBatchCollect.mockReset(); });
afterEach(() => vi.unstubAllGlobals());

describe('collection to image selection', () => {
  it('waits for all collection requests before opening selection and ignores repeat submissions', async () => {
    let finish!: () => void;
    const waitForRest = new Promise<void>(resolve => { finish = resolve; });
    runBatchCollect.mockImplementation(async (_items, deps) => {
      deps.onItemUpdate('one', { status: 'success' });
      await waitForRest;
      deps.onItemUpdate('two', { status: 'success' });
      return { success: 2, failed: 0 };
    });
    const { collection, onCollected } = setup([product('one'), product('two')]);
    const first = collection.startBatchCollect();
    await collection.startBatchCollect();
    expect(runBatchCollect).toHaveBeenCalledTimes(1);
    expect(onCollected).not.toHaveBeenCalled();
    finish();
    await first;
    expect(onCollected).toHaveBeenCalledTimes(1);
  });

  it('opens selection for partial success while retaining failed products for retry', async () => {
    runBatchCollect.mockImplementation(async (_items, deps) => {
      deps.onItemUpdate('one', { status: 'success' });
      deps.onItemUpdate('two', { status: 'failed', selected: false, errorMsg: '图片未返回' });
      return { success: 1, failed: 1 };
    });
    const { collection, itemsRef, onCollected } = setup([product('one'), product('two')]);
    await collection.startBatchCollect();
    expect(onCollected).toHaveBeenCalledTimes(1);
    expect(itemsRef.current[1]).toMatchObject({ status: 'failed', errorMsg: '图片未返回' });
  });

  it('keeps the input and retry path when every product fails', async () => {
    runBatchCollect.mockImplementation(async (_items, deps) => {
      deps.onItemUpdate('one', { status: 'failed', selected: false });
      return { success: 0, failed: 1 };
    });
    const { collection, onCollected } = setup([product('one')]);
    await collection.startBatchCollect();
    expect(onCollected).not.toHaveBeenCalled();
    expect(collection.collectInFlight.current).toBe(false);
  });

  it('returns to existing selected products even if retrying the remaining product fails', async () => {
    runBatchCollect.mockResolvedValue({ success: 0, failed: 1 });
    const { collection, onCollected } = setup([product('ready', 'success'), product('retry', 'failed')]);
    await collection.startBatchCollect();
    expect(onCollected).toHaveBeenCalledTimes(1);
  });

  it('does not change the current view when refreshing successful products', async () => {
    vi.stubGlobal('window', { confirm: () => true });
    runBatchCollect.mockResolvedValue({ success: 1, failed: 0 });
    const { collection, onCollected } = setup([product('one', 'success')]);
    await collection.startBatchCollect(undefined, true);
    expect(onCollected).not.toHaveBeenCalled();
  });
});
