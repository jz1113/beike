import { describe, expect, it, vi } from 'vitest';
import type { SalesCreativeAsset, VideoSalesScript } from '@shared/domain/sales';
import { validateSalesAssetPlan } from '@shared/domain/sales';
import { salesSkillStage } from '@shared/domain/sales/skill';
import { canResubmitRejectedAsset, explainSalesReferenceError, recoverSalesAssetReceipts, salesAssetImagePrompt, salesAssetProductImages, salesReferenceRejection, reuseSalesPlanAssets, updateSalesCreativeAsset } from './salesAssetHelpers';

describe('sales reference rejection', () => {
  it('names the reference that could not be read and allows an explicit retry', () => {
    const message = '图 2 缺失参考图无法读取；参考图预设 SM19';
    expect(salesReferenceRejection(message)).toBe(true);
    expect(explainSalesReferenceError(message, ['商品参考 1', '黑色卫衣正面平铺主图'])).toBe('第 2 张参考图「黑色卫衣正面平铺主图」无法读取，这次没有创建可查询的生成任务，可以直接重试。');
    expect(canResubmitRejectedAsset({ status: 'uncertain', error: message })).toBe(true);
    expect(canResubmitRejectedAsset({ status: 'uncertain', taskId: 'task-1', error: message })).toBe(false);
    expect(canResubmitRejectedAsset({ status: 'uncertain', error: '连接中断' })).toBe(false);
  });
});

const images = [
  { index: 2, url: '/front.jpg', role: 'main' as const },
  { index: 9, url: '/back.jpg', role: 'main' as const },
  { index: 12, url: '/detail.jpg', role: 'detail' as const },
];
const front: SalesCreativeAsset = { id: 'front', kind: 'keyframe', label: '卫衣正面', prompt: '正面平铺，胸前标志可见', required: true, usesProduct: true, productImageIndexes: [2] };

describe('per-asset product view evidence', () => {
  it('uses the asset view rather than a video shot or reference array position', () => {
    expect(salesAssetProductImages(front, images)).toEqual([images[0]]);
    expect(salesAssetProductImages({ ...front, label: '背面', productImageIndexes: [9] }, images)).toEqual([images[1]]);
    expect(salesAssetProductImages({ ...front, productImageIndexes: [12, 2] }, images)).toEqual([images[2], images[0]]);
  });

  it('blocks legacy product assets without explicit references', () => {
    expect(() => salesAssetProductImages({ ...front, productImageIndexes: undefined }, images)).toThrow('缺少商品参考编号');
    expect(salesAssetProductImages({ ...front, usesProduct: false, productImageIndexes: undefined }, images)).toEqual([]);
  });

  it('blocks missing, unselected and unavailable product references before charging', () => {
    expect(() => salesAssetProductImages(front, [images[1]])).toThrow('未被选中');
    expect(() => salesAssetProductImages(front, [{ ...images[0], unavailable: true }])).toThrow('不可用');
    expect(() => salesAssetProductImages({ ...front, productImageIndexes: [] }, images)).toThrow('缺少商品参考');
    expect(() => salesAssetProductImages({ ...front, productImageIndexes: undefined }, [])).toThrow('缺少商品参考编号');
    for (const indexes of [[2, 2], [-1], [2.5]]) {
      expect(() => validateSalesAssetPlan([{ ...front, productImageIndexes: indexes }], images)).toThrow('编号无效');
    }
    expect(() => validateSalesAssetPlan([{ ...front, productImageIndexes: [] }], images)).toThrow('缺少商品参考编号');
    expect(() => validateSalesAssetPlan([{ ...front, productImageIndexes: [77] }], images)).toThrow('未被选中');
    expect(() => validateSalesAssetPlan([{ ...front, usesProduct: false }], images)).toThrow('编号无效');
  });

  it('binds reference numbers and target view without importing the entire video narrative', () => {
    const dependency: SalesCreativeAsset = { id: 'person', kind: 'person', label: '背面人物', prompt: '背面', required: true };
    const prompt = salesAssetImagePrompt(front, [images[0]], [dependency], '黑色');
    expect(prompt).toContain('本次只生成一张静帧');
    expect(prompt).toContain(salesSkillStage('image'));
    expect(prompt).toContain('素材名称：卫衣正面');
    expect(prompt).toContain('输入参考图1：商品原图（目录编号 2）');
    expect(prompt).toContain('输入参考图2：已生成素材「背面人物」');
    expect(prompt).toContain('不照搬前置素材的视角');
    expect(prompt).toContain('不继承原模特的脸、白底或棚拍光');
    expect(prompt).toContain('不冻结表情、手势和每一道褶皱');
    expect(prompt).toContain('不能把背面当正面');
    expect(prompt).toContain('商品颜色：黑色');
    expect(prompt).not.toContain('画面创作依据');
  });

  it('uses a new scene without moving the identity reference background into it', () => {
    const person: SalesCreativeAsset = { id: 'person', kind: 'person', label: '家中人物', prompt: '室内上身', required: true };
    const scene: SalesCreativeAsset = { id: 'street', kind: 'scene', label: '街边', prompt: '室外路边', required: true };
    const prompt = salesAssetImagePrompt({ ...front, prompt: '同一人物站在街边' }, [images[0]], [person, scene], '黑色');
    const identityLine = prompt.split('\n').find((line) => line.includes('输入参考图2：'));
    const sceneLine = prompt.split('\n').find((line) => line.includes('输入参考图3：'));
    expect(identityLine).toContain('继承同一人物身份');
    expect(identityLine).toContain('只有本张明确沿用同一场景时');
    expect(identityLine).toContain('不搬入原人物图背景');
    expect(sceneLine).toContain('用于本张明确引用的场景布局与光线');
    expect(sceneLine).toContain('不从空景额外增加人物');
  });
});

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

  it('queries saved receipts together and still keeps a successful sibling when one fails', async () => {
    const assets: SalesCreativeAsset[] = [
      { id: 'ok', label: '成功', kind: 'scene', prompt: '场景', required: true, status: 'generating', taskId: 'ok-task' },
      { id: 'bad', label: '失败', kind: 'person', prompt: '人物', required: true, status: 'uncertain', taskId: 'bad-task' },
    ];
    let active = 0;
    let maxActive = 0;
    const generate = vi.fn(async (input: { existingTaskId?: string }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
      if (input.existingTaskId === 'bad-task') throw Object.assign(new Error('明确失败'), { name: 'ImageGenBusinessError' });
      return '/ok.jpg';
    });
    const updateAsset = (id: string, patch: Partial<SalesCreativeAsset>) => {
      const asset = assets.find((item) => item.id === id);
      if (asset) Object.assign(asset, patch);
    };
    await expect(recoverSalesAssetReceipts({ script: { assets } as VideoSalesScript, isAborted: () => false, updateAsset }, generate)).rejects.toThrow('明确失败');
    expect(maxActive).toBe(2);
    expect(assets[0]).toMatchObject({ status: 'done', url: '/ok.jpg' });
    expect(assets[1]).toMatchObject({ status: 'failed', error: '明确失败' });
  });
});

it('recovers a stopped image submission by its key without creating another task', async () => {
  const script: VideoSalesScript = { id: 'p', title: '', totalDuration: 15, shots: [], seo: { title: '', hashtags: [], coverText: '', interactionGuide: '', description: '' }, assets: [{ ...front, status: 'uncertain', submissionKey: 'saved-image-key' }] };
  const updateAsset = vi.fn();
  const generate = vi.fn(async () => '/recovered.jpg');
  const lookup = vi.fn(async () => ({ id: 'front', taskId: 'original-image-task', outcome: 'poll' as const }));
  await recoverSalesAssetReceipts({ script, isAborted: () => false, updateAsset }, generate, lookup);
  expect(lookup).toHaveBeenCalledWith('saved-image-key', undefined, expect.any(Function));
  expect(generate).toHaveBeenCalledWith(expect.objectContaining({ existingTaskId: 'original-image-task' }));
  expect(updateAsset).toHaveBeenCalledWith('front', expect.objectContaining({ url: '/recovered.jpg', status: 'done' }));
});

describe('dependent sales image invalidation', () => {
  function plan(): VideoSalesScript {
    return { id: 'plan', title: '', totalDuration: 15, shots: [], planRevision: 'unchanged', assetValidation: 'passed', finalizedRevision: 'approved',
      seo: { title: '', hashtags: [], coverText: '', interactionGuide: '', description: '' },
      assets: [
        { ...front, id: 'person', kind: 'person', url: '/old-person.jpg', status: 'done', validation: 'passed' },
        { ...front, id: 'face', kind: 'face', url: '/old-face.jpg', status: 'done', validation: 'passed', referenceAssetIds: ['person'] },
        { ...front, id: 'frame', url: '/old-frame.jpg', status: 'done', validation: 'passed', referenceAssetIds: ['face'] },
        { ...front, id: 'independent', url: '/table.jpg', status: 'done', validation: 'passed' },
      ],
    };
  }
  it('expires all dependent images after a person changes while preserving old pictures', () => {
    const original = plan();
    const next = updateSalesCreativeAsset(original, 'person', { url: '/new-person.jpg', status: 'done' });
    expect(next.assets![1]).toMatchObject({ status: 'pending', validation: 'pending', url: '/old-face.jpg' });
    expect(next.assets![2]).toMatchObject({ status: 'pending', validation: 'pending', url: '/old-frame.jpg' });
    expect(next.assets![3]).toBe(original.assets![3]);
    expect(next.assetValidation).toBe('pending');
    expect(next.finalizedRevision).toBeUndefined();
    expect(original.assets![1].status).toBe('done');
  });
  it('keeps unresolved dependent receipts queryable when their source changes', () => {
    const original = plan();
    original.assets![1] = { ...original.assets![1], status: 'uncertain', taskId: 'paid-face-task' };
    const next = updateSalesCreativeAsset(original, 'person', { prompt: '新的选角' });
    expect(next.assets![0]).toMatchObject({ status: 'pending', url: '/old-person.jpg' });
    expect(next.assets![1]).toMatchObject({ status: 'uncertain', taskId: 'paid-face-task', validation: 'pending' });
  });
  it('does not reuse images whose product view changed or whose ancestor was not reused', () => {
    const original = plan();
    const next = plan();
    next.assets = next.assets!.map((asset) => ({ ...asset, status: 'pending', url: undefined }));
    next.assets[0].productImageIndexes = [9];
    const reused = reuseSalesPlanAssets(next, original);
    expect(reused.assets!.slice(0, 3).every((asset) => !asset.url)).toBe(true);
    expect(reused.assets![3].url).toBe('/table.jpg');
  });
});
