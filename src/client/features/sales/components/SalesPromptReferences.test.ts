import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SalesPromptReferences } from './SalesPromptReferences';
import { SalesVideoMaterials } from './SalesVideoMaterials';
import type { VideoSalesScript } from '@shared/domain/sales';

const references = Array.from({ length: 12 }, (_, index) => ({ id: `product-${index}`, kind: 'product' as const, label: `长说明${index}`, url: `/image-${index}.png` }));
describe('sales image references', () => {
  it('binds multi-digit references to the correct image and leaves unknown numbers intact', () => {
    const html = renderToStaticMarkup(createElement(SalesPromptReferences, { prompt: '@图片 12 和参考图2，图片99、图片0与图片1.5保持原文。', references }));
    expect(html).toContain('src="/image-11.png"');
    expect(html).toContain('src="/image-1.png"');
    expect(html).toContain('@图片12');
    expect(html).toContain('查看图片12');
    expect(html).toContain('图片99、图片0与图片1.5保持原文。');
    expect(html).not.toContain('长说明');
    expect(html.match(/aria-haspopup="dialog"/g)).toHaveLength(2);
  });
  it('numbers the tray in submission order even while a required asset is missing', () => {
    const script = {
      shots: [{ imageIndex: 7 }, { imageIndex: 2 }],
      assets: [{ id: 'person', kind: 'person', label: '长人物描述', prompt: '人物', required: true }],
    } as VideoSalesScript;
    const html = renderToStaticMarkup(createElement(SalesVideoMaterials, { script, productImages: [{ index: 2, role: 'main', url: '/two.png' }, { index: 7, role: 'main', url: '/seven.png' }] }));
    expect(html.indexOf('src="/seven.png"')).toBeLessThan(html.indexOf('src="/two.png"'));
    for (const label of ['图片1', '图片2', '图片3']) expect(html).toContain(label);
    expect(html).not.toContain('AI生成');
    expect(html).not.toContain('商品参考');
    expect(html).toContain('图片3 · 待生成');
  });
});
