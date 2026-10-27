import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SalesImageRef, VideoSalesScript } from '@shared/domain/sales';
import { SalesResultPreview } from './SalesResultPreview';
import { SalesResultPublishing, SalesResultActions } from './SalesResultPublishing';
import { SalesResultSection } from './SalesResultSection';
import { SalesResultSidebar } from './SalesResultSidebar';
import { SalesStructuredPrompt } from './SalesPromptEditor';

vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useEffect: () => {},
  useState: (initial: unknown) => [initial, vi.fn()],
}));
const images: SalesImageRef[] = [{ index: 0, role: 'main', url: '/front.png' }, { index: 2, role: 'detail', url: '/back.png' }, { index: 3, role: 'detail', url: '/unused.png' }];
const script: VideoSalesScript = {
  id: 'result', title: '商品视频', deliveryMode: 'single', totalDuration: 15,
  shots: [0, 2, 0].map((imageIndex, index) => ({ shotId: index + 1, type: 'hook', duration: 5, imageIndex, description: '商品展示', voiceover: `完整台词第${index + 1}段，第一行保留全部细节。\n第二行也完整展示，不截断。`, camera: '中景', visualSource: 'product_image', transition: 'direct_concat' })),
  assets: [{ id: 'person', kind: 'person', label: '出镜讲解者（东亚成年男性约26岁）', prompt: '人物', required: true, status: 'done', url: '/person.png' }, { id: 'scene', kind: 'scene', label: '室内场景', prompt: '场景', required: true, status: 'done', url: '/scene.png' }],
  seo: { title: '日常穿搭', hashtags: ['卫衣穿搭', '#日常穿搭'], description: '正文第一段。\n正文第二段。', coverText: '一套出门', interactionGuide: '你会怎么搭配？' },
  fullPrompt: '图片1 商品正面，图片2 商品背面。', renderStatus: 'generating', renderTaskId: 'receipt', renderSubmissionKey: 'submission-key',
};
function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap((child) => isValidElement<Record<string, unknown>>(child) ? [child, ...nodes(child.props.children as ReactNode)] : []);
}
function props(patch: Partial<Parameters<typeof SalesResultSection>[0]> = {}) {
  return { script, aspectRatio: '9:16', resultUrl: null, renderPhase: null, isRendering: false, onStop: vi.fn(), onQuery: vi.fn(), singleDelivery: true, productImages: images, ...patch };
}
afterEach(() => vi.unstubAllGlobals());

describe('sales result workspace', () => {
  it('concentrates busy state and stop in the stage and retains the stop handler', () => {
    const onStop = vi.fn();
    const view = SalesResultPreview({ resultUrl: '/previous.mp4', aspectRatio: '9:16', duration: 15, isRendering: true, status: '正在提交视频任务', onStop });
    const html = renderToStaticMarkup(view);
    expect(html.match(/正在生成视频…/g)).toHaveLength(1);
    expect(html).toContain('已等待 0 秒');
    expect(html).not.toContain('<video');
    expect(html).not.toContain('正在提交视频任务');
    const stop = nodes(view).find((node) => node.type === 'button')!;
    (stop.props.onClick as () => void)();
    expect(onStop).toHaveBeenCalledOnce();
  });
  it('switches the stage to a controllable inline player after completion', () => {
    const html = renderToStaticMarkup(createElement(SalesResultPreview, { resultUrl: '/complete.mp4', aspectRatio: '16:9', duration: 30, isRendering: false, status: '成片已生成', onStop: vi.fn() }));
    expect(html).toContain('src="/complete.mp4"');
    expect(html).toContain('controls=""');
    expect(html).toContain('playsInline=""');
    expect(html).not.toContain('停止继续提交');
  });
  it('hides a previous stop error during resumed polling and keeps it when idle', () => {
    const input = props({ script: { ...script, renderError: '上次已停止等待' }, isRendering: true });
    expect(renderToStaticMarkup(createElement(SalesResultSection, input))).not.toContain('上次已停止等待');
    expect(renderToStaticMarkup(createElement(SalesResultSection, { ...input, isRendering: false }))).toContain('上次已停止等待');
  });
  it('merges referenced materials once and displays full multiline dialogue', () => {
    const html = renderToStaticMarkup(createElement(SalesResultSidebar, { script, productImages: images }));
    expect(html.match(/aria-label="使用素材"/g)).toHaveLength(1);
    expect(html).not.toContain('生成素材');
    expect(html).not.toContain('整体使用素材');
    expect(html).not.toContain('/unused.png');
    expect(html.match(/<li\b/g)).toHaveLength(7); // Three timeline segments and four materials.
    for (const shot of script.shots) expect(html).toContain(shot.voiceover);
    expect(html).toContain('title="图片3 · 待确认"');
    expect(html).toContain('sales-result-timeline');
    expect(html).not.toContain('target="_blank"');
    expect(html.match(/aria-haspopup="dialog"/g)).toHaveLength(4);
  });
  it('keeps unfinished material slots and explains a missing reference', () => {
    const html = renderToStaticMarkup(createElement(SalesResultSidebar, { script: { ...script, assets: [{ ...script.assets![0], url: undefined }] }, productImages: images }));
    expect(html).toContain('尚未生成');
    expect(html).toContain('出镜讲解者');
    expect(html).not.toContain('/unused.png');
  });
  it.each(['title', 'full', 'cover', 'interaction', 'prompt'] as const)('copies the correct %s publication content', async (kind) => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const view = SalesResultPublishing({ script, productImages: images });
    const labels = { title: '复制标题', full: '复制全文', cover: '复制封面文案', interaction: '复制评论区引导', prompt: '复制提示词' };
    const button = nodes(view).find((node) => node.type === 'button' && node.props['aria-label'] === labels[kind])!;
    (button.props.onClick as () => void)();
    await Promise.resolve();
    const seo = script.seo;
    const expected = { title: seo.title, cover: seo.coverText, interaction: seo.interactionGuide, prompt: script.fullPrompt, full: [seo.title, '#卫衣穿搭 #日常穿搭', seo.description, `封面文案：${seo.coverText}`, `评论区引导：${seo.interactionGuide}`].join('\n\n') };
    expect(writeText).toHaveBeenCalledWith(expected[kind]);
  });
  it('keeps the exact original prompt in the expanded right card', () => {
    const view = SalesResultPublishing({ script, productImages: images });
    const html = renderToStaticMarkup(view);
    expect(html).toContain('完整视频提示词');
    expect(html).toContain('成片发布文案');
    expect(html).toContain('封面文案');
    expect(html).toContain('评论区引导');
    const prompt = nodes(view).find((node) => node.type === SalesStructuredPrompt)!;
    expect(prompt.props.prompt).toBe(script.fullPrompt);
    expect(html).not.toContain('纯文本');
  });
  it('keeps receipts and original-task query available without a result Dock', () => {
    const onQuery = vi.fn();
    const view = SalesResultSection(props({ onQuery, sidebar: '商品摘要' }));
    const html = renderToStaticMarkup(view);
    expect(html).toContain('has-storyboard');
    expect(html).toContain('aria-label="商品信息与分镜"');
    expect(html).toContain('aria-label="成片发布与任务"');
    expect(html).toContain('提交标识');
    expect(html).toContain('上游任务 ID');
    expect(html).not.toContain('<footer');
    const publishing = nodes(view).find((node) => node.type === SalesResultPublishing)!;
    const query = nodes(publishing.props.actions as ReactNode).find((node) => node.type === 'button')!;
    (query.props.onClick as () => void)();
    expect(onQuery).toHaveBeenCalledOnce();
  });
  it('retains unknown-submission binding and safe retry in the publishing panel', () => {
    const html = renderToStaticMarkup(createElement(SalesResultSection, props({ script: { ...script, renderStatus: 'uncertain', renderTaskId: undefined }, onBindTask: vi.fn(), onPrepareRetry: vi.fn() })));
    expect(html).toContain('绑定并查询');
    expect(html).toContain('已核实未提交，准备新草稿');
    expect(html).toContain('submission-key');
  });
  it('preserves the previous result and download when a later generation fails', () => {
    const html = renderToStaticMarkup(createElement(SalesResultSection, props({ script: { ...script, renderStatus: 'failed', renderError: '渠道拒绝' }, resultUrl: '/previous.mp4' })));
    expect(html).toContain('仍保留之前的成片');
    expect(html).toContain('href="/previous.mp4"');
    expect(html.match(/渠道拒绝/g)).toHaveLength(1);
  });
  it('retains supplied action callbacks and original download URL', () => {
    const onClick = vi.fn();
    const view = SalesResultActions({ primary: { label: '继续查询原任务', onClick }, busy: false, resultUrl: null, title: script.title });
    (nodes(view).find((node) => node.type === 'button')!.props.onClick as () => void)();
    expect(onClick).toHaveBeenCalledOnce();
    const html = renderToStaticMarkup(createElement(SalesResultActions, { primary: { label: '下载完整视频', href: '/complete.mp4', download: '视频.mp4' }, busy: false, resultUrl: '/complete.mp4', title: script.title }));
    expect(html).toContain('href="/complete.mp4"');
    expect(html).toContain('download="视频.mp4"');
  });
});
