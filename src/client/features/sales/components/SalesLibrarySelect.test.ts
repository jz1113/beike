import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { SalesLibrarySelect } from './SalesLibrarySelect';

it('shows counts with a unit in filter options without repeating totals in closed controls', () => {
  const html = renderToStaticMarkup(createElement(SalesLibrarySelect, { value: 'all', label: '按风格筛选', onChange: () => {},
    showSelectedCount: false, countUnit: '组', options: [{ value: 'all', label: '全部风格', count: 1 }, { value: 'dance', label: '舞蹈', count: 1 }] }));
  const trigger = html.slice(html.indexOf('<button'), html.indexOf('</button>'));
  expect(trigger).toContain('全部风格');
  expect(trigger).not.toContain('sales-library-select-count');
  expect(html.match(/>1 组</g)).toHaveLength(2);
});
