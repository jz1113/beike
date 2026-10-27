import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CategoryMemoryView } from './CategoryMemoryView';

const memory: ComponentProps<typeof CategoryMemoryView>['memory'] = {
  entries: ['last', 'unknown', 'first'].map(groupId => ({ groupId, title: groupId, state: 'pending', reason: '', rules: [], conditions: [], avoid: [], model: '', createdAt: '' })),
  notes: [], learned: 0, pending: 3, rejected: 0, holdout: 0, fingerprint: '',
};

describe('learning memory group identities', () => {
  it('uses library identities rather than the position in the memory list', () => {
    const html = renderToStaticMarkup(createElement(CategoryMemoryView, { memory, groupNumbers: new Map([['last', 27], ['first', 16]]), busy: false, onPreview: vi.fn(), onRun: vi.fn() }));
    expect(html).toContain('图组 16');
    expect(html).toContain('图组 27');
    expect(html.indexOf('图组 16')).toBeLessThan(html.indexOf('图组 27'));
    expect(html).toContain('未编号图组');
    expect(html).not.toContain('图组 01');
    expect(html).not.toContain('图组 02');
  });

  it('leaves missing identities unnumbered when the library mapping is unavailable', () => {
    const html = renderToStaticMarkup(createElement(CategoryMemoryView, { memory, busy: false, onPreview: vi.fn(), onRun: vi.fn() }));
    expect(html.match(/未编号图组/g)).toHaveLength(3);
    expect(html).not.toContain('图组 01');
  });
});
