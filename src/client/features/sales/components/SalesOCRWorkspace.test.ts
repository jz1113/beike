import { isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptySalesCollection } from '../model/salesCollectionDraft';
import { salesSummarySource } from '../model/salesSummary';
import { SalesOCRWorkspace } from './SalesOCRWorkspace';
import { SalesOCRQueueStrip, SalesOCRResults } from './SalesOCRResults';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[] }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useEffect: () => {},
  useRef: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useState: <T>(initial: T | (() => T)) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
    return [hooks.slots[index], (next: T | ((previous: T) => T)) => {
      hooks.slots[index] = typeof next === 'function' ? (next as (previous: T) => T)(hooks.slots[index] as T) : next;
    }];
  },
}));
vi.mock('../hooks/useSalesSummaryModels', () => ({ useSalesSummaryModels: () => ({ model: 'vision', options: [{ id: 'vision', name: '测试模型' }] }) }));

type Props = ComponentProps<typeof SalesOCRWorkspace>;
function props(): Props {
  return {
    state: {
      ...emptySalesCollection(),
      imageCatalog: [{ index: 0, url: '/detail.png', role: 'detail' }],
      ocrImageUrls: ['/detail.png'],
      ocrImages: [{ imageUrl: '/detail.png', editedText: '用户校正后的棉质面料', result: { engine: 'test', width: 500, height: 1000, text: 'OCR原始识别', lines: [], cached: false } }],
    },
    disabled: false, imageDragging: false, progress: null, report: null,
    onChange: vi.fn(), onRecognize: vi.fn(), onCancel: vi.fn(), onRetryFailed: vi.fn(),
    onAddOCRImages: vi.fn(), onDropFinished: vi.fn(),
    summaryActions: { pending: false, error: null, onRun: vi.fn(), onCancel: vi.fn(), onScrollToProduction: vi.fn() },
  };
}
function withSummary(value: Props, generatedAt = '2026-11-01T12:00:00.000Z'): Props {
  return { ...value, state: { ...value.state, productSummary: {
    generatedAt, inputKey: salesSummarySource(value.state).inputKey, model: 'vision', skillVersion: 'test',
    result: { summary: '最终概括', points: [{ feature: '棉质面料', benefit: '穿着舒适', expression: '柔软亲肤', sources: ['ocr-1'] }], copy: '最终推荐文案', copyPointIndexes: [1], conflicts: [], questions: [], cautions: [] },
  } } };
}
function render(value: Props) {
  hooks.index = 0;
  const tree = SalesOCRWorkspace(value);
  return { tree, html: renderToStaticMarkup(tree) };
}
function findButton(node: ReactNode, label: string): ReactElement<{ onClick: () => void }> | undefined {
  if (Array.isArray(node)) return node.map((child) => findButton(child, label)).find(Boolean);
  if (!isValidElement<{ children?: ReactNode; 'aria-label'?: string }>(node)) return undefined;
  if (node.type === 'button' && (node.props.children === label || node.props['aria-label'] === label)) return node as ReactElement<{ onClick: () => void }>;
  return findButton(node.props.children, label);
}
function button(html: string, label: string) {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
    .find(([, , body]) => body.replace(/<[^>]*>/g, '') === label)?.[1] ?? '';
}
beforeEach(() => { hooks.index = 0; hooks.slots = []; });

describe('single product selling point workspace', () => {
  it('keeps the compact guide and manual input above the visible model and OCR controls', () => {
    const value = props();
    value.state = { ...value.state, ocrImageUrls: [], ocrImages: [] };
    const { html } = render(value);
    expect(html.match(/<h2>商品卖点<\/h2>/g)).toHaveLength(1);
    expect(html).toContain('默认添加前 1 张详情图，可调整');
    expect(html).toContain('从商品图片中添加，或将图片拖入此处。');
    expect(html).toContain('aria-label="补充商品文字"');
    expect(html).toContain('跳过，进入分镜');
    expect(button(html, '跳过，进入分镜')).toContain('sales-storyboard-skip');
    expect(html.indexOf('跳过，进入分镜')).toBeLessThan(html.indexOf('aria-label="补充商品文字"'));
    expect(html).toContain('aria-label="卖点提炼模型"');
    expect(html).not.toContain('生成设置');
    expect(button(html, '添加详情图')).not.toContain('sales-collect-primary');
    expect(button(html, '提炼卖点')).toContain('disabled=""');
    expect(html).toContain('>待识别</span>');
    expect(html.match(/<button[^>]*class="[^"]*sales-collect-primary/g)).toHaveLength(1);
    expect(html).not.toContain('张参考图');
  });

  it('uses the same area for editable OCR and makes extraction the sole primary action', () => {
    const { html } = render(props());
    expect(html).toContain('用户校正后的棉质面料');
    expect(html).toContain('aria-label="识别文字编辑"');
    expect(html).not.toContain('aria-label="最终卖点编辑"');
    expect(html).toContain('>待提炼</span>');
    expect(button(html, '提炼卖点')).toContain('sales-collect-primary');
    expect(button(html, '提炼卖点')).not.toContain('disabled=""');
    expect(html.match(/<button[^>]*class="[^"]*sales-collect-primary/g)).toHaveLength(1);
  });

  it('keeps the final result editable with unchanged original and revised text in a collapsed disclosure', () => {
    const value = withSummary(props());
    const { html } = render(value);
    expect(html).toContain('aria-label="最终卖点编辑"');
    expect(html).toContain('>已提炼</span>');
    expect(html).toMatch(/<details class="sales-original-disclosure">/);
    expect(html).toContain('查看识别原文');
    expect(html).toContain('用户校正后的棉质面料');
    expect(html).toContain('OCR原始识别');
    expect(html).toContain('查看未修订识别文字');
    expect(button(html, '下一步：分镜脚本')).toContain('sales-collect-primary');
    expect(button(html, '重新提炼')).not.toContain('sales-collect-primary');
    expect(value.state.ocrImages[0].editedText).toBe('用户校正后的棉质面料');
    expect(value.state.ocrImages[0].result?.text).toBe('OCR原始识别');
  });

  it('keeps both the previous final result and OCR edits during re-extraction and after failure', () => {
    const value = withSummary(props());
    const pending = { ...value, summaryActions: { ...value.summaryActions!, pending: true } };
    const loading = render(pending).html;
    expect(loading).toContain('最终推荐文案');
    expect(loading).toContain('最终概括');
    expect(loading).toContain('用户校正后的棉质面料');
    expect(button(loading, '提炼中')).toContain('disabled=""');
    const failed = { ...value, summaryActions: { ...value.summaryActions!, error: '余额不足' } };
    const html = render(failed).html;
    expect(html).toContain('最终推荐文案');
    expect(html).toContain('余额不足');
    expect(button(html, '重新提炼')).not.toContain('disabled=""');
    const next = render(withSummary(value, '2026-11-01T12:01:00.000Z')).html;
    expect(next).toMatch(/<details class="sales-original-disclosure">/);
  });

  it('allows preserved edited OCR text to be refined after a failed recognition retry', () => {
    const value = props();
    value.state.ocrImages[0].error = '图片识别失败';
    value.report = { status: 'completed', succeeded: 0, failed: 1, remaining: 1 };
    const { html } = render(value);
    expect(html).toContain('用户校正后的棉质面料');
    expect(html).toContain('图片识别失败');
    expect(button(html, '提炼卖点')).toContain('sales-collect-primary');
    expect(button(html, '提炼卖点')).not.toContain('disabled=""');
  });

  it('reuses saved OCR edits after clearing and restoring the recognition queue', () => {
    const value = props();
    value.state.ocrImageUrls = [];
    const { html } = render(value);
    expect(html).toContain('已保存的历史原文');
    expect(html).toContain('用户校正后的棉质面料');
    const results = SalesOCRResults({ ...value, onAddOCRImages: (urls) => { value.state.ocrImageUrls = urls; } });
    findButton(results, '使用这些原文提炼卖点')!.props.onClick();
    expect(value.state.ocrImageUrls).toEqual(['/detail.png']);
    expect(button(render(value).html, '提炼卖点')).not.toContain('disabled=""');
    expect(value.onRecognize).not.toHaveBeenCalled();
    expect(value.state.ocrImages[0].editedText).toBe('用户校正后的棉质面料');
  });

  it('allows pasted product text to advance without an OCR image', () => {
    const value = props();
    value.state = { ...emptySalesCollection(), sellingPoints: '棉质面料，柔软亲肤' };
    const { html } = render(value);
    expect(html).toContain('棉质面料，柔软亲肤');
    expect(html).toContain('>待提炼</span>');
    expect(button(html, '提炼卖点')).toContain('sales-collect-primary');
    expect(button(html, '提炼卖点')).not.toContain('disabled=""');
    expect(html).not.toContain('class="sales-ocr-empty"');
    expect(html).toContain('添加详情图');
    expect(html).toContain('maxLength="20000"');
  });

  it('recognizes newly added pictures even when an existing summary keeps storyboard as the primary action', () => {
    const value = withSummary(props());
    value.state.imageCatalog.push({ index: 1, url: '/new-detail.png', role: 'detail' });
    value.state.ocrImageUrls.push('/new-detail.png');
    const queue = SalesOCRQueueStrip(value);
    findButton(queue, '识别图片 #2')!.props.onClick();
    expect(value.onRecognize).toHaveBeenCalledWith('/new-detail.png', false);
    expect(value.onChange).not.toHaveBeenCalled();
    const { html } = render(value);
    expect(button(html, '下一步：分镜脚本')).toContain('sales-collect-primary');
    expect(html).toContain('aria-label="识别图片 #2"');
    expect(html.match(/<button[^>]*class="[^"]*sales-collect-primary/g)).toHaveLength(1);
  });

  it('keeps recognition and retries accessible alongside manually entered text', () => {
    const value = props();
    value.state.sellingPoints = '手动补充商品文字';
    value.state.ocrImages = [];
    const queue = SalesOCRQueueStrip(value);
    findButton(queue, '识别图片 #1')!.props.onClick();
    expect(value.onRecognize).toHaveBeenCalledWith('/detail.png', false);
    expect(button(render(value).html, 'OCR 识别')).not.toContain('disabled=""');
    expect(button(render(value).html, '提炼卖点')).toContain('sales-collect-primary');
    value.state.ocrImages = [{ imageUrl: '/detail.png', editedText: '', error: '识别失败' }];
    expect(button(render(value).html, '重试识别')).not.toContain('disabled=""');
    findButton(SalesOCRQueueStrip(value), '重试识别图片 #1')!.props.onClick();
    expect(value.onRecognize).toHaveBeenLastCalledWith('/detail.png', true);
  });

  it('keeps adding OCR inputs separate from selecting video references', () => {
    const value = props();
    value.state.ocrImageUrls = [];
    const root = render(value).tree;
    const children = root.props.children as ReactNode[];
    const bottom = children.find((child) => isValidElement<{ onRequestImages?: () => void }>(child) && typeof child.props.onRequestImages === 'function');
    if (!isValidElement<{ onRequestImages: () => void }>(bottom)) throw new Error('missing image request');
    bottom.props.onRequestImages();
    expect(value.onAddOCRImages).toHaveBeenCalledWith(['/detail.png']);
    expect(value.onChange).not.toHaveBeenCalled();
    expect(value.state.colorSelection.confirmedImageUrls).toEqual([]);
  });
});
