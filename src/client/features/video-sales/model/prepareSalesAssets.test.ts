import { describe, expect, it, vi } from 'vitest';
import type { SalesCreativeAsset, VideoSalesScript } from '@shared/domain/video-sales';
import { prepareSalesCreativeAssets } from './prepareSalesAssets';

function harness() {
  let script: VideoSalesScript = {
    id: 'plan', title: '展示', totalDuration: 15, deliveryMode: 'single',
    shots: [{ shotId: 1, type: 'demo', duration: 15, description: '人物展示黑色商品', camera: '中景', voiceover: '展示商品', visualSource: 'ai_generate', transition: 'direct_concat', imageIndex: 8 }],
    assets: [
      { id: 'person', kind: 'person', label: '人物', prompt: '成年人物展示商品', required: true, usesProduct: true },
      { id: 'scene', kind: 'scene', label: '场景', prompt: '自然光房间', required: true },
    ], seo: { title: '', hashtags: [], coverText: '', interactionGuide: '', description: '' },
  };
  const updateAsset = (id: string, patch: Partial<SalesCreativeAsset>) => { script = { ...script, assets: script.assets!.map((asset) => asset.id === id ? { ...asset, ...patch } : asset) }; };
  const job = () => ({ script, images: [{ index: 8, role: 'main' as const, url: '/black.jpg' }],
    imageModel: 'image-model', aspectRatio: '9:16', selectedColor: '黑色', productAnalysis: '{}', route: { model: 'vision' },
    isAborted: () => false, getScript: () => script, updateAsset,
    setValidation: (status: VideoSalesScript['assetValidation']) => { script = { ...script, assetValidation: status }; },
  });
  const validate = vi.fn<typeof import('../api/videoSalesApi').validateSalesAssets>(async (input) => input.actualReferences.map((ref) => ({ id: ref.id, status: 'passed' as const, reason: '外观与脚本一致' })));
  return { job, validate, updateAsset, current: () => script };
}

describe('automatic creative images', () => {
  it('generates without human uploads, injects the selected product, and validates actual image URLs', async () => {
    const h = harness();
    const generate = vi.fn(async (input: Parameters<typeof import('./generateShotAsset').generateSalesReferenceFrame>[0]) => input.referenceImages?.length ? '/person.jpg' : '/scene.jpg');
    await prepareSalesCreativeAssets(h.job(), generate, h.validate);
    expect(generate).toHaveBeenNthCalledWith(1, expect.objectContaining({ referenceImages: ['/black.jpg'] }));
    expect(generate).toHaveBeenNthCalledWith(2, expect.objectContaining({ referenceImages: [] }));
    expect(h.validate).toHaveBeenCalledWith(expect.objectContaining({ actualReferences: [
      { id: 'product-8', kind: 'product', label: '商品参考 9', url: '/black.jpg' },
      { id: 'person', kind: 'person', label: '人物', url: '/person.jpg' },
      { id: 'scene', kind: 'scene', label: '场景', url: '/scene.jpg' },
    ] }));
    expect(h.current().assetValidation).toBe('passed');
  });
  it('persists partial success and retries only a terminally failed image', async () => {
    const h = harness();
    const error = Object.assign(new Error('明确失败'), { name: 'ImageGenBusinessError' });
    const generate = vi.fn().mockResolvedValueOnce('/person.jpg').mockRejectedValueOnce(error).mockResolvedValueOnce('/scene.jpg');
    await expect(prepareSalesCreativeAssets(h.job(), generate, h.validate)).rejects.toThrow('明确失败');
    expect(h.current().assets![0].url).toBe('/person.jpg');
    expect(h.validate).not.toHaveBeenCalled();
    await prepareSalesCreativeAssets(h.job(), generate, h.validate);
    expect(generate).toHaveBeenCalledTimes(3);
    expect(h.current().assetValidation).toBe('passed');
  });
  it('does not automatically resubmit an image whose submission result is unknown', async () => {
    const h = harness();
    const generate = vi.fn().mockRejectedValue(new Error('连接中断'));
    await expect(prepareSalesCreativeAssets(h.job(), generate, h.validate)).rejects.toThrow('连接中断');
    await expect(prepareSalesCreativeAssets(h.job(), generate, h.validate)).rejects.toThrow('提交结果未确认');
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it('queries an existing receipt on retry instead of issuing a new submission', async () => {
    const h = harness();
    const generate = vi.fn(async (input: Parameters<typeof import('./generateShotAsset').generateSalesReferenceFrame>[0]) => {
      if (!input.existingTaskId && input.referenceImages?.length) {
        input.onTaskId?.('existing-image');
        throw new Error('查询超时');
      }
      return input.referenceImages?.length ? '/person.jpg' : '/scene.jpg';
    });
    await expect(prepareSalesCreativeAssets(h.job(), generate, h.validate)).rejects.toThrow('查询超时');
    await prepareSalesCreativeAssets(h.job(), generate, h.validate);
    expect(generate).toHaveBeenNthCalledWith(2, expect.objectContaining({ existingTaskId: 'existing-image' }));
  });
  it('blocks a visual conflict rather than claiming successful validation', async () => {
    const h = harness();
    const generate = vi.fn().mockResolvedValue('/frame.jpg');
    h.validate.mockImplementation(async (input) => input.actualReferences.map((ref) => ({ id: ref.id, status: 'conflict' as const, reason: '颜色不符' })));
    await expect(prepareSalesCreativeAssets(h.job(), generate, h.validate)).rejects.toThrow('颜色不符');
    expect(h.current().assetValidation).toBe('conflict');
  });
});
