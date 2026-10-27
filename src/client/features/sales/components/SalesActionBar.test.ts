import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SalesActionBar } from './salesChrome';

vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useId: () => 'dock-test',
  useEffect: () => {},
  useState: () => [0, vi.fn()],
}));

function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap((child) => isValidElement<Record<string, unknown>>(child) ? [child, ...nodes(child.props.children as ReactNode)] : []);
}

describe('sales action dock busy layout', () => {
  it('shows collection progress even when the empty product reason is quiet', () => {
    const view = SalesActionBar({
      primary: { label: '正在采集商品资料', disabled: true },
      primaryTitle: '请先采集商品或填写商品名称', quietReason: true,
      busy: true, progress: '正在采集商品资料',
      controls: createElement('select', { disabled: true, 'aria-label': '时长', defaultValue: '30' }, createElement('option', { value: '30' }, '30秒')),
    });
    const html = renderToStaticMarkup(view);
    const status = nodes(view).find((node) => node.props.role === 'status')!;
    expect(html).toContain('sales-action-dock is-busy');
    expect(html).toContain('已等待 0 秒');
    expect(html).toContain('role="progressbar"');
    expect(html).not.toContain('sr-only');
    expect(status.props.children).toContain('正在采集商品资料');
    expect(html).not.toContain('请先采集商品或填写商品名称');
    // Settings stay mounted while CSS conceals them, preserving local UI state.
    expect(html).toContain('sales-dock-controls');
    expect(html).toContain('<option value="30" selected="">30秒</option>');
  });

  it('keeps stop wired and the full accessible label while shortening the busy button', () => {
    const stop = vi.fn();
    const generate = vi.fn();
    const view = SalesActionBar({
      primary: { label: '正在 AI 提炼商品卖点与信息', disabled: true, onClick: generate },
      secondary: { label: '停止当前操作', onClick: stop },
      busy: true, progress: '正在 AI 提炼商品卖点与信息', note: '服务商已接受的任务仍可能生成并计费。',
    });
    const entries = nodes(view);
    const primary = entries.find((node) => node.type === 'button' && node.props['aria-busy'])!;
    expect(primary.props.disabled).toBe(true);
    expect(primary.props.onClick).toBe(generate);
    expect(primary.props['aria-label']).toBe('正在 AI 提炼商品卖点与信息');
    expect(primary.props.children).toContain('处理中');
    const stopButton = entries.find((node) => node.type === 'button' && !node.props['aria-busy'])!;
    (stopButton.props.onClick as () => void)();
    expect(stop).toHaveBeenCalledOnce();
    expect(generate).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(view)).not.toContain('服务商已接受的任务仍可能生成并计费。');
  });

  it('restores the original action and configuration after work ends', () => {
    const html = renderToStaticMarkup(createElement(SalesActionBar, {
      primary: { label: '生成卖点与脚本' }, busy: false,
      controls: createElement('span', null, '创作参数'),
    }));
    expect(html).toContain('生成卖点与脚本');
    expect(html).toContain('创作参数');
    expect(html).not.toContain('is-busy');
    expect(html).not.toContain('已等待');
    expect(html).not.toContain('role="progressbar"');
  });
});
