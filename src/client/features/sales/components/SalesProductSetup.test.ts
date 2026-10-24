import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoSalesProductAnalysis } from '@shared/domain/sales';
import { SalesProductFields } from './salesProductSetup';
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
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap((child) => isValidElement<Record<string, unknown>>(child) ? [child, ...elements(child.props.children as ReactNode)] : []);
}
function click(node: ReactNode, label: string) {
  const button = elements(node).find((item) => item.type === 'button' && renderToStaticMarkup(item).includes(label));
  expect(button).toBeDefined();
  (button!.props.onClick as () => void)();
}
beforeEach(() => { hooks.index = 0; hooks.values = []; });

describe('product confirmation information hierarchy', () => {
  it('keeps applied selling points in one editor, even when analysis is expanded', () => {
    hooks.values = [true];
    const html = renderToStaticMarkup(SalesProductInsights({ sellingPoints: '宽松剪裁；领口罗纹收口', analysis, disabled: false, canAnalyze: true, onChange: vi.fn() }));
    expect(html.split('宽松剪裁')).toHaveLength(2);
    expect(html).toContain('已填入 AI 提炼结果');
    expect(html).toContain('胸前刺绣');
    expect(html).not.toContain('填入已知卖点');
  });
  it('reveals analysis on demand and applies suggestions only on an explicit click', () => {
    const onChange = vi.fn();
    const render = () => { hooks.index = 0; return SalesProductInsights({ sellingPoints: '人工补充', analysis, disabled: false, canAnalyze: true, onChange }); };
    const closed = render();
    expect(renderToStaticMarkup(closed)).not.toContain('胸前刺绣');
    expect(onChange).not.toHaveBeenCalled();
    click(closed, 'AI 提炼卖点与商品信息点');
    const opened = render();
    expect(renderToStaticMarkup(opened)).toContain('胸前刺绣');
    expect(renderToStaticMarkup(opened)).toContain('人工补充');
    click(opened, '填入已知卖点');
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ sellingPoints: '宽松剪裁；领口罗纹收口' });
  });
  it('does not infer a specific SKU from the first SKU in a color group', () => {
    const html = renderToStaticMarkup(createElement(SalesProductFields, { ...baseFields,
      images: [{ index: 0, role: 'sku', url: '/white.jpg' }],
      colorSelection: { colorLabel: '', confirmedImageUrls: ['/white.jpg'], excludedImageUrls: [] },
      variantMetadata: { version: 1, requestedSkuId: '100000002', variants: [{ id: 'white', label: '白色', skuIds: ['100000001', '100000002'], imageUrls: ['/white.jpg'] }] },
    }));
    expect(html).toContain('采集 SKU：100000002');
    expect(html).not.toContain('100000001');
    expect(html).toContain('当前规格：白色');
    expect(html).not.toContain('可选 SKU 规格');
  });
  it('does not report the collected variant as selected after clearing images', () => {
    const html = renderToStaticMarkup(createElement(SalesProductFields, { ...baseFields,
      images: [{ index: 0, role: 'sku', url: '/black.jpg' }],
      colorSelection: { colorLabel: '', confirmedImageUrls: [], excludedImageUrls: ['/black.jpg'] },
      variantMetadata: { version: 1, selectedVariantId: 'black', variants: [{ id: 'black', label: '黑色', skuIds: ['100000001'], imageUrls: ['/black.jpg'] }] },
    }));
    expect(html).toContain('请先在图库中选择商品图');
    expect(html).not.toContain('当前规格：黑色');
  });
  it('reveals every collected attribute without dropping long values or showing prices', () => {
    const props = Object.fromEntries(Array.from({ length: 14 }, (_, index) => [`规格参数${index}`, `属性值${index}`]));
    props['价格'] = '299';
    const render = () => { hooks.index = 0; return SalesProductFields({ ...baseFields, props }); };
    const closed = render();
    expect(renderToStaticMarkup(closed)).not.toContain('属性值13');
    click(closed, '查看全部 14 项参数');
    const opened = render();
    const html = renderToStaticMarkup(opened);
    expect(html).toContain('属性值13');
    expect(html).not.toContain('299');
    click(opened, '收起参数');
    expect(renderToStaticMarkup(render())).not.toContain('属性值13');
  });
});
