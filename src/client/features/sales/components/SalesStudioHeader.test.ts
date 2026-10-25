import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ShoppingBag } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { StudioBrandChip } from '@client/shared/ui/studio/StudioBrandChip';
import { SalesStudioHeader } from './salesChrome';

const icon = createElement(ShoppingBag, { className: 'h-4 w-4' });

describe('sales studio return entry', () => {
  it('uses the shared studio chip inline without changing the header actions', () => {
    const html = renderToStaticMarkup(createElement(SalesStudioHeader, {
      onBack: vi.fn(), onReset: vi.fn(), resetDisabled: false, resetTitle: '更换商品',
      steps: [], onStep: vi.fn(), onOpenRules: vi.fn(),
    }));
    const chip = renderToStaticMarkup(createElement(StudioBrandChip, { title: '电商视频', icon, onBack: vi.fn(), inline: true }));
    expect(html).toContain(chip);
    expect(html).toContain('带货规则');
    expect(html).toContain('更换商品');
    expect(html).not.toContain('lucide-chevron-left');
    expect(chip).not.toContain('<header');
  });

  it('keeps the original floating placement for other studios', () => {
    const html = renderToStaticMarkup(createElement(StudioBrandChip, { title: '数字人', icon, onBack: vi.fn() }));
    expect(html).toContain('absolute left-0 top-0');
    expect(html).toContain('数字人 · 点击返回首页');
  });

  it('returns home when the inline chip is clicked', () => {
    const onBack = vi.fn();
    const button = StudioBrandChip({ title: '电商视频', icon, onBack, inline: true });
    expect(button.type).toBe('button');
    button.props.onClick();
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
