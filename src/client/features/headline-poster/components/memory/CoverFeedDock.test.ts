import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoverFeedDock } from './CoverFeedDock';

const state = vi.hoisted(() => ({ portal: vi.fn() }));
vi.mock('react-dom', () => ({ createPortal: (content: unknown, target: unknown) => { state.portal(target); return content; } }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('cover feed fallback dock', () => {
  it('renders the open panel in a body portal and leaves the closed dock empty', () => {
    const body = {};
    vi.stubGlobal('document', { body });
    expect(renderToStaticMarkup(createElement(CoverFeedDock, { open: false, children: createElement('section', null, '投喂内容') }))).toBe('');
    const html = renderToStaticMarkup(createElement(CoverFeedDock, { open: true, children: createElement('section', null, '投喂内容') }));
    expect(state.portal).toHaveBeenCalledWith(body);
    expect(html).toContain('投喂内容');
    expect(html).toContain('overflow-y-auto');
    expect(html).not.toContain('aria-label="投喂封面样张"');
  });
});
