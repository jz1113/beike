import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SalesPromptEditor, SalesStructuredPrompt } from './SalesPromptEditor';

const hooks = vi.hoisted(() => ({ index: 0, values: [] as unknown[] }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useEffect: () => {},
  useState: (initial: unknown) => {
    const index = hooks.index++;
    return [index in hooks.values ? hooks.values[index] : initial, vi.fn()];
  },
}));
const prompt = '前言保留\n\n【成片执行约束】\n  原文与空格保留\n\n【时间轴与剪辑 0-15s】\n@图片 1 商品，图片99未知编号。\n结尾\n';
const references = [{ id: 'product-0', kind: 'product' as const, label: '商品参考 1', url: '/product.png' }];
function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap((child) => isValidElement<Record<string, unknown>>(child) ? [child, ...nodes(child.props.children as ReactNode)] : []);
}
beforeEach(() => { hooks.index = 0; hooks.values = []; });
afterEach(() => vi.unstubAllGlobals());

describe('sales prompt display preserves submission text', () => {
  it('copies the exact original prompt without editing it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const onChange = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const view = SalesPromptEditor({ prompt, references, disabled: false, onChange });
    const copy = nodes(view).find((node) => node.type === 'button' && node.props.children && renderToStaticMarkup(node).includes('复制'))!;
    (copy.props.onClick as () => void)();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledExactlyOnceWith(prompt);
    expect(onChange).not.toHaveBeenCalled();
  });
  it('passes edits through the existing callback verbatim and retains the disabled gate', () => {
    hooks.values = [true];
    const onChange = vi.fn();
    const view = SalesPromptEditor({ prompt, references, disabled: true, onChange });
    const input = nodes(view).find((node) => node.type === 'textarea')!;
    expect(input.props.value).toBe(prompt);
    expect(input.props.disabled).toBe(true);
    (input.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: `${prompt}  修改\n` } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(`${prompt}  修改\n`);
  });
  it('keeps all sections, unknown image numbers and multiline content visible', () => {
    const html = renderToStaticMarkup(createElement(SalesStructuredPrompt, { prompt, references }));
    for (const text of ['前言保留', '成片执行约束', '原文与空格保留', '时间轴与剪辑 0-15s', '图片99未知编号。', '结尾']) expect(html).toContain(text);
    expect(html).toContain('aria-label="查看图片1"');
  });
  it('only offers structured reading and does not repeat a reference gallery', () => {
    const html = renderToStaticMarkup(createElement(SalesPromptEditor, { prompt, references, disabled: false, onChange: vi.fn() }));
    expect(html).not.toContain('纯文本');
    expect(html).not.toContain('引用素材映射');
    expect(html).not.toContain('sales-prompt-mapping');
    expect(html).toContain('sales-structured-prompt');
  });
});
