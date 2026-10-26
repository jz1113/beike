import { describe, expect, it, vi } from 'vitest';
import type { SalesCreativeAsset, VideoSalesScript } from '@shared/domain/sales';
import { prepareSalesCreativeAssets } from './prepareSalesAssets';
import type { SalesImageBatchClient, SalesImageBatchItem, SalesImageBatchReceipt } from '../api/salesImageBatch';

function harness() {
  let script: VideoSalesScript = {
    id: 'plan', title: '展示', totalDuration: 15, deliveryMode: 'single',
    shots: [{ shotId: 1, type: 'demo', duration: 15, description: '人物展示黑色商品', camera: '中景', speechMode: 'voiceover', voiceover: '展示商品', visualSource: 'ai_generate', transition: 'direct_concat', imageIndex: 8 }],
    assets: [
      { id: 'person', kind: 'person', label: '人物', prompt: '成年人物展示商品', required: true, usesProduct: true, productImageIndexes: [8] },
      { id: 'scene', kind: 'scene', label: '场景', prompt: '自然光房间', required: true },
    ], seo: { title: '', hashtags: [], coverText: '', interactionGuide: '', description: '' },
  };
  const updateAsset = (id: string, patch: Partial<SalesCreativeAsset>) => { script = { ...script, assets: script.assets!.map((asset) => asset.id === id ? { ...asset, ...patch } : asset) }; };
  const job = () => ({ script, images: [{ index: 8, role: 'main' as const, url: '/black.jpg' }],
    imageModel: 'image-model', aspectRatio: '9:16', selectedColor: '黑色',
    isAborted: () => false, getScript: () => script, updateAsset,
  });
  return { job, updateAsset, current: () => script };
}

function client(partial: Partial<SalesImageBatchClient>): SalesImageBatchClient {
  return {
    submitBatch: async () => [],
    poll: async () => { throw new Error('不应查询'); },
    lookup: async () => ({ id: '', outcome: 'uncertain', error: '尚未找到原任务记录' }),
    ...partial,
  };
}

function doneReceipt(item: SalesImageBatchItem): SalesImageBatchReceipt {
  return { id: item.id, url: item.referenceImages?.length ? '/person.jpg' : '/scene.jpg', outcome: 'done' };
}

describe('automatic creative images', () => {
  it('requires a durable saved submission key before contacting the image provider', async () => {
    const h = harness();
    const submitBatch = vi.fn(async () => []);
    const beforeSubmit = vi.fn(() => {
      expect(h.current().assets!.every((asset) => asset.status === 'generating' && asset.submissionKey)).toBe(true);
      throw new Error('本地存储已满');
    });
    await expect(prepareSalesCreativeAssets({ ...h.job(), beforeSubmit }, client({ submitBatch }))).rejects.toThrow('本地存储已满');
    expect(submitBatch).not.toHaveBeenCalled();
    expect(h.current().assets!.every((asset) => asset.status === 'failed' && !asset.submissionKey && asset.attempts === 0)).toBe(true);
  });


  it('keeps receipt keys uncertain after stopping a submission without permitting a new task', async () => {
    const h = harness();
    let aborted = false;
    const submitBatch = vi.fn(async () => { aborted = true; throw new DOMException('已停止', 'AbortError'); });
    await expect(prepareSalesCreativeAssets({ ...h.job(), isAborted: () => aborted }, client({ submitBatch }))).rejects.toThrow('已停止');
    expect(h.current().assets?.every((asset) => asset.status === 'uncertain' && asset.submissionKey)).toBe(true);
    await expect(prepareSalesCreativeAssets({ ...h.job() }, client({ submitBatch }))).rejects.toThrow('不能自动重投');
    expect(submitBatch).toHaveBeenCalledTimes(1);
  });
  it('leaves a single creation ready for human confirmation without calling visual validation', async () => {
    const h = harness();
    await prepareSalesCreativeAssets({ ...h.job() }, client({ submitBatch: async (items) => items.map(doneReceipt) }));
    expect(h.current().assets?.every((asset) => asset.status === 'done')).toBe(true);
    expect(h.current().assetValidation).not.toBe('passed');
  });
  it('generates without human uploads, injects the selected product, and leaves actual images for human confirmation', async () => {
    const h = harness();
    const submitBatch = vi.fn(async (items: SalesImageBatchItem[]) => items.map(doneReceipt));
    await prepareSalesCreativeAssets(h.job(), client({ submitBatch }));
    expect(submitBatch).toHaveBeenCalledTimes(1);
    const [items] = submitBatch.mock.calls[0];
    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'person', referenceImages: ['/black.jpg'] }),
      expect.objectContaining({ id: 'scene', referenceImages: [] }),
    ]));
    expect(h.current().assetValidation).not.toBe('passed');
  });

  it('marks independent images generating before the batch returns', async () => {
    const h = harness();
    let seen: Array<string | undefined> = [];
    const submitBatch = vi.fn(async () => {
      seen = h.current().assets!.map((asset) => asset.status);
      return h.current().assets!.map((asset) => ({ id: asset.id, url: `/${asset.id}.jpg`, outcome: 'done' as const }));
    });
    await prepareSalesCreativeAssets(h.job(), client({ submitBatch }));
    expect(seen).toEqual(['generating', 'generating']);
  });

  it('does not submit a face until its person image is done', async () => {
    const h = harness();
    h.current().assets = [
      { id: 'person', kind: 'person', label: '人物', prompt: '成年人物', required: true },
      { id: 'face', kind: 'face', label: '人脸', prompt: '同一张脸', required: true, referenceAssetIds: ['person'] },
    ];
    const waves: string[][] = [];
    const submitBatch = vi.fn(async (items: SalesImageBatchItem[]) => {
      waves.push(items.map((item) => item.id));
      return items.map((item) => ({ id: item.id, url: `/${item.id}.jpg`, outcome: 'done' as const }));
    });
    await prepareSalesCreativeAssets(h.job(), client({ submitBatch }));
    expect(waves).toEqual([['person'], ['face']]);
    expect(submitBatch.mock.calls[1][0]).toEqual([expect.objectContaining({ id: 'face', referenceImages: ['/person.jpg'] })]);
  });

  it('persists partial success and retries only a terminally failed image', async () => {
    const h = harness();
    let sceneCalls = 0;
    const submitBatch = vi.fn(async (items: SalesImageBatchItem[]) => items.map((item) => {
      if (item.id !== 'scene') return { id: item.id, url: '/person.jpg', outcome: 'done' as const };
      sceneCalls += 1;
      return sceneCalls === 1 ? { id: item.id, outcome: 'failed' as const, error: '明确失败' } : { id: item.id, url: '/scene.jpg', outcome: 'done' as const };
    }));
    await expect(prepareSalesCreativeAssets(h.job(), client({ submitBatch }))).rejects.toThrow('明确失败');
    expect(h.current().assets![0].url).toBe('/person.jpg');
    expect(h.current().assets![1].status).toBe('failed');
    await prepareSalesCreativeAssets(h.job(), client({ submitBatch }));
    expect(submitBatch).toHaveBeenCalledTimes(2);
    expect(submitBatch.mock.calls[1][0].map((item) => item.id)).toEqual(['scene']);
    expect(h.current().assetValidation).not.toBe('passed');
  });

  it('names an unreadable generated reference and retries that image', async () => {
    const h = harness();
    h.current().assets = [
      { id: 'flat', kind: 'keyframe', label: '黑色卫衣正面平铺主图', prompt: '主图', required: true, usesProduct: true, productImageIndexes: [8] },
      { id: 'detail', kind: 'keyframe', label: '胸前细节', prompt: '细节', required: true, usesProduct: true, productImageIndexes: [8], referenceAssetIds: ['flat'] },
    ];
    let detailTries = 0;
    const submitBatch = vi.fn(async (items: SalesImageBatchItem[]) => items.map((item) => {
      if (item.id !== 'detail') return { id: item.id, url: `/${item.id}.jpg`, outcome: 'done' as const };
      detailTries += 1;
      return detailTries === 1
        ? { id: item.id, outcome: 'uncertain' as const, error: '图 2 缺失参考图无法读取；参考图预设 SM19' }
        : { id: item.id, url: '/detail.jpg', outcome: 'done' as const };
    }));
    await expect(prepareSalesCreativeAssets(h.job(), client({ submitBatch }))).rejects.toThrow('黑色卫衣正面平铺主图');
    expect(h.current().assets![1]).toMatchObject({ status: 'failed', taskId: undefined });
    expect(h.current().assets![1].error).toContain('没有创建可查询的生成任务');
    await prepareSalesCreativeAssets(h.job(), client({ submitBatch }));
    expect(submitBatch.mock.calls.at(-1)?.[0].map((item) => item.id)).toEqual(['detail']);
    expect(h.current().assetValidation).not.toBe('passed');
  });
  it('does not automatically resubmit an image whose submission result is unknown', async () => {
    const h = harness();
    const submitBatch = vi.fn(async () => { throw new Error('连接中断'); });
    const batch = client({ submitBatch });
    await expect(prepareSalesCreativeAssets(h.job(), batch)).rejects.toThrow('连接中断');
    expect(h.current().assets!.every((asset) => asset.status === 'uncertain' && !asset.taskId)).toBe(true);
    await expect(prepareSalesCreativeAssets(h.job(), batch)).rejects.toThrow('提交结果未确认');
    expect(submitBatch).toHaveBeenCalledTimes(1);
  });

  it('queries an existing receipt on retry instead of issuing a new submission', async () => {
    const h = harness();
    const submitBatch = vi.fn(async (items: SalesImageBatchItem[]) => items.map((item) => item.referenceImages?.length
      ? { id: item.id, taskId: 'existing-image', outcome: 'poll' as const }
      : { id: item.id, url: '/scene.jpg', outcome: 'done' as const }));
    let polls = 0;
    const poll = vi.fn(async (input: { taskId: string }) => {
      polls += 1;
      if (polls === 1) throw new Error('查询超时');
      expect(input.taskId).toBe('existing-image');
      return '/person.jpg';
    });
    const batch = client({ submitBatch, poll });
    await expect(prepareSalesCreativeAssets(h.job(), batch)).rejects.toThrow('查询超时');
    expect(h.current().assets![0]).toMatchObject({ status: 'uncertain', taskId: 'existing-image' });
    await prepareSalesCreativeAssets(h.job(), batch);
    expect(submitBatch).toHaveBeenCalledTimes(1);
    expect(poll).toHaveBeenCalledTimes(2);
    expect(h.current().assetValidation).not.toBe('passed');
  });

  it('submits only the requested asset when another missing asset is unrelated', async () => {
    const h = harness();
    const submitBatch = vi.fn(async (items: SalesImageBatchItem[]) => items.map((item) => ({ id: item.id, url: `/${item.id}.jpg`, outcome: 'done' as const })));
    await prepareSalesCreativeAssets({ ...h.job(), regenerateId: 'scene' }, client({ submitBatch }));
    expect(submitBatch.mock.calls[0][0].map((item) => item.id)).toEqual(['scene']);
    expect(h.current().assets![0].status).toBeUndefined();
    expect(h.current().assets![1]).toMatchObject({ status: 'done', url: '/scene.jpg' });
    expect(h.current().assetValidation).not.toBe('passed');
  });

  it('submits an unfinished person dependency before the requested face and skips unrelated assets', async () => {
    const h = harness();
    h.current().assets = [
      { id: 'person', kind: 'person', label: '人物', prompt: '成年人物', required: true },
      { id: 'face', kind: 'face', label: '人脸', prompt: '同一张脸', required: true, referenceAssetIds: ['person'] },
      { id: 'scene', kind: 'scene', label: '场景', prompt: '房间', required: true },
    ];
    const waves: string[][] = [];
    const submitBatch = vi.fn(async (items: SalesImageBatchItem[]) => {
      waves.push(items.map((item) => item.id));
      return items.map((item) => ({ id: item.id, url: `/${item.id}.jpg`, outcome: 'done' as const }));
    });
    await prepareSalesCreativeAssets({ ...h.job(), regenerateId: 'face' }, client({ submitBatch }));
    expect(waves).toEqual([['person'], ['face']]);
    expect(h.current().assets!.find((asset) => asset.id === 'scene')?.status).toBeUndefined();
  });

  it('keeps an image that arrives after cancellation and does not validate it', async () => {
    const h = harness();
    let aborted = false;
    const submitBatch = vi.fn(async (items: SalesImageBatchItem[]) => {
      aborted = true;
      return items.map((item) => ({ id: item.id, url: `/${item.id}.jpg`, outcome: 'done' as const }));
    });
    await prepareSalesCreativeAssets({ ...h.job(), isAborted: () => aborted }, client({ submitBatch }));
    expect(h.current().assetValidation).not.toBe('passed');
    expect(h.current().assets!.every((asset) => asset.status === 'done' && asset.url)).toBe(true);
  });

  it('binds front and back stills independently even when all video shots select the back', async () => {
    const h = harness();
    h.current().shots[0] = { ...h.current().shots[0], description: '先展示背面再转身' };
    h.current().assets = [
      { id: 'front', kind: 'keyframe', label: '正面', prompt: '正面胸前标志', required: true, usesProduct: true, productImageIndexes: [2] },
      { id: 'back', kind: 'keyframe', label: '背面', prompt: '背面完整展示', required: true, usesProduct: true, productImageIndexes: [8] },
    ];
    const submitBatch = vi.fn(async (items: SalesImageBatchItem[]) => items.map((item) => ({ id: item.id, url: `/${item.id}.jpg`, outcome: 'done' as const })));
    await prepareSalesCreativeAssets({ ...h.job(), images: [
      { index: 2, role: 'main', url: '/front-original.jpg' }, { index: 8, role: 'main', url: '/back-original.jpg' },
    ] }, client({ submitBatch }));
    expect(submitBatch.mock.calls[0][0]).toEqual([
      expect.objectContaining({ id: 'front', referenceImages: ['/front-original.jpg'] }),
      expect.objectContaining({ id: 'back', referenceImages: ['/back-original.jpg'] }),
    ]);
    expect(submitBatch.mock.calls[0][0][0].prompt).not.toContain('先展示背面再转身');
    expect(submitBatch.mock.calls[0][0][0].prompt).toContain('正面胸前标志');
  });



});
