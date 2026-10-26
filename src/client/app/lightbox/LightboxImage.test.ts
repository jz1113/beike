import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LightboxImage } from './LightboxImage';

// Exercise browser load/error/ref transitions across rerenders without a DOM dependency.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? initial() : initial;
    return [hooks.values[index], (value: unknown) => {
      hooks.values[index] = typeof value === 'function' ? value(hooks.values[index]) : value;
    }];
  },
}));
vi.mock('./lightboxImageSources', () => ({
  resolveLightboxImageSources: () => ({
    sources: ['https://proxy.example/large.png', 'https://source.example/original.png'],
    preview: { src: 'https://proxy.example/thumb.png', width: 640, height: 480 },
  }),
}));

function render(alt = '生成的图片') {
  hooks.cursor = 0;
  const tree = LightboxImage({ resultUrl: 'https://source.example/original.png', alt });
  function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
    return Children.toArray(node).flatMap((child) => isValidElement<Record<string, unknown>>(child)
      ? [child, ...elements(child.props.children as ReactNode)] : []);
  }
  const entries = elements(tree);
  return {
    entries,
    images: entries.filter((entry) => entry.type === 'img'),
    full: entries.find((entry) => entry.type === 'img' && entry.props.alt === alt)!,
  };
}
beforeEach(() => { hooks.values = []; });

describe('progressive lightbox image', () => {
  it('displays the loaded preview immediately while high resolution loads eagerly', () => {
    const { images, full } = render();
    expect(images).toHaveLength(2);
    expect(images[0].props.src).toContain('thumb.png');
    expect(images[0].props.className).not.toContain('opacity-0');
    expect(full.props).toMatchObject({ loading: 'eager', fetchPriority: 'high', referrerPolicy: 'no-referrer' });
  });

  it('reveals cached images even when their load event has already fired', () => {
    (render().full.props.ref as (image: unknown) => void)({ complete: true, naturalWidth: 400, naturalHeight: 400 });
    const view = render();
    expect(view.images).toHaveLength(1);
    expect(view.full.props.className).toContain('opacity-100');
    expect(view.full.props.src).toContain('large.png');
  });

  it('does not hide a loaded image when task metadata rerenders', () => {
    (render().full.props.onLoad as () => void)();
    const view = render('更新后的提示词');
    expect(view.full.props.className).toContain('opacity-100');
    expect(view.entries.some((entry) => entry.props['aria-label'] === '正在加载高清图片')).toBe(false);
  });

  it('retains the preview through failures and supports retry', () => {
    (render().full.props.onError as () => void)();
    expect(render().full.props.src).toContain('original.png');
    (render().full.props.onError as () => void)();
    const failed = render();
    expect(failed.images[0].props.src).toContain('thumb.png');
    const button = failed.entries.find((entry) => entry.type === 'button')!;
    (button.props.onClick as () => void)();
    expect(render().full.props.src).toContain('large.png');
    expect(render().full.key).not.toBe(failed.full.key);
  });
});
