import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { normalizeScriptTemplate, type SalesReferenceSlot } from '@shared/domain/sales';
import { emptySalesProductionPlan } from '../model/salesProductionDraft';
import { resolveSalesVideoSettings } from '../model/salesVideoSettings';
import { SalesVideoDurationNotice } from './SalesVideoDurationNotice';

const plan = { ...emptySalesProductionPlan(), videoModel: 'doubao-seedance-2.0-mini' };
const script = normalizeScriptTemplate({ format: 'product', durationSec: 16.4, shots: [{ beats: [{ start: 0, end: 16.4, action: '展示商品' }] }] })!;
const references: SalesReferenceSlot[] = [{ slotIndex: 1, mixedToken: '{{Mixed 1}}', apiToken: '图片1', kind: 'product', label: '商品', url: '/product.jpg' }];
const props = {
  plan, script, references, error: resolveSalesVideoSettings(plan, script, references).durationError,
  disabled: false, onPatchPlan: () => {}, onEditStoryboard: () => {},
};

describe('sales duration conflict recovery', () => {
  it('shows the actual conflict and a configured compatible model without submitting a generation', () => {
    const html = renderToStaticMarkup(createElement(SalesVideoDurationNotice, { ...props, videoModels: [
      { id: 'mini-route', modelId: plan.videoModel, entryId: 'mini-route', name: 'Mini' },
      { id: 'long-route', modelId: 'doubao-seedance-2.5', entryId: 'long-route', name: 'Seedance 2.5 · 渠道 A' },
    ] }));
    expect(html).toContain('role="status"');
    for (const text of ['16.4 秒', '17 秒', '最长支持 15 秒', '改用 Seedance 2.5 · 渠道 A · 17 秒', '更换参考脚本']) expect(html).toContain(text);
    expect(html).not.toContain('改用 Mini');
    expect(html).not.toContain('生成视频');
  });

  it('keeps the script recovery action when no configured model can fit', () => {
    const html = renderToStaticMarkup(createElement(SalesVideoDurationNotice, { ...props, disabled: true, videoModels: [] }));
    expect(html).toContain('已配置模型中暂无兼容当前脚本和引用素材的选项');
    expect(html).not.toContain('改用');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>更换参考脚本<\/button>/);
  });
});
