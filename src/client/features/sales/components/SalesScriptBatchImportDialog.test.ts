import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SalesScriptImportItem } from '../model/salesScriptImport';
import { SalesScriptBatchImportDialog } from './SalesScriptBatchImportDialog';

vi.mock('../hooks/useSalesSummaryModels', () => ({
  useSalesSummaryModels: () => ({ options: [], model: 'vision-model' }),
}));
vi.mock('@client/shared/models/ConfiguredModelPicker', () => ({
  ConfiguredModelPicker: ({ ariaLabel, disabled }: { ariaLabel: string; disabled: boolean }) => createElement('button', { 'aria-label': ariaLabel, disabled }),
}));

const props = {
  preferredModel: 'vision-model', onModelChange: vi.fn(), items: [] as SalesScriptImportItem[],
  pending: false, error: '', errors: [] as string[], includeDepth: true, onIncludeDepthChange: vi.fn(),
  blockedReason: '',
  onAddFiles: vi.fn(), onRemove: vi.fn(), onClearCompleted: vi.fn(), onStart: vi.fn(), onStop: vi.fn(), onClose: vi.fn(),
};
const item: SalesScriptImportItem = {
  key: 'video-1', name: '跳舞1.mp4', size: 12, lastModified: 1, status: 'queued', error: '', saveId: 'script-1',
};
function render(patch: Partial<typeof props> = {}) {
  return renderToStaticMarkup(createElement(SalesScriptBatchImportDialog, { ...props, ...patch }));
}

describe('action reference batch import dialog', () => {
  it('accepts multiple videos and explains what remains after processing', () => {
    const html = render();
    expect(html).toMatch(/<input[^>]*type="file"[^>]*multiple=""/);
    expect(html).toContain('video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm');
    expect(html).toContain('处理结束即清理原片');
    expect(html).toContain('同时生成深度动作视频');
    expect(html).toContain('超出限制仍保存分析脚本');
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
    expect(html).toContain('需要原片时请重新选择本地文件');
  });

  it('allows hiding a running batch while protecting queue options', () => {
    const html = render({ pending: true, items: [{ ...item, status: 'depth', scriptId: 'saved-1', depthProgress: '处理进度 40%' }] });
    expect(html).toMatch(/<button[^>]*aria-label="收起动作素材批量导入"[^>]*>/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="收起动作素材批量导入"/);
    expect(html).not.toMatch(/<button[^>]*aria-label="收起动作素材批量导入"[^>]*disabled=""/);
    expect(html).toMatch(/<button[^>]*aria-label="动作素材批量分析模型"[^>]*disabled=""/);
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*disabled=""/);
    expect(html).toContain('暂停队列');
    expect(html).toContain('脚本已入库，可在动作分类查看');
    expect(html).toContain('处理进度 40%');
    expect(html).toContain('已入库 1 / 1');
  });

  it('keeps failed and completed results distinct for resuming only unfinished items', () => {
    const html = render({ items: [
      { ...item, status: 'done', scriptId: 'saved-1', depthState: 'skipped' },
      { ...item, key: 'video-2', name: '跳舞2.mp4', status: 'error', error: '模型暂不可用' },
    ], errors: ['忽略了不支持的格式'], error: '队列已暂停' });
    expect(html).toContain('仅保存脚本，深度视频可稍后处理');
    expect(html).toContain('模型暂不可用');
    expect(html).toContain('忽略了不支持的格式');
    expect(html).toContain('队列已暂停');
    expect(html).toContain('继续未完成项（1）');
    expect(html).toContain('清除已完成记录');
    expect(html).not.toContain('移除待处理视频 跳舞1.mp4');
    expect(html).toContain('移除待处理视频 跳舞2.mp4');
  });

  it('explains why a pending single-video task must be preserved before starting the batch', () => {
    const html = render({ items: [item], blockedReason: '请先暂存正在处理的单个视频，再开始批量分析。' });
    expect(html).toContain('请先暂存正在处理的单个视频，再开始批量分析。');
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });
});
