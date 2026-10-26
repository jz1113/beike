import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoSalesProductAnalysis } from '@shared/domain/sales';
import { defaultSalesStudioState } from '../model/salesStudioDraft';
import { ProductSetupPanel, SalesProductFields } from './salesProductSetup';
import { SalesProductInsights } from './SalesProductInsights';

const hooks = vi.hoisted(() => ({ index: 0, values: [] as unknown[] }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useId: () => 'product-insights',
  useRef: () => ({ current: null }),
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (value: unknown) => { hooks.values[index] = typeof value === 'function' ? value(hooks.values[index]) : value; }];
  },
}));

const analysis: VideoSalesProductAnalysis = {
  productName: '卫衣', category: 'fashion', visualFeatures: { mainColor: '黑色', productForm: '圆领', texture: '华夫格', designStyle: '简约' },
  sellingPoints: ['宽松剪裁', '领口罗纹收口'], targetAudience: '青年', usageScenarios: ['日常通勤'], knownFacts: ['胸前刺绣'], painPoints: [],
  videoSuggestions: { recommendedAngles: [], keyVisuals: [], suggestedStyle: '' },
};
const baseFields = { productName: '卫衣', brand: '', sellingPoints: '', disabled: false, onChange: vi.fn() };
beforeEach(() => { hooks.index = 0; hooks.values = []; });

function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap((child) => isValidElement<Record<string, unknown>>(child) ? [child, ...nodes(child.props.children as ReactNode)] : []);
}

describe('product confirmation information hierarchy', () => {
  it('shows automatically applied selling points and analysis evidence together', () => {
    hooks.values = [true];
    const html = renderToStaticMarkup(SalesProductInsights({ sellingPoints: '宽松剪裁；领口罗纹收口', analysis, disabled: false, onChange: vi.fn() }));
    expect(html).toContain('宽松剪裁；领口罗纹收口');
    expect(html).toContain('已自动提炼 · 2 条');
    expect(html).toContain('胸前刺绣');
    expect(html).not.toContain('填入已知卖点');
  });
  it('keeps the extracted evidence visible without a second apply action', () => {
    const onChange = vi.fn();
    const view = SalesProductInsights({ sellingPoints: '人工补充', analysis, disabled: false, onChange });
    const html = renderToStaticMarkup(view);
    expect(html).toContain('胸前刺绣');
    expect(html).toContain('人工补充');
    expect(onChange).not.toHaveBeenCalled();
    expect(html).not.toContain('AI 提炼卖点与信息');
    expect(html).not.toContain('aria-expanded');
  });
  it('does not infer a specific SKU from the first SKU in a color group', () => {
    const html = renderToStaticMarkup(createElement(SalesProductFields, { ...baseFields,
      images: [{ index: 0, role: 'sku', url: '/white.jpg' }],
      colorSelection: { colorLabel: '', confirmedImageUrls: ['/white.jpg'], excludedImageUrls: [] },
      variantMetadata: { version: 1, requestedSkuId: '100000002', variants: [{ id: 'white', label: '白色', skuIds: ['100000001', '100000002'], imageUrls: ['/white.jpg'] }] },
    }));
    expect(html).toContain('SKU</dt><dd class="mt-1 break-all text-xs font-medium leading-5 tabular-nums">100000002');
    expect(html).not.toContain('100000001');
    expect(html).toContain('商品规格</dt><dd class="mt-1 text-xs font-medium leading-5 [overflow-wrap:anywhere]">白色');
    expect(html).not.toContain('可选 SKU 规格');
  });
  it('does not report the collected variant as selected after clearing images', () => {
    const html = renderToStaticMarkup(createElement(SalesProductFields, { ...baseFields,
      images: [{ index: 0, role: 'sku', url: '/black.jpg' }],
      colorSelection: { colorLabel: '', confirmedImageUrls: [], excludedImageUrls: ['/black.jpg'] },
      variantMetadata: { version: 1, selectedVariantId: 'black', variants: [{ id: 'black', label: '黑色', skuIds: ['100000001'], imageUrls: ['/black.jpg'] }] },
    }));
    expect(html).toContain('商品规格</dt><dd class="mt-1 text-xs font-medium leading-5 [overflow-wrap:anywhere]">未选择');
    expect(html).not.toContain('黑色</span>');
  });
  it('shows the collected current SKU color and suffix specification before image selection', () => {
    const html = renderToStaticMarkup(createElement(SalesProductFields, { ...baseFields,
      productUrl: '100000001',
      images: [{ index: 0, role: 'sku', url: '/black.jpg' }],
      colorSelection: { colorLabel: '', confirmedImageUrls: [], excludedImageUrls: [] },
      variantMetadata: { version: 1, requestedSkuId: '100000001', selectedVariantId: 'black-fleece', variants: [{ id: 'black-fleece', label: '黑色加绒', color: '黑色加绒', skuIds: ['100000001'], imageUrls: ['/black.jpg'] }] },
    }));
    expect(html).toContain('商品规格</dt><dd class="mt-1 text-xs font-medium leading-5 [overflow-wrap:anywhere]">黑色');
    expect(html).toContain('黑色 / 加绒');
    expect(html).toContain('SKU</dt><dd class="mt-1 break-all text-xs font-medium leading-5 tabular-nums">100000001');
  });
  it('renders collected product identity as fixed information', () => {
    const html = renderToStaticMarkup(createElement(SalesProductFields, {
      ...baseFields,
      productName: '采集到的卫衣',
      brand: '示例品牌',
      productUrl: '100000001',
      images: [{ index: 0, role: 'main', url: '/black.jpg' }],
      isCollected: true,
    }));
    expect(html).toContain('采集到的卫衣');
    expect(html).not.toContain('示例品牌');
    expect(html).not.toContain('填写可核实的商品名称');
    expect(html).not.toContain('<input');
  });
  it('preserves the complete collected title including its color and size', () => {
    const html = renderToStaticMarkup(createElement(SalesProductFields, {
      ...baseFields,
      productName: '啄木鸟（TUCANO）卫衣男休闲长袖 黑色 XL',
      productUrl: '100000001',
      images: [{ index: 0, role: 'sku', url: '/black.jpg' }],
      colorSelection: { colorLabel: '黑色', confirmedImageUrls: ['/black.jpg'], excludedImageUrls: [] },
      variantMetadata: { version: 1, requestedSkuId: '100000001', variants: [{ id: 'black', label: '黑色', skuIds: ['100000001'], imageUrls: ['/black.jpg'] }] },
      isCollected: true,
    }));
    expect(html).toContain('啄木鸟（TUCANO）卫衣男休闲长袖 黑色 XL</p>');
    expect(html).not.toContain('truncate');
    expect(html).toContain('[overflow-wrap:anywhere]');
    expect(html).toContain('商品规格');
    expect(html).toContain('100000001');
  });
  it('shows the collected SKU and title specifications alongside unassociated main images', () => {
    const html = renderToStaticMarkup(createElement(SalesProductFields, { ...baseFields,
      productName: 'JEEP SPIRIT吉普卫衣男秋冬季宽松百搭假两件扎染长袖上衣男装 蓝色 XL',
      productUrl: '100234809783',
      isCollected: true,
      images: [{ index: 0, role: 'main', url: '/cover.jpg' }, { index: 1, role: 'main', url: '/front.jpg' }],
      colorSelection: { colorLabel: '', confirmedImageUrls: ['/cover.jpg', '/front.jpg'], excludedImageUrls: [] },
      variantMetadata: { version: 1, variants: [{ id: 'blue', label: '蓝色', skuIds: ['100234809783'], imageUrls: ['/blue.jpg'] }] },
    }));
    expect(html).toContain('SKU</dt><dd class="mt-1 break-all text-xs font-medium leading-5 tabular-nums">100234809783');
    expect(html).toContain('蓝色 / XL</dd>');
    expect(html).not.toContain('未确认');
    expect(html).not.toContain('未返回');
  });
  it('keeps the second-stage summary limited to the selected product identity and video settings', () => {
    const html = renderToStaticMarkup(createElement(ProductSetupPanel, {
      state: {
        ...defaultSalesStudioState,
        productName: '啄木鸟（TUCANO）卫衣男休闲长袖 黑色 XL',
        imageCatalog: [{ index: 0, role: 'sku', url: '/black.jpg' }],
        colorSelection: { variantId: 'black', colorLabel: '黑色', confirmedImageUrls: ['/black.jpg'], excludedImageUrls: [] },
        variantMetadata: { version: 1, requestedSkuId: '100000001', selectedVariantId: 'black', variants: [{ id: 'black', label: '黑色', skuIds: ['100000001'], imageUrls: ['/black.jpg'] }] },
      },
      updateState: vi.fn(), compact: true, isBusy: false, isCollecting: false, isUploading: false, isAnalyzing: false,
      onCollect: vi.fn(), onImageError: vi.fn(), onUpload: vi.fn(), onOpenRules: vi.fn(),
    }));
    const summary = html.slice(html.indexOf('<section aria-label="当前商品摘要"'), html.indexOf('</section>') + '</section>'.length);
    expect(summary).not.toContain('src="/black.jpg"');
    expect(summary).toContain('商品名');
    expect(summary).toContain('啄木鸟（TUCANO）卫衣男休闲长袖 黑色 XL');
    expect(summary).toContain('SKU');
    expect(summary).toContain('100000001');
    expect(summary).toContain('目标时长');
    expect(summary).toContain('15 秒');
    expect(summary).toContain('画面比例');
    expect(summary).toContain('9:16');
    for (const label of ['商品外观', '已选商品图', '出镜方式']) expect(summary).not.toContain(label);
    expect(html).not.toContain('展开商品资料与设置');
    expect(summary).not.toContain('返回修改商品与设置');
  });
  it('shows only the current SKU specifications while retaining collected attributes', () => {
    const props = { 材质: '100%棉', 版型: '宽松', 袖长: '长袖', 适用季节: '秋冬', 尺码: 'XL', 价格: '299' };
    const onChange = vi.fn();
    const html = renderToStaticMarkup(createElement(SalesProductFields, { ...baseFields, props, productUrl: '100000001', onChange }));
    expect(html).toContain('尺码：XL');
    expect(html).toContain('100000001');
    for (const value of ['100%棉', '宽松', '长袖', '秋冬', '299', '展开全部参数', '<details']) expect(html).not.toContain(value);
    expect(props).toEqual({ 材质: '100%棉', 版型: '宽松', 袖长: '长袖', 适用季节: '秋冬', 尺码: 'XL', 价格: '299' });
    expect(onChange).not.toHaveBeenCalled();
  });
  it('updates the displayed SKU without mixing in the original SKU specifications', () => {
    const html = renderToStaticMarkup(createElement(SalesProductFields, { ...baseFields,
      props: { 尺码: 'XL', 材质: '100%棉' },
      images: [{ index: 0, role: 'sku', url: '/white.jpg' }],
      colorSelection: { variantId: 'white', colorLabel: '白色', confirmedImageUrls: ['/white.jpg'], excludedImageUrls: [] },
      variantMetadata: { version: 1, requestedSkuId: '100000001', variants: [
        { id: 'black', label: '黑色 XL', skuIds: ['100000001'], imageUrls: ['/black.jpg'] },
        { id: 'white', label: '白色 M', skuIds: ['100000002'], imageUrls: ['/white.jpg'] },
      ] },
    }));
    expect(html).toContain('100000002');
    expect(html).toContain('白色 / M');
    for (const value of ['100000001', '尺码：XL', '100%棉']) expect(html).not.toContain(value);
  });
  it('does not choose an arbitrary SKU when a selected group contains multiple other SKUs', () => {
    const html = renderToStaticMarkup(createElement(SalesProductFields, { ...baseFields,
      props: { 尺码: 'XL' },
      images: [{ index: 0, role: 'sku', url: '/white.jpg' }],
      colorSelection: { variantId: 'white', colorLabel: '白色', confirmedImageUrls: ['/white.jpg'], excludedImageUrls: [] },
      variantMetadata: { version: 1, requestedSkuId: '100000001', variants: [
        { id: 'white', label: '白色', skuIds: ['100000002', '100000003'], imageUrls: ['/white.jpg'] },
      ] },
    }));
    expect(html).toContain('未确认');
    expect(html).toContain('白色');
    for (const value of ['100000001', '100000002', '100000003', '尺码：XL']) expect(html).not.toContain(value);
  });
  it('keeps manual selling-point input available before analysis', () => {
    const onChange = vi.fn();
    const view = SalesProductInsights({ sellingPoints: '', disabled: false, canAnalyze: false, onAnalyze: vi.fn(), onChange });
    const elements = nodes(view);
    const input = elements.find((item) => item.type === 'textarea')!;
    (input.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: '手动输入的卖点' } });
    expect(onChange).toHaveBeenCalledWith({ sellingPoints: '手动输入的卖点' });
    const analyze = elements.find((item) => item.type === 'button' && renderToStaticMarkup(item).includes('AI 提炼卖点'))!;
    expect(analyze.props.disabled).toBe(true);
  });
  it('keeps the extraction callback and lowers its emphasis after analysis', () => {
    const onAnalyze = vi.fn();
    const render = (extracted: boolean) => {
      hooks.index = 0;
      return SalesProductInsights({ sellingPoints: '宽松剪裁；领口罗纹收口', analysis: extracted ? analysis : null, disabled: false, canAnalyze: true, onAnalyze, onChange: vi.fn(), card: true });
    };
    const initial = nodes(render(false)).find((item) => item.type === 'button' && renderToStaticMarkup(item).includes('AI 提炼卖点'))!;
    expect(initial.props.disabled).toBeFalsy();
    expect(initial.props.className).toContain('sales-extract-primary');
    (initial.props.onClick as () => void)();
    expect(onAnalyze).toHaveBeenCalledOnce();
    const extracted = nodes(render(true)).find((item) => item.type === 'button' && renderToStaticMarkup(item).includes('重新提炼'))!;
    expect(extracted.props.className).not.toContain('sales-extract-primary');
    expect(extracted.props.disabled).toBeFalsy();
  });
  it('switches evidence tabs without changing the saved selling points', () => {
    const onChange = vi.fn();
    const render = () => {
      hooks.index = 0;
      return SalesProductInsights({ sellingPoints: '人工补充', analysis, disabled: false, onChange });
    };
    const sceneTab = nodes(render()).find((item) => item.props.role === 'tab' && String(item.props.id).endsWith('scenes-tab'))!;
    (sceneTab.props.onClick as () => void)();
    const panels = nodes(render()).filter((item) => item.props.role === 'tabpanel');
    expect(panels.find((item) => String(item.props.id).endsWith('facts-panel'))!.props.hidden).toBe(true);
    expect(panels.find((item) => String(item.props.id).endsWith('scenes-panel'))!.props.hidden).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

});
