import { createElement } from 'react';
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
    expect(html).toContain('SKU</span><span class="mt-1 block break-all text-xs font-medium tabular-nums">100000002');
    expect(html).not.toContain('100000001');
    expect(html).toContain('SKU 颜色</span><span class="mt-1 block break-words text-xs font-medium">白色');
    expect(html).not.toContain('可选 SKU 规格');
  });
  it('does not report the collected variant as selected after clearing images', () => {
    const html = renderToStaticMarkup(createElement(SalesProductFields, { ...baseFields,
      images: [{ index: 0, role: 'sku', url: '/black.jpg' }],
      colorSelection: { colorLabel: '', confirmedImageUrls: [], excludedImageUrls: ['/black.jpg'] },
      variantMetadata: { version: 1, selectedVariantId: 'black', variants: [{ id: 'black', label: '黑色', skuIds: ['100000001'], imageUrls: ['/black.jpg'] }] },
    }));
    expect(html).toContain('SKU 颜色</span><span class="mt-1 block break-words text-xs font-medium">未选择');
    expect(html).not.toContain('黑色</span>');
  });
  it('shows the collected current SKU color and suffix specification before image selection', () => {
    const html = renderToStaticMarkup(createElement(SalesProductFields, { ...baseFields,
      productUrl: '100000001',
      images: [{ index: 0, role: 'sku', url: '/black.jpg' }],
      colorSelection: { colorLabel: '', confirmedImageUrls: [], excludedImageUrls: [] },
      variantMetadata: { version: 1, requestedSkuId: '100000001', selectedVariantId: 'black-fleece', variants: [{ id: 'black-fleece', label: '黑色加绒', color: '黑色加绒', skuIds: ['100000001'], imageUrls: ['/black.jpg'] }] },
    }));
    expect(html).toContain('SKU 颜色</span><span class="mt-1 block break-words text-xs font-medium">黑色');
    expect(html).toContain('SKU 规格</span><span class="mt-1 block break-words text-xs font-medium">加绒');
    expect(html).toContain('SKU</span><span class="mt-1 block break-all text-xs font-medium tabular-nums">100000001');
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
  it('separates collected SKU color and size from the product name', () => {
    const html = renderToStaticMarkup(createElement(SalesProductFields, {
      ...baseFields,
      productName: '啄木鸟（TUCANO）卫衣男休闲长袖 黑色 XL',
      productUrl: '100000001',
      images: [{ index: 0, role: 'sku', url: '/black.jpg' }],
      colorSelection: { colorLabel: '黑色', confirmedImageUrls: ['/black.jpg'], excludedImageUrls: [] },
      variantMetadata: { version: 1, requestedSkuId: '100000001', variants: [{ id: 'black', label: '黑色', skuIds: ['100000001'], imageUrls: ['/black.jpg'] }] },
      isCollected: true,
    }));
    expect(html).toContain('啄木鸟（TUCANO）卫衣男休闲长袖');
    expect(html).not.toContain('黑色 XL</div>');
    expect(html).toContain('SKU 颜色');
    expect(html).toContain('100000001');
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
  it('renders every collected attribute without dropping long values or showing prices', () => {
    const props = Object.fromEntries(Array.from({ length: 14 }, (_, index) => [`规格参数${index}`, `属性值${index}`]));
    props['价格'] = '299';
    const render = () => { hooks.index = 0; return SalesProductFields({ ...baseFields, props }); };
    const html = renderToStaticMarkup(render());
    expect(html).toContain('属性值13');
    expect(html).not.toContain('查看全部');
    expect(html).not.toContain('收起参数');
    expect(html).not.toContain('299');
  });
});
