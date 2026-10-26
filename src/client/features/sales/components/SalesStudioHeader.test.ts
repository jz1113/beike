import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
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
      onOpenRules: vi.fn(),
    }));
    const chip = renderToStaticMarkup(createElement(StudioBrandChip, { title: '电商视频', icon, onBack: vi.fn(), inline: true }));
    expect(html).toContain(chip);
    expect(html).toContain('带货规则');
    expect(html).toContain('更换商品');
    expect(html).not.toContain('lucide-chevron-left');
    expect(html).not.toContain('<nav');
    expect(html).not.toContain('aria-current="step"');
    expect(chip).not.toContain('<header');
  });

  it('opens the contextual return and existing result without resetting the product', () => {
    const onReturn = vi.fn();
    const onViewResult = vi.fn();
    const onReset = vi.fn();
    const view = SalesStudioHeader({ onBack: vi.fn(), onReset, resetDisabled: false, resetTitle: '', onOpenRules: vi.fn(), returnAction: { label: '返回素材补齐', onClick: onReturn }, onViewResult });
    function buttons(node: ReactNode): ReactElement<Record<string, unknown>>[] {
      return Children.toArray(node).flatMap((child) => isValidElement<Record<string, unknown>>(child) ? [child, ...buttons(child.props.children as ReactNode)] : []);
    }
    const entries = buttons(view);
    (entries.find((entry) => entry.props['aria-label'] === '返回素材补齐')!.props.onClick as () => void)();
    (entries.find((entry) => entry.props['aria-label'] === '查看生成结果')!.props.onClick as () => void)();
    expect(onReturn).toHaveBeenCalledTimes(1);
    expect(onViewResult).toHaveBeenCalledTimes(1);
    expect(onReset).not.toHaveBeenCalled();
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
