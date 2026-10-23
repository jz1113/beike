import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AppearanceAudienceFilter } from './AppearanceAudienceControls';

const asset = (id: string, audience: string) => ({ id, dimensions: JSON.stringify({ audience }) });
const render = (items: Record<string, unknown>[], value: Parameters<typeof AppearanceAudienceFilter>[0]['value'] = 'all') =>
  renderToStaticMarkup(createElement(AppearanceAudienceFilter, { type: 'outfit', value, onChange: vi.fn(), items }));

describe('appearance audience filter', () => {
  it('lists only audiences that contain assets', () => {
    const html = render([asset('1', 'adult_female'), asset('2', 'adult_female'), asset('3', 'unknown')]);
    expect(html).toContain('全部人群');
    expect(html).toContain('成年女');
    expect(html).toContain('待分类');
    expect(html).not.toContain('成年男');
    expect(html).not.toContain('儿童通用');
  });

  it('hides the row when every asset shares one audience', () => {
    expect(render([asset('1', 'unknown'), asset('2', 'unknown')])).toBe('');
    expect(render([])).toBe('');
  });

  it('keeps the active audience visible after it becomes empty', () => {
    const html = render([asset('1', 'unknown')], 'adult_male');
    expect(html).toContain('成年男');
    expect(html).toContain('全部人群');
  });
});
