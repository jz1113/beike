import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SalesColorSelection, SalesCreativeAsset, SalesImageRef, VideoSalesScript } from '@shared/domain/video-sales';
import { defaultSalesStudioState } from '../model/salesStudioDraft';
import { SalesActionBar } from './SalesActionBar';
import { SalesAssetsSection } from './SalesAssetsSection';
import { SalesColorGallery } from './SalesColorGallery';
import { SalesPlanSection } from './SalesPlanSection';
import { SalesStudioHeader } from './SalesStudioHeader';
import { SalesVideoSection } from './SalesVideoSection';
import { SalesCreationRule } from './SalesCreationRule';
import { SalesEmptyGuide } from './SalesEmptyGuide';
import { SalesProductFields } from './SalesProductFields';
import { SalesPromptDetails } from './SalesPromptDetails';
import { SalesResultSection } from './SalesResultSection';

const hooks = vi.hoisted(() => ({ index: 0, values: [] as unknown[] }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useId: () => 'sales-ui-test',
  useState: (initial: unknown) => {
    const index = hooks.index++;
    return [index in hooks.values ? hooks.values[index] : initial, vi.fn()];
  },
}));
vi.mock('@client/shared/prompt-bar/hooks/usePromptBarWorkflowModels', () => ({ usePreferenceModels: () => ({ ready: false, imageModels: [], videoModels: [], multimodalModels: [] }), matchesStoredModel: () => false }));

const images: SalesImageRef[] = [{ index: 0, role: 'sku', url: '/black.png' }, { index: 1, role: 'sku', url: '/red.png' }, { index: 2, role: 'main', url: '/unknown.png' }];
const metadata = { version: 1 as const, variants: [{ id: 'black', label: '黑色 / M', color: '黑色', skuIds: ['b'], imageUrls: ['/black.png'] }, { id: 'red', label: '红色 / M', color: '红色', skuIds: ['r'], imageUrls: ['/red.png'] }] };
const selection: SalesColorSelection = { variantId: 'black', colorLabel: '黑色', confirmedImageUrls: [], excludedImageUrls: [] };
const script: VideoSalesScript = { id: 's', title: '商品口播', totalDuration: 15, deliveryMode: 'single', assets: [], seo: { title: '', hashtags: [], coverText: '', interactionGuide: '', description: '' }, shots: [{ shotId: 1, type: 'hook', duration: 3, description: '展示商品', voiceover: '看这个商品', camera: '近景', visualSource: 'product_image', transition: 'direct_concat' }, { shotId: 2, type: 'demo', duration: 12, description: '使用展示', voiceover: '看细节', camera: '特写', visualSource: 'product_image', transition: 'direct_concat' }] };

function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap((child) => isValidElement<Record<string, unknown>>(child) ? [child, ...nodes(child.props.children as ReactNode)] : []);
}
function click(node: ReactNode, text: string) {
  const button = nodes(node).find((item) => item.type === 'button' && renderToStaticMarkup(item).includes(text));
  expect(button).toBeDefined();
  (button!.props.onClick as () => void)();
}
function gallery(override: Partial<Parameters<typeof SalesColorGallery>[0]> = {}) {
  return SalesColorGallery({ images, metadata, selection, disabled: false, onChange: vi.fn(), onImageError: vi.fn(), ...override });
}

beforeEach(() => { hooks.index = 0; hooks.values = []; });

describe('sales color gallery', () => {
  it('separates evidenced current color, other colors and unconfirmed images', () => {
    const html = renderToStaticMarkup(gallery());
    expect(html).toContain('当前颜色');
    expect(html).toContain('其他颜色');
    expect(html).toContain('待确认');
    expect(html).toContain('查看商品图 1 大图');
    expect(html).not.toContain('查看商品图 2 大图');
    expect(html).not.toContain('查看商品图 3 大图');
    expect(html).not.toContain('删除');
    expect(html).toContain('object-contain');
  });
  it('selects a variant with cleared explicit image confirmations', () => {
    const onChange = vi.fn();
    click(gallery({ selection: { ...selection, confirmedImageUrls: ['/unknown.png'] }, onChange }), '红色 / M');
    expect(onChange).toHaveBeenCalledWith({ ...selection, variantId: 'red', colorLabel: '红色', confirmedImageUrls: [] });
  });
  it('requires explicit confirmation for an unassigned image and retains the original catalog', () => {
    hooks.values = ['', 'pending'];
    const onChange = vi.fn();
    click(gallery({ onChange }), '确认此颜色');
    expect(onChange).toHaveBeenCalledWith({ ...selection, confirmedImageUrls: ['/unknown.png'] });
    expect(images).toHaveLength(3);
  });
  it('excludes and restores a picture without deleting it', () => {
    const onChange = vi.fn();
    click(gallery({ onChange }), '排除本次');
    expect(onChange).toHaveBeenCalledWith({ ...selection, excludedImageUrls: ['/black.png'] });
    hooks.index = 0;
    click(gallery({ selection: { ...selection, excludedImageUrls: ['/black.png'] }, onChange }), '恢复本次使用');
    expect(onChange).toHaveBeenLastCalledWith(selection);
    expect(images).toHaveLength(3);
  });
  it('shows the full product image in a contained preview', () => {
    hooks.values = ['', 'current', images[0]];
    const html = renderToStaticMarkup(gallery());
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('完整商品图 1');
    expect(html).toContain('flex-1 object-contain');
  });
});

describe('sales workflow stages', () => {
  it('shows only the spoken timeline in the script stage', () => {
    const html = renderToStaticMarkup(createElement(SalesPlanSection, { analysis: null, script: { ...script, fullPrompt: '不应显示在脚本区', personImagePrompt: '旧人物绘图' }, disabled: false, onEditShot: vi.fn() }));
    expect(html).toContain('0');
    expect(html).toContain('15');
    expect(html).toContain('口播与画面时间轴');
    expect(html).not.toContain('不应显示在脚本区');
    expect(html).not.toContain('旧人物绘图');
    expect(html).not.toContain('成片保留');
  });
  it('shows asset status, validation, errors and explicit single-item retry', () => {
    const assets: SalesCreativeAsset[] = [{ id: 'p', kind: 'person', label: '生活化人物', prompt: '人物外观', required: true, status: 'failed', validation: 'conflict', validationReason: '服装颜色不一致', error: '生成失败' }];
    const html = renderToStaticMarkup(createElement(SalesAssetsSection, { script: { ...script, assets }, imageModel: 'image', disabled: false, onModel: vi.fn(), onEditPrompt: vi.fn(), onGenerate: vi.fn() }));
    expect(html).toContain('内容冲突');
    expect(html).toContain('服装颜色不一致');
    expect(html).toContain('生成失败');
    expect(html).toContain('重试此素材（可能计费）');
    expect(html).not.toContain('type="file"');
  });
  it('keeps video configuration gated until assets are ready and accepts a missing full prompt', () => {
    const html = renderToStaticMarkup(createElement(SalesVideoSection, { state: defaultSalesStudioState, script, modelId: '', disabled: false, assetsReady: false, videoError: null, onChange: vi.fn(), onEditPrompt: vi.fn() }));
    expect(html).toContain('视频模型和参数届时开放');
    expect(html).toContain('脚本阶段无需完整视频提示词');
    expect(html).not.toContain('aria-haspopup="listbox"');
    expect(html).not.toContain('<textarea');
  });
  it('keeps finalization and paid video submission as separate user actions', () => {
    const finalize = vi.fn();
    const render = vi.fn();
    const action = SalesActionBar({ primary: { label: '定稿视频提示词', onClick: finalize }, secondary: { label: '确认生成整段视频', onClick: render } });
    click(action, '定稿视频提示词');
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
    click(action, '确认生成整段视频');
    expect(render).toHaveBeenCalledTimes(1);
    expect(finalize).toHaveBeenCalledTimes(1);
  });
  it('renders the same five stages for every category', () => {
    const html = renderToStaticMarkup(createElement(SalesStudioHeader, { onBack: vi.fn(), onReset: vi.fn(), resetDisabled: false, resetTitle: '', steps: [{ id: 'product', label: '商品确认', state: 'current' }, { id: 'plan', label: '口播脚本', state: 'pending' }, { id: 'assets', label: '素材图片', state: 'pending' }, { id: 'video', label: '视频定稿', state: 'pending' }, { id: 'result', label: '生成结果', state: 'pending' }], onStep: vi.fn(), onOpenRules: vi.fn() }));
    for (const label of ['商品确认', '口播脚本', '素材图片', '视频定稿', '生成结果']) expect(html).toContain(label);
    expect(html).toContain('aria-current="step"');
    expect(html).not.toContain('带货分区');
    expect(html).not.toContain('role="tablist"');
  });
  it('keeps the skill outside optional details and marks supplemental facts as optional', () => {
    const html = renderToStaticMarkup(createElement(SalesProductFields, { productName: '', brand: '', priceLabel: '', category: 'other', sellingPoints: '', disabled: false, onOpenRules: vi.fn(), onChange: vi.fn() }));
    expect(html.indexOf('创作技能')).toBeLessThan(html.indexOf('<details'));
    expect(html).toContain('通用制作流程');
    expect(html).toContain('服饰专属规则');
    expect(html).toContain('value="generic"');
    for (const label of ['商品品类', '美妆护肤', '食品零食', '家居日用', '服饰鞋包', '数码3C', '通用百货']) expect(html).not.toContain(label);
    expect(html).toContain('补充品牌与价格 · 可选');
    expect(html).not.toContain('品牌未返回');
  });
  it('locks the creation rule on the confirm guide and opens the existing rules', () => {
    const onOpenRules = vi.fn();
    const fashion = renderToStaticMarkup(createElement(SalesEmptyGuide, { kind: 'plan', category: 'fashion', onOpenRules }));
    const generic = renderToStaticMarkup(createElement(SalesProductFields, { productName: '纸巾', brand: '', priceLabel: '', category: 'home', sellingPoints: '', disabled: false, onOpenRules, onChange: vi.fn() }));
    expect(fashion).toContain('服饰专属规则');
    expect(fashion).toContain('带货规则');
    expect(generic).toContain('全品类通用流程');
    expect(generic).not.toContain('开箱换装');
    const rule = nodes(SalesEmptyGuide({ kind: 'plan', category: 'fashion', onOpenRules })).find((item) => item.type === SalesCreationRule);
    click(SalesCreationRule(rule!.props as { category: 'fashion'; onOpenRules: () => void }), '带货规则');
    expect(onOpenRules).toHaveBeenCalledTimes(1);
  });
  it('keeps long prompt editing collapsed without losing the complete value', () => {
    const html = renderToStaticMarkup(createElement(SalesPromptDetails, { title: '完整提示词', value: '真实图片与一条整段视频', disabled: false, onChange: vi.fn(), copyable: true }));
    expect(html).toContain('复制完整提示词');
    expect(html).toContain('真实图片与一条整段视频');
    expect(html.match(/<details[^>]*>/)?.[0]).not.toContain('open=');
  });
  it('shows submission-specific blockers beside the final prompt', () => {
    const html = renderToStaticMarkup(createElement(SalesVideoSection, { state: defaultSalesStudioState, script: { ...script, fullPrompt: '整段提示词' }, modelId: '', disabled: false, assetsReady: true, finalized: true, videoError: null, submitError: '上次视频提交结果未确认，请先核对生成记录', onChange: vi.fn(), onEditPrompt: vi.fn() }));
    expect(html).toContain('上次视频提交结果未确认');
  });
  it('keeps stopped or uncertain task recovery separate from duplicate controls', () => {
    const html = renderToStaticMarkup(createElement(SalesResultSection, { script: { ...script, renderTaskId: 'receipt', renderStatus: 'uncertain' }, aspectRatio: '9:16', resultUrl: null, renderPhase: null, isRendering: false, onRetryShot: vi.fn(), onStop: vi.fn(), onCompose: vi.fn(), singleDelivery: true, actionsInFooter: true }));
    expect(html).toContain('提交结果待确认');
    expect(html).toContain('不会自动重投');
    expect(html).not.toContain('继续查询原任务（不重新提交）');
  });
  it('keeps paid-task warnings visible alongside progress in the single footer', () => {
    const html = renderToStaticMarkup(createElement(SalesActionBar, { primary: { label: '正在生成视频', disabled: true }, secondary: { label: '停止继续提交', onClick: vi.fn() }, busy: true, progress: '正在查询任务', note: '已提交任务仍可能计费' }));
    expect(html).toContain('正在查询任务');
    expect(html).toContain('已提交任务仍可能计费');
    expect(html).toContain('aria-describedby=');
  });
});
