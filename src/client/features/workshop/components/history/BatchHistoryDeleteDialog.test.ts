import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BatchHistoryDeleteDialog } from './BatchHistoryDeleteDialog';

const props = {
  title: '删除选中的 4 个批次？', names: ['春季主图', '夏季详情', '秋季上新', '冬季补图'], count: 4,
  busy: false, error: '', onCancel: vi.fn(), onConfirm: vi.fn(),
};

describe('batch deletion confirmation', () => {
  it('announces the destructive action, exact scope and retained images in a modal', () => {
    const html = renderToStaticMarkup(createElement(BatchHistoryDeleteDialog, props));
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="batch-delete-title"');
    expect(html).toContain('aria-describedby="batch-delete-description batch-delete-names"');
    expect(html).toContain('删除选中的 4 个批次？');
    expect(html).toContain('春季主图、夏季详情、秋季上新 等 4 个批次');
    expect(html).not.toContain('冬季补图');
    expect(html).toContain('当前批次和已保存的图片文件会保留');
  });

  it('disables both actions while deletion is pending', () => {
    const html = renderToStaticMarkup(createElement(BatchHistoryDeleteDialog, { ...props, busy: true }));
    expect(html).toContain('aria-busy="true"');
    expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(2);
    expect(html).toContain('正在删除…');
  });

  it('keeps failure feedback and retry actions inside the confirmation', () => {
    const html = renderToStaticMarkup(createElement(BatchHistoryDeleteDialog, { ...props, error: '网络连接失败，请重试' }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('网络连接失败，请重试');
    expect(html).toContain('确认删除');
    expect(html).not.toContain('disabled=""');
  });
});
