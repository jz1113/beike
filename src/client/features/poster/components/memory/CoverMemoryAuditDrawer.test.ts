import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CoverMemoryAuditDrawer } from './CoverMemoryAuditDrawer';
import type { CoverMemoryEntry, CoverMemoryUsage } from '@shared/contracts/coverMemory';

const entry: CoverMemoryEntry = { id: 'entry', branch: 'layout', rule: '后来的规则', evidence: '', sampleId: 'sample', status: 'adopted', source: 'sample', useCount: 1, createdAt: '' };
const usage: CoverMemoryUsage = { id: 'usage', batchId: 'batch', itemId: 'item', itemTitle: '历史封面', entryIds: ['entry'], design: { memoryRules: '原始规则：品牌完整', memoryRevisionId: 'revision' }, createdAt: '2026-10-01', rating: 'good' };
function render(record: CoverMemoryUsage) {
  return renderToStaticMarkup(createElement(CoverMemoryAuditDrawer, { usages: [record], entries: [entry], busy: false, onClose: vi.fn(), onRestore: vi.fn(), onClearTrash: vi.fn(), onSaveFeedback: vi.fn(async () => true) }));
}

describe('cover audit historical evidence', () => {
  it('renders saved rule text after the underlying entry has changed', () => {
    const html = render(usage);
    expect(html).toContain('原始规则：品牌完整');
    expect(html).not.toContain('后来的规则');
    expect(html).toContain('成图反馈');
  });
  it('distinguishes an empty snapshot from legacy records lacking a snapshot', () => {
    expect(render({ ...usage, entryIds: [], design: { memoryRules: '' } })).toContain('本次未引用经验');
    expect(render({ ...usage, design: {} })).toContain('旧版记录（规则可能已更新）');
  });
});
