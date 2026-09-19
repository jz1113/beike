import { act, renderHook, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useDeconstructQueue } from './useDeconstructQueue';
import { processDeconstructQueueItem } from '@/lib/deconstructClient';
vi.mock('@/lib/deconstructClient', () => ({processDeconstructQueueItem: vi.fn(async () => ({ok:true,partial:false,data:{},stats:{},reviewId:'review'}))}));
vi.mock('@beike/domain/workflowModels', () => ({ getEnabledMultimodalModelsFromSettings: () => [{id:'model'}], resolveStoredMultimodalModelId: () => 'model' }));
vi.mock('../assetDeconstructCsvExport', () => ({exportDeconstructRecordsToCsv: async () => 'test.csv', transformQueueItemToRecordRow: () => ({status:'skipped'})}));
afterEach(() => { cleanup(); vi.clearAllMocks(); sessionStorage.clear(); });
it('submits only selected images in source order and skips entirely unchecked albums', async () => {
  const {result} = renderHook(() => useDeconstructQueue({showToast:vi.fn(),onRefreshAssets:vi.fn()}));
  act(() => result.current.setQueue([
    {id:'a',name:'album',images:['first','second','third'],excludedImageIndices:[1],status:'pending'},
    {id:'b',name:'excluded',images:['first'],excludedImageIndices:[0],status:'pending'},
  ]));
  await act(async () => { await result.current.runQueueDeconstruction({reviewBeforeSave:true}); });
  expect(processDeconstructQueueItem).toHaveBeenCalledTimes(1);
  expect(processDeconstructQueueItem).toHaveBeenCalledWith(expect.objectContaining({reviewBeforeSave:true,item:expect.objectContaining({images:['first','third']})}));
  expect(result.current.queue[0].reviewId).toBe('review');
  expect(result.current.queue[1].status).toBe('pending');
});
it('follows category switching and uses each album category in mixed queues', async () => {
  const categories = [{id:'p',name:'手机通讯',parentId:null,position:0},{id:'j',name:'珠宝首饰',parentId:null,position:1}];
  const {result, rerender} = renderHook(({category}) => useDeconstructQueue({showToast:vi.fn(),onRefreshAssets:vi.fn(),defaultProductCategoryId:category,productCategories:categories}), {initialProps:{category:'p'}});
  expect(result.current.targetCategory).toBe('digital_3c');
  act(() => result.current.setTargetCategory('apparel'));
  rerender({category:'p'});
  expect(result.current.targetCategory).toBe('apparel');
  rerender({category:'j'});
  expect(result.current.targetCategory).toBe('jewelry');
  expect(result.current.architectureMode).toBe('auto');
  act(() => result.current.setQueue([
    {id:'phone-album',name:'手机',images:['image'],status:'pending',productCategoryId:'p'},
    {id:'jewel-album',name:'首饰',images:['image'],status:'pending',productCategoryId:'j'},
  ]));
  await act(async () => { await result.current.runQueueDeconstruction({reviewBeforeSave:true}); });
  expect(processDeconstructQueueItem).toHaveBeenCalledWith(expect.objectContaining({item:expect.objectContaining({id:'phone-album'}),targetCategory:'digital_3c',customSubCategories:expect.arrayContaining([expect.objectContaining({id:'screen_bezel'})])}));
  expect(processDeconstructQueueItem).toHaveBeenCalledWith(expect.objectContaining({item:expect.objectContaining({id:'jewel-album'}),targetCategory:'jewelry'}));
});
