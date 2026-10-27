import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BatchHistoryProduct, BatchHistoryRecord, BatchHistoryStats, formatBatchHistoryDate } from './BatchHistoryContent';
import type { WorkshopBatch } from '@shared/workshopSnapshot';

type Product = WorkshopBatch['snapshot']['items'][number];
const item: Product = {
  id: 'p1', itemId: '123456789', platform: 'jd', title: '休闲包', price: 0, category: '', brand: '', coverImage: '/reference.jpg',
  mainImages: [], skuImages: [], detailImages: [], props: {}, status: 'success', selected: false,
  allTypedImages: [], selectedProductImages: [], prompts: [],
  tasks: [
    { id: 'new', shot_no: 1, title: '正面', prompt: '', status: 'SUCCESS', resultUrl: '/new.jpg', revision: 1, resultStatus: 'current', outputReview: 'unreviewed' },
    { id: 'old', shot_no: 2, title: '旧图', prompt: '', status: 'SUCCESS', resultUrl: '/old.jpg', revision: 0, resultStatus: 'superseded', outputReview: 'unreviewed' },
    { id: 'expired', shot_no: 3, title: '过期', prompt: '', status: 'SUCCESS', resultUrl: 'blob:expired', revision: 1, resultStatus: 'current', outputReview: 'unreviewed' },
    { id: 'failure', shot_no: 4, title: '失败', prompt: '', status: 'FAILURE', revision: 1, resultStatus: 'current', outputReview: 'unreviewed' },
  ],
};

describe('batch history product previews', () => {
  it('shows a compact product summary, status, and update time in each list record', () => {
    const html = renderToStaticMarkup(createElement(BatchHistoryRecord, { batch: {
      id: 'batch_a12345', name: '双11上新 · 手机主图 · 第一轮', status: 'archived', revision: 1,
      createdAt: '2026-10-24T00:00:00.000Z', updatedAt: '2026-10-24T02:00:00.000Z',
      itemCount: 2, readyCount: 2, taskCount: 8, resultCount: 0, failedCount: 8, productTitles: ['长商品标题'],
    }, disabled: false, selected: false, onView: vi.fn() }));
    expect(html).toContain('双11上新 · 手机主图 · 第一轮');
    expect(html).not.toContain('EC-20261024-A12345');
    expect(html).toContain('长商品标题 等 2 款');
    expect(html).toContain('有失败');
    expect(html).toContain('8 个失败');
    expect(html).toContain(formatBatchHistoryDate('2026-10-24T02:00:00.000Z'));
  });
  it('uses one native checkbox per record in selection mode without a competing view action', () => {
    const html = renderToStaticMarkup(createElement(BatchHistoryRecord, { batch: {
      id: 'batch_select', name: '待整理批次', status: 'archived', revision: 1,
      createdAt: '2026-10-24T00:00:00.000Z', updatedAt: '2026-10-24T02:00:00.000Z',
      itemCount: 0, readyCount: 0, taskCount: 0,
    }, disabled: false, selected: true, selectionMode: true, checked: true, onView: vi.fn() }));
    expect(html).toContain('<label');
    expect(html.match(/type="checkbox"/g)).toHaveLength(1);
    expect(html).toContain('checked=""');
    expect(html).toContain('aria-label="选择 待整理批次"');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('aria-pressed');
  });
  it('formats batch timestamps in Beijing time and handles invalid dates', () => {
    expect(formatBatchHistoryDate('2026-10-24T23:30:00.000Z')).toBe('2026/10/25 07:30');
    expect(formatBatchHistoryDate('invalid')).toBe('时间未知');
  });
  it('shows reference and usable result previews even when the product was deselected, excluding obsolete and expired images', () => {
    const html = renderToStaticMarkup(createElement(BatchHistoryProduct, { item, index: 0, onPreview: vi.fn() }));
    expect(html).toContain('预览 休闲包 商品图');
    expect(html).toContain('预览 休闲包 第 1 镜');
    expect(html).not.toContain('第 2 镜');
    expect(html).not.toContain('第 3 镜');
    expect(html).toContain('成图 1/3');
    expect(html).toContain('1 个分镜失败');
  });
  it('keeps compact counts consistent with usable results and failures', () => {
    const snapshot = { items: [{ ...item, copywriting: { title: '标题', content: '正文' } }] };
    const html = renderToStaticMarkup(createElement(BatchHistoryStats, { batch: { snapshot } }));
    expect(html.match(/>1<\/dd>/g)).toHaveLength(3);
  });
});
