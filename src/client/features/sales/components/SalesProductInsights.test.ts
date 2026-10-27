import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { VideoSalesProductAnalysis } from '@shared/domain/sales';
import { SalesProductInsights } from './SalesProductInsights';

const analysis: VideoSalesProductAnalysis = {
  productName: '卫衣', category: 'fashion',
  visualFeatures: { mainColor: '黑色', productForm: '圆领', texture: '华夫格', designStyle: '简约' },
  sellingPoints: ['宽松剪裁', '领口罗纹'], knownFacts: [' 胸前刺绣 ', '胸前刺绣', ''],
  targetAudience: ' 青年 ', usageScenarios: [' 日常通勤 ', '日常通勤', '周末出游', ''],
  painPoints: [], videoSuggestions: { recommendedAngles: [], keyVisuals: [], suggestedStyle: '' },
};

describe('selling point evidence binding', () => {
  it('counts the same normalized facts and scenes that the tabs display', () => {
    const html = renderToStaticMarkup(createElement(SalesProductInsights, {
      sellingPoints: analysis.sellingPoints.join('；'), analysis, disabled: false, onChange: vi.fn(), card: true,
    }));
    expect(html).toContain('外观与材质依据 (5)');
    expect(html).toContain('适用人群与场景 (3)');
    for (const item of ['主色：黑色', '款式：圆领', '材质质感：华夫格', '设计风格：简约', '胸前刺绣', '适用人群：青年', '日常通勤', '周末出游']) expect(html).toContain(item);
    expect(html.match(/胸前刺绣/g)).toHaveLength(1);
    expect(html.match(/日常通勤/g)).toHaveLength(1);
  });

  it('uses secondary extraction for existing selling points without a saved analysis', () => {
    const html = renderToStaticMarkup(createElement(SalesProductInsights, {
      sellingPoints: '已保存的卖点', analysis: null, canAnalyze: true, disabled: false, onAnalyze: vi.fn(), onChange: vi.fn(),
    }));
    expect(html).toContain('重新提炼');
    expect(html).toContain('sales-extract-secondary');
    expect(html).not.toContain('sales-extract-primary');
    expect(html).toContain('外观与材质依据 (待提炼)');
    expect(html).not.toContain('外观与材质依据 (0)');
    expect(html).toContain('已有卖点尚未关联分析依据');
  });

  it('explains missing evidence without inventing facts from selling point text', () => {
    const html = renderToStaticMarkup(createElement(SalesProductInsights, {
      sellingPoints: '日常穿搭', analysis: { sellingPoints: ['日常穿搭'] } as VideoSalesProductAnalysis,
      canAnalyze: true, disabled: false, onAnalyze: vi.fn(), onChange: vi.fn(),
    }));
    expect(html).toContain('外观与材质依据 (未返回)');
    expect(html).toContain('适用人群与场景 (未返回)');
    expect(html).toContain('本次分析未返回');
    expect(html).not.toContain('适用人群：');
    expect(html).not.toContain('设计风格：');
  });
});
