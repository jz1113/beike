import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SalesImagePreviewButton } from './SalesImagePreview';

const state = vi.hoisted(() => ({ values: new Map<unknown, unknown>(), visible: true }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useEffect: () => {},
  useState: (initial: unknown) => [state.values.has(initial) ? state.values.get(initial) : initial, (next: unknown) => {
    state.values.set(initial, typeof next === 'function' ? next(state.values.get(initial) ?? initial) : next);
  }],
}));
vi.mock('react-dom', () => ({ createPortal: (children: ReactNode) => children }));
vi.mock('@client/shared/hooks/useModalDialog', () => ({ useModalDialog: () => ({ current: null }) }));
vi.mock('@client/shared/hooks/useViewVisibility', () => ({ useViewVisibility: () => state.visible }));

const images = [{ url: '/product.png', label: '商品参考', kind: 'product' }, { url: '', label: '待生成场景' }, { url: '/person.png', label: '出镜人物', kind: 'person', prompt: '人物穿黑色卫衣，室内自然光。' }];
function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap((child) => isValidElement<Record<string, unknown>>(child) ? [child, ...nodes(child.props.children as ReactNode)] : []);
}
function view() { return SalesImagePreviewButton({ image: images[0], images, children: '查看商品图' }); }
function dialog() {
  const modal = nodes(view()).find((node) => typeof node.type === 'function')!;
  return (modal.type as (props: unknown) => ReactElement<Record<string, unknown>>)(modal.props);
}
beforeEach(() => { state.values.clear(); state.visible = true; vi.stubGlobal('document', { body: {} }); });
afterEach(() => vi.unstubAllGlobals());

describe('sales image preview', () => {
  it('opens a local dialog with the clicked image instead of a navigation link', () => {
    const closed = view();
    const trigger = nodes(closed).find((node) => node.type === 'button')!;
    expect(trigger.props['aria-haspopup']).toBe('dialog');
    expect(trigger.props.href).toBeUndefined();
    (trigger.props.onClick as () => void)();
    const html = renderToStaticMarkup(dialog());
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('src="/product.png"');
    expect(html).toContain('1 / 2');
    expect(html).toContain('aria-label="素材信息"');
    expect(html).toContain('商品参考图');
    expect(html).not.toContain('待生成场景');
  });
  it('switches only available images and closes through the local callback', () => {
    state.values.set(false, true);
    let modal = dialog();
    const next = nodes(modal).find((node) => node.props['aria-label'] === '下一张图片')!;
    (next.props.onClick as () => void)();
    modal = dialog();
    expect(renderToStaticMarkup(modal)).toContain('src="/person.png"');
    expect(renderToStaticMarkup(modal)).toContain('人物穿黑色卫衣，室内自然光。');
    expect(nodes(modal).find((node) => node.props['aria-label'] === '下一张图片')!.props.disabled).toBe(true);
    const event = { key: 'ArrowLeft', preventDefault: vi.fn(), stopPropagation: vi.fn() };
    (modal.props.onKeyDown as (event: unknown) => void)(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(renderToStaticMarkup(dialog())).toContain('src="/product.png"');
    const info = nodes(modal).find((node) => typeof node.type === 'function' && node.props.onClose)!;
    const panel = (info.type as (props: unknown) => ReactElement)(info.props);
    (nodes(panel).find((node) => node.props['aria-label'] === '关闭图片预览')!.props.onClick as () => void)();
    expect(nodes(view()).every((node) => typeof node.type !== 'function')).toBe(true);
  });
  it('suspends the portal when the sales view is hidden', () => {
    state.values.set(false, true);
    state.visible = false;
    expect(dialog()).toBeNull();
  });
  it('preserves the clicked reference number when entries share an image URL', () => {
    state.values.set(false, true);
    const repeated = [{ url: '/same.png', label: '图片1' }, { url: '/same.png', label: '图片2' }];
    const currentDialog = () => {
      const tree = SalesImagePreviewButton({ image: repeated[1], images: repeated, children: '图片2' });
      const modal = nodes(tree).find((node) => typeof node.type === 'function')!;
      return (modal.type as (props: unknown) => ReactElement<Record<string, unknown>>)(modal.props);
    };
    const modal = currentDialog();
    expect(renderToStaticMarkup(modal)).toContain('2 / 2');
    expect(renderToStaticMarkup(modal)).toContain('alt="图片2"');
    (nodes(modal).find((node) => node.props['aria-label'] === '上一张图片')!.props.onClick as () => void)();
    expect(renderToStaticMarkup(currentDialog())).toContain('alt="图片1"');
  });
});
