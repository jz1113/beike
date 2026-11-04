import { isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ConfiguredModelPicker } from '@client/shared/models/ConfiguredModelPicker';
import { useSalesTextModels } from '../hooks/useSalesTextModels';
import { emptySalesCollection, type SalesCollectionState } from '../model/salesCollectionDraft';
import { salesSummarySource } from '../model/salesSummary';
import { SalesProductBottomBar } from './SalesProductBottomBar';
type Props = ComponentProps<typeof SalesProductBottomBar>;

vi.mock('../hooks/useSalesTextModels', () => ({ useSalesTextModels: vi.fn(() => ({ model: 'vision', options: [{ id: 'vision', name: 'Vision' }] })) }));
const noop = () => {};
const ocr = { engine: 'test', width: 100, height: 100, text: '纯棉面料', lines: [], cached: false };
const recognized: SalesCollectionState = {
  ...emptySalesCollection(), imageCatalog: [{ index: 0, url: '/text', role: 'detail' }], ocrImageUrls: ['/text'],
  ocrImages: [{ imageUrl: '/text', editedText: ocr.text, result: ocr }],
};
const result = {
  summary: '纯棉衬衫', points: [{ benefit: '舒适亲肤', feature: '纯棉面料', expression: '贴身穿也很舒服', sources: ['ocr-1'] }],
  copy: '纯棉衬衫，舒适亲肤。', copyPointIndexes: [1], conflicts: [], questions: [], cautions: [],
};
const completed: SalesCollectionState = {
  ...recognized, productSummary: { result, model: 'vision', skillVersion: 'v1', generatedAt: '2026-11-01T00:00:00.000Z', inputKey: salesSummarySource(recognized).inputKey },
};
function view(state: SalesCollectionState, patch: Partial<Props> = {}) {
  const tree = SalesProductBottomBar({
    state, disabled: false, onChange: noop, onRecognize: noop, onCancel: noop, progress: null, report: null,
    onRetryFailed: noop, onRequestImages: noop,
    summaryActions: { pending: false, error: null, onRun: noop, onCancel: noop, onScrollToProduction: noop }, ...patch,
  });
  return { tree, html: renderToStaticMarkup(tree) };
}
function buttons(html: string) {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(([, attrs, body]) => ({ attrs, label: body.replace(/<[^>]*>/g, '') }));
}
function findElement(node: ReactNode, predicate: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(node)) return node.map((child) => findElement(child, predicate)).find(Boolean);
  if (!isValidElement<Record<string, unknown>>(node)) return undefined;
  if (predicate(node)) return node;
  return findElement(node.props.children as ReactNode, predicate);
}
function textContent(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return isValidElement<{ children?: ReactNode }>(node) ? textContent(node.props.children) : '';
}
function click(node: ReactNode, label: string) {
  const element = findElement(node, (value) => value.type === 'button' && textContent(value.props.children as ReactNode) === label);
  if (!element) throw new Error(`Missing button: ${label}`);
  (element.props.onClick as () => void)();
}

describe('product bottom action hierarchy', () => {
  it('shows model, OCR and extraction controls alongside optional storyboard navigation', () => {
    const onScrollToProduction = vi.fn();
    const { tree, html } = view({ ...recognized, ocrImageUrls: [], colorSelection: { colorLabel: '', confirmedImageUrls: ['/text'], excludedImageUrls: [] } }, { summaryActions: { pending: false, error: null, onRun: noop, onCancel: noop, onScrollToProduction } });
    click(tree.props.right, '跳过，进入分镜');
    expect(onScrollToProduction).toHaveBeenCalledOnce();
    const list = buttons(html);
    expect(list.map((button) => button.label)).toEqual(['Vision', '添加详情图', '跳过，进入分镜', '提炼卖点']);
    expect(list[0].attrs).toContain('aria-label="卖点提炼模型"');
    expect(list[1].attrs).not.toContain('sales-collect-primary');
    expect(list[2].attrs).toContain('sales-text-button');
    expect(list[3].attrs).toContain('sales-collect-primary');
    expect(list[3].attrs).toContain('disabled=""');
    expect(html).not.toContain('生成设置');
    expect(html).not.toContain('张参考图');
    expect(html).not.toContain('sales-actionbar-hint');
  });

  it('keeps OCR and extraction from supplementary text independently available', () => {
    const state = { ...recognized, ocrImages: [], sellingPoints: '补充的商品材质' };
    const onRecognize = vi.fn();
    const onRun = vi.fn();
    const { tree, html } = view(state, { onRecognize, summaryActions: { pending: false, error: null, onRun, onCancel: noop, onScrollToProduction: noop } });
    const list = buttons(html);
    expect(list.find((button) => button.label === 'OCR 识别')?.attrs).not.toContain('disabled=""');
    expect(list.find((button) => button.label === '提炼卖点')?.attrs).not.toContain('disabled=""');
    expect(list.filter((button) => button.attrs.includes('sales-collect-primary')).map((button) => button.label)).toEqual(['提炼卖点']);
    click(tree.props.right, 'OCR 识别');
    expect(onRecognize).toHaveBeenCalledOnce();
    expect(onRun).not.toHaveBeenCalled();
    expect(tree.props.left).toBeUndefined();
  });

  it('disables completed OCR instead of offering an action that does nothing', () => {
    const list = buttons(view(recognized).html);
    expect(list.find((button) => button.label === 'OCR 已识别')?.attrs).toContain('disabled=""');
    expect(list.find((button) => button.label === '提炼卖点')?.attrs).not.toContain('disabled=""');
    expect(list.find((button) => button.label === '提炼卖点')?.attrs).toContain('按当前商品资料与核对后的 OCR 文字提炼卖点。');
  });

  it('keeps extraction errors visible in the fixed bar and clears them when the sources fit', () => {
    const imageCatalog = Array.from({ length: 2 }, (_, index) => ({ index, url: `/text-${index}`, role: 'detail' as const }));
    const state = { ...recognized, imageCatalog, ocrImageUrls: imageCatalog.map((image) => image.url),
      ocrImages: imageCatalog.map((image) => ({ imageUrl: image.url, editedText: '字'.repeat(30_001), result: ocr })) };
    const { tree, html } = view(state);
    expect(renderToStaticMarkup(tree.props.left)).toContain('role="status">OCR 文字来源无效或过长');
    expect(textContent(tree.props.left)).toContain('60000 字');
    expect(buttons(html).find((button) => button.label === '提炼卖点')?.attrs).toContain('disabled=""');
    const reduced = view({ ...state, ocrImageUrls: state.ocrImageUrls.slice(0, 1) });
    expect(reduced.tree.props.left).toBeUndefined();
    expect(buttons(reduced.html).find((button) => button.label === '提炼卖点')?.attrs).not.toContain('disabled=""');
    expect(view(state, { disabled: true }).tree.props.left).toBeUndefined();
    expect(view(state, { progress: { completed: 1, total: 2, current: 2, imageUrl: '/text-1', succeeded: 1, failed: 0 } }).tree.props.left).toBeUndefined();
  });

  it('shows missing-model guidance for existing text or results and keeps empty input quiet', () => {
    vi.mocked(useSalesTextModels).mockReturnValueOnce({ model: '', options: [] });
    expect(textContent(view(recognized).tree.props.left)).toBe('请在底部选择卖点提炼模型。');
    vi.mocked(useSalesTextModels).mockReturnValueOnce({ model: '', options: [] });
    expect(textContent(view({ ...completed, sellingPoints: '补充的商品材质' }).tree.props.left)).toBe('请在底部选择卖点提炼模型。');
    expect(textContent(view({ ...completed, ocrImageUrls: [] }).tree.props.left)).toBe('请先补充商品资料或核对 OCR 识别文字，再提炼卖点。');
    expect(view(emptySalesCollection()).tree.props.left).toBeUndefined();
    expect(view({ ...recognized, ocrImages: [] }).tree.props.left).toBeUndefined();
    expect(view({ ...recognized, ocrImages: [], sellingPoints: '只有手填资料' }).tree.props.left).toBeUndefined();
  });

  it('retries failed OCR independently of existing text and extraction', () => {
    const onRetryFailed = vi.fn();
    const onRecognize = vi.fn();
    const { tree, html } = view({ ...recognized, ocrImages: [{ ...recognized.ocrImages[0], error: '识别失败' }] }, { onRetryFailed, onRecognize });
    expect(buttons(html).find((button) => button.label === '重试识别')?.attrs).not.toContain('disabled=""');
    click(tree.props.right, '重试识别');
    expect(onRetryFailed).toHaveBeenCalledOnce();
    expect(onRecognize).not.toHaveBeenCalled();
  });

  it('makes storyboard primary after extraction and keeps re-extraction accessible', () => {
    const onRun = vi.fn();
    const onScrollToProduction = vi.fn();
    const { tree, html } = view(completed, { summaryActions: { pending: false, error: null, onRun, onCancel: noop, onScrollToProduction } });
    const list = buttons(html);
    expect(list.map((button) => button.label)).toEqual(['Vision', 'OCR 已识别', '重新提炼', '下一步：分镜脚本']);
    expect(list.find((button) => button.label === '重新提炼')?.attrs).toContain('sales-text-button');
    expect(list.filter((button) => button.attrs.includes('sales-collect-primary')).map((button) => button.label)).toEqual(['下一步：分镜脚本']);
    click(tree.props.right, '重新提炼');
    expect(onRun).toHaveBeenCalledWith('vision');
    click(tree.props.right, '下一步：分镜脚本');
    expect(onScrollToProduction).toHaveBeenCalledOnce();
  });

  it('keeps the corresponding stop action available while other controls are locked', () => {
    const onCancel = vi.fn();
    const pending = view(completed, { disabled: true, summaryActions: { pending: true, error: null, onRun: noop, onCancel, onScrollToProduction: noop } });
    const pendingButtons = buttons(pending.html);
    expect(pendingButtons.find((button) => button.label === '提炼中')?.attrs).toContain('disabled=""');
    expect(pendingButtons.find((button) => button.label === '停止提炼')?.attrs).not.toContain('disabled=""');
    click(pending.tree.props.right, '停止提炼');
    expect(onCancel).toHaveBeenCalledOnce();
    const running = view(recognized, { disabled: true, onCancel, progress: { completed: 1, total: 4, current: 2, imageUrl: '/text', succeeded: 1, failed: 0 } });
    const runningButtons = buttons(running.html);
    expect(runningButtons.find((button) => button.label === '跳过，进入分镜')?.attrs).toContain('disabled=""');
    expect(runningButtons.find((button) => button.label === '提炼卖点')?.attrs).toContain('disabled=""');
    expect(runningButtons.find((button) => button.label === '停止识别')?.attrs).not.toContain('disabled=""');
    click(running.tree.props.right, '停止识别');
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('requests OCR input and persists model selection from the visible controls', () => {
    const onRequestImages = vi.fn();
    const onChange = vi.fn();
    const { tree } = view(emptySalesCollection(), { onRequestImages, onChange });
    click(tree.props.right, '添加详情图');
    expect(onRequestImages).toHaveBeenCalledOnce();
    const picker = findElement(tree.props.right, (element) => element.type === ConfiguredModelPicker);
    expect(picker?.props.isUp).toBe(true);
    expect(picker?.props.ariaLabel).toBe('卖点提炼模型');
    (picker?.props.onChange as (value: string) => void)('new-model');
    expect(onChange).toHaveBeenCalledWith({ summaryModel: 'new-model' });
    const onAddOCRImages = vi.fn();
    const fallback = view({ ...recognized, ocrImageUrls: [] }, { onRequestImages: undefined, onAddOCRImages });
    click(fallback.tree.props.right, '添加详情图');
    expect(onAddOCRImages).toHaveBeenCalledWith(['/text']);
  });
});
