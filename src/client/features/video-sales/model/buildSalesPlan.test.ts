import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoSalesCategory } from '@shared/domain/video-sales';
import { analyzeProductMedia, generateSalesScripts, selectSalesImages, finalizeSalesPrompts } from '../api/videoSalesApi';
import { buildSalesPlan } from './buildSalesPlan';

vi.mock('../api/videoSalesApi', () => ({ analyzeProductMedia: vi.fn(), generateSalesScripts: vi.fn(), selectSalesImages: vi.fn(), finalizeSalesPrompts: vi.fn() }));
const shot = { shotId: 1, type: 'demo' as const, duration: 15, description: '展示商品', camera: '中景', voiceover: '如实展示商品', visualSource: 'product_image' as const, transition: 'direct_concat' as const };
const script = { id: 'script', title: '展示', totalDuration: 15, shots: [shot], assets: [{ id: 'scene', kind: 'scene' as const, label: '场景', prompt: '实拍桌面', required: true }], seo: { title: '', hashtags: [], coverText: '', interactionGuide: '', description: '' } };
const input = {
  productName: '商品', brand: '', category: 'other' as VideoSalesCategory, sellingPoints: '棉', priceLabel: '',
  imageCatalog: [{ index: 9, url: '/black.jpg', role: 'main' as const }], selectedColor: '黑色', aspectRatio: '16:9',
  targetDuration: 15, videoMode: 'product_closeup' as const, redrawScenes: true, route: { model: 'chosen-vision' }, onPhase: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(analyzeProductMedia).mockResolvedValue({ productName: '商品', category: 'other', visualFeatures: { mainColor: '黑色', designStyle: '', productForm: '', texture: '' }, sellingPoints: ['棉'], targetAudience: '成年人', usageScenarios: [], painPoints: [], videoSuggestions: { recommendedAngles: [], keyVisuals: [], suggestedStyle: '' } });
  vi.mocked(generateSalesScripts).mockResolvedValue([structuredClone(script)]);
  vi.mocked(selectSalesImages).mockResolvedValue([{ shotId: 1, imageIndex: 9, reason: '当前黑色商品图' }]);
});

describe('all-category script and asset planning', () => {
  it.each<VideoSalesCategory>(['beauty', 'food', 'home', 'fashion', 'tech', 'other'])('plans %s without uploaded people or video models and defers finalization', async (category) => {
    const result = await buildSalesPlan({ ...input, category });
    expect(result.script.deliveryMode).toBe('single');
    expect(result.script.assets?.[0].status).toBe('pending');
    expect(result.script.fullPrompt).toBeUndefined();
    expect(finalizeSalesPrompts).not.toHaveBeenCalled();
    expect(generateSalesScripts).toHaveBeenCalledWith(expect.objectContaining({ model: 'chosen-vision', aspectRatio: '16:9', targetDuration: 15, selectedColor: '黑色', eligibleImageIndexes: [9] }));
  });
  it('rejects a duration mismatch rather than changing the target', async () => {
    vi.mocked(generateSalesScripts).mockResolvedValue([{ ...script, shots: [{ ...shot, duration: 10 }] }]);
    await expect(buildSalesPlan(input)).rejects.toThrow('目标 15');
    expect(selectSalesImages).not.toHaveBeenCalled();
  });
  it('rejects model picks from a different color', async () => {
    vi.mocked(selectSalesImages).mockResolvedValue([{ shotId: 1, imageIndex: 0, reason: '另一张图' }]);
    await expect(buildSalesPlan(input)).rejects.toThrow('没有可用参考图');
  });
  it('rejects an absent asset plan and unsupported creation duration', async () => {
    vi.mocked(generateSalesScripts).mockResolvedValue([{ ...script, assets: undefined }]);
    await expect(buildSalesPlan(input)).rejects.toThrow('自动素材计划');
    await expect(buildSalesPlan({ ...input, targetDuration: 0 })).rejects.toThrow('10–120');
  });
});
