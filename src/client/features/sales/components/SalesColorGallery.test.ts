import { isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SalesColorGallery } from './SalesColorGallery';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[] }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  memo: (component: unknown) => component,
  useRef: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useState: <T>(initial: T) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = initial;
    return [hooks.slots[index], (value: T) => { hooks.slots[index] = value; }];
  },
}));
type Props = ComponentProps<typeof SalesColorGallery>;
type Button = ReactElement<ComponentProps<'button'>>;
function props(): Props {
  return {
    images: [{ index: 0, url: '/main.png', role: 'main' }, { index: 1, url: '/detail.png', role: 'detail' }],
    selection: { colorLabel: '', confirmedImageUrls: ['/detail.png'], excludedImageUrls: [] },
    metadata: undefined, disabled: false, onChange: vi.fn(), onImageError: vi.fn(),
    onAddOCRImages: vi.fn(), onRecognizeImages: vi.fn(), onConfirmSelection: vi.fn(),
  };
}
function render(value: Props) {
  hooks.index = 0;
  const tree = SalesColorGallery(value);
  return { tree, html: renderToStaticMarkup(tree) };
}
function findButton(node: ReactNode, label: string): Button | undefined {
  if (Array.isArray(node)) return node.map((child) => findButton(child, label)).find(Boolean);
  if (!isValidElement<{ children?: ReactNode; 'aria-label'?: string }>(node)) return undefined;
  if (node.type === 'button' && (node.props['aria-label'] === label || renderToStaticMarkup(node).replace(/<[^>]*>/g, '') === label)) return node as Button;
  return findButton(node.props.children, label);
}
function click(tree: ReactNode, label: string, event = {}) {
  const button = findButton(tree, label);
  expect(button).toBeDefined();
  button?.props.onClick?.(event as Parameters<NonNullable<ComponentProps<'button'>['onClick']>>[0]);
}
beforeEach(() => { hooks.index = 0; hooks.slots = []; });

describe('product reference gallery interactions', () => {
  it('keeps reference selection independent from OCR and preserves click order', () => {
    const value = props();
    const { tree, html } = render(value);
    expect(html).not.toContain('sales-masonry');
    expect(html).toContain('sales-thumbnail-grid');
    expect(html).not.toContain('全选本组');
    click(tree, '选择商品图 1');
    expect(value.onChange).toHaveBeenCalledWith({ colorLabel: '', confirmedImageUrls: ['/detail.png', '/main.png'], excludedImageUrls: [] });
    expect(value.onAddOCRImages).not.toHaveBeenCalled();
    expect(value.onRecognizeImages).not.toHaveBeenCalled();
    value.selection = { colorLabel: '', confirmedImageUrls: ['/detail.png', '/main.png'], excludedImageUrls: [] };
    const numbered = render(value).tree;
    const main = findButton(numbered, '取消选择商品图 1');
    expect(renderToStaticMarkup(main!)).toMatch(/sales-reference-check[^>]*>2<\/span>/);
  });
  it('limits batch selection and recognition to the current category', () => {
    const value = { ...props(), initialGroup: 'main' as const };
    const { tree } = render(value);
    click(tree, '将当前分类全部选为参考图');
    expect(value.onChange).toHaveBeenCalledWith({ colorLabel: '', confirmedImageUrls: ['/detail.png', '/main.png'], excludedImageUrls: [] });
    click(tree, '识别当前分类文字');
    expect(value.onRecognizeImages).toHaveBeenCalledWith(['/main.png']);
    expect(value.onAddOCRImages).not.toHaveBeenCalled();
    click(tree, '清空参考图选择');
    expect(value.onChange).toHaveBeenLastCalledWith({ colorLabel: '', confirmedImageUrls: [], excludedImageUrls: ['/main.png', '/detail.png'] });
  });
  it('keeps confirmation pending when draft saving fails', () => {
    const value = { ...props(), onConfirmSelection: vi.fn(() => false) };
    click(render(value).tree, '确认选择');
    expect(value.onConfirmSelection).toHaveBeenCalledOnce();
    expect(render(value).html).not.toContain('参考图选择已确认');
  });
  it('opens preview without selecting an image and confirms without collapsing', () => {
    const value = props();
    const stopPropagation = vi.fn();
    click(render(value).tree, '查看商品图 1 大图', { stopPropagation, currentTarget: {} });
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(value.onChange).not.toHaveBeenCalled();
    const { tree, html } = render(value);
    expect(html).toContain('aria-label="商品图片大图"');
    click(tree, '确认选择');
    expect(value.onConfirmSelection).toHaveBeenCalledOnce();
    expect(value.onChange).not.toHaveBeenCalled();
    expect(render(value).html).toContain('参考图选择已确认');
  });
});
