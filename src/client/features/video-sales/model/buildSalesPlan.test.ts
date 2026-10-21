import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoSalesCategory } from '@shared/domain/video-sales';
import { analyzeProductMedia, generateSalesScripts, selectSalesImages, finalizeSalesPrompts } from '../api/videoSalesApi';
import { buildSalesPlan } from './buildSalesPlan';

vi.mock('../api/videoSalesApi', () => ({ analyzeProductMedia: vi.fn(), generateSalesScripts: vi.fn(), selectSalesImages: vi.fn(), finalizeSalesPrompts: vi.fn() }));
const shot = { shotId: 1, type: 'demo' as const, duration: 15, description: '展示商品', camera: '中景', voiceover: '如实展示商品', visualSource: 'product_image' as const, transition: 'direct_concat' as const };
const script = { id: 'script', title: '展示', totalDuration: 15, shots: [shot], assets: [{ id: 'scene', kind: 'scene' as const, label: '场景', prompt: '实拍桌面', required: true }], seo: { title: '', hashtags: [], coverText: '', interactionGuide: '', description: '' } };
const planApi = { analyzeProductMedia, generateSalesScripts, selectSalesImages };
const input = {
  productName: '商品', brand: '', category: 'other' as VideoSalesCategory, sellingPoints: '棉',
  imageCatalog: [{ index: 9, url: '/black.jpg', role: 'main' as const }], selectedColor: '黑色', aspectRatio: '16:9',
  targetDuration: 15, videoMode: 'product_closeup' as const, route: { model: 'chosen-vision' }, onPhase: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(analyzeProductMedia).mockResolvedValue({ productName: '商品', category: 'other', visualFeatures: { mainColor: '黑色', designStyle: '', productForm: '', texture: '' }, sellingPoints: ['棉'], targetAudience: '成年人', usageScenarios: [], painPoints: [], videoSuggestions: { recommendedAngles: [], keyVisuals: [], suggestedStyle: '' } });
  vi.mocked(generateSalesScripts).mockResolvedValue([structuredClone(script)]);
  vi.mocked(selectSalesImages).mockResolvedValue([{ shotId: 1, imageIndex: 9, reason: '当前黑色商品图' }]);
});

describe('all-category script and asset planning', () => {
  it('assigns the sole selected image without another model request', async () => {
    const result = await buildSalesPlan(input, planApi);
    expect(result.script.shots[0].imageIndex).toBe(9);
    expect(selectSalesImages).not.toHaveBeenCalled();
  });
  it('resumes image selection after failure without repeating successful analysis or writing', async () => {
    let checkpoint = {};
    const multiple = { ...input, imageCatalog: [...input.imageCatalog, { index: 10, role: 'main' as const, url: '/detail.jpg' }], onCheckpoint: (value: object) => { checkpoint = value; } };
    vi.mocked(selectSalesImages).mockRejectedValueOnce(new Error('选图连接失败'));
    await expect(buildSalesPlan(multiple, planApi)).rejects.toThrow('选图连接失败');
    const result = await buildSalesPlan({ ...multiple, checkpoint }, planApi);
    expect(result.script.shots[0].imageIndex).toBe(9);
    expect(analyzeProductMedia).toHaveBeenCalledTimes(1);
    expect(generateSalesScripts).toHaveBeenCalledTimes(1);
    expect(selectSalesImages).toHaveBeenCalledTimes(2);
  });
  it('stops before writing when analysis finishes after cancellation', async () => {
    const controller = new AbortController();
    const analysis = await analyzeProductMedia({ imageCatalog: [] });
    vi.mocked(analyzeProductMedia).mockClear().mockImplementation(async () => { controller.abort(); return analysis; });
    await expect(buildSalesPlan({ ...input, route: { ...input.route, signal: controller.signal } }, planApi)).rejects.toThrow('已停止');
    expect(generateSalesScripts).not.toHaveBeenCalled();
  });
  it.each<VideoSalesCategory>(['beauty', 'food', 'home', 'fashion', 'tech', 'other'])('plans %s without uploaded people or video models and defers finalization', async (category) => {
    const result = await buildSalesPlan({ ...input, category }, planApi);
    expect(result.script.deliveryMode).toBe('single');
    expect(result.script.assets?.[0].status).toBe('pending');
    expect(result.script.fullPrompt).toBeUndefined();
    expect(finalizeSalesPrompts).not.toHaveBeenCalled();
    expect(generateSalesScripts).toHaveBeenCalledWith(expect.objectContaining({ model: 'chosen-vision', aspectRatio: '16:9', targetDuration: 15, selectedColor: '黑色', eligibleImageIndexes: [9] }));
  });
  it('keeps price out of analysis and the script request', async () => {
    await buildSalesPlan({ ...input, sellingPoints: '价格：168元；材质：棉', productProps: { 价格: '168元', 材质: '棉' } }, planApi);
    const analyze = vi.mocked(analyzeProductMedia).mock.calls[0][0];
    const scriptRequest = vi.mocked(generateSalesScripts).mock.calls[0][0];
    expect(JSON.stringify(analyze)).not.toContain('168');
    expect(JSON.stringify(scriptRequest)).not.toContain('168');
    expect(analyze).not.toHaveProperty('priceRange');
  });
  it('rejects a duration mismatch rather than changing the target', async () => {
    vi.mocked(generateSalesScripts).mockResolvedValue([{ ...script, shots: [{ ...shot, duration: 10 }] }]);
    await expect(buildSalesPlan(input, planApi)).rejects.toThrow('目标 15');
    expect(selectSalesImages).not.toHaveBeenCalled();
  });
  it('rejects model picks from a different color', async () => {
    vi.mocked(selectSalesImages).mockResolvedValue([{ shotId: 1, imageIndex: 0, reason: '另一张图' }]);
    await expect(buildSalesPlan({ ...input, imageCatalog: [...input.imageCatalog, { index: 10, role: 'main', url: '/detail.jpg' }] }, planApi)).rejects.toThrow('没有可用参考图');
  });
  it('preserves a pure fashion portrait without inventing product dependencies', async () => {
    vi.mocked(generateSalesScripts).mockResolvedValue([{ ...script, assets: [{ id: 'person', kind: 'person', label: '成年人物', prompt: '面部肖像', required: true, usesProduct: false, productImageIndexes: [] }] }]);
    const result = await buildSalesPlan({ ...input, category: 'fashion' }, planApi);
    expect(result.script.assets?.[0]).toMatchObject({ usesProduct: false, productImageIndexes: [] });
  });
  it('rejects an asset reference outside the selected product catalog before image selection', async () => {
    vi.mocked(generateSalesScripts).mockResolvedValue([{ ...script, assets: [{ ...script.assets[0], usesProduct: true, productImageIndexes: [77] }] }]);
    await expect(buildSalesPlan(input, planApi)).rejects.toThrow('未被选中');
    expect(selectSalesImages).not.toHaveBeenCalled();
  });
  it('rejects an absent asset plan and unsupported creation duration', async () => {
    vi.mocked(generateSalesScripts).mockResolvedValue([{ ...script, assets: undefined }]);
    await expect(buildSalesPlan(input, planApi)).rejects.toThrow('自动素材计划');
    await expect(buildSalesPlan({ ...input, targetDuration: 0 }, planApi)).rejects.toThrow('10–120');
  });
});
