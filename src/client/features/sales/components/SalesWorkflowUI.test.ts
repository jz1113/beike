import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SalesColorSelection, SalesCreativeAsset, SalesImageRef, VideoSalesScript } from '@shared/domain/sales';
import { eligibleSalesImages } from '@shared/domain/sales/workflow';
import { defaultSalesStudioState } from '../model/salesStudioDraft';
import { SalesActionBar, SalesStudioHeader } from './salesChrome';
import { SalesPlanSection, SalesPlanningSettings, SalesPromptDetails } from './salesPlanning';
import { SalesEmptyGuide, SalesProductFields } from './salesProductSetup';
import { SalesAssetsSection } from './SalesAssetsSection';
import { SalesColorGallery } from './SalesColorGallery';
import { SalesResultSection } from './SalesResultSection';
import { SalesVideoSection } from './SalesVideoSection';
import { SalesVideoParams } from './SalesVideoParams';

const hooks = vi.hoisted(() => ({ index: 0, values: [] as unknown[] }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useId: () => 'sales-ui-test',
  useEffect: () => {},
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

describe('sales image gallery', () => {
  it('shows all images for direct selection without a color field', () => {
    const html = renderToStaticMarkup(gallery());
    for (const label of ['全部图片', '已选', '未选', '查看商品图 1 大图', '查看商品图 2 大图', '查看商品图 3 大图']) expect(html).toContain(label);
    for (const label of ['本次商品颜色', '确认此颜色', '搜索商品颜色']) expect(html).not.toContain(label);
    expect(nodes(gallery()).some((item) => item.type === 'button' && renderToStaticMarkup(item).includes('删除'))).toBe(false);
    expect(html).toContain('object-contain');
  });
  it('selects an image without typing a color and makes it eligible for generation', () => {
    const onChange = vi.fn();
    const empty = { colorLabel: '', confirmedImageUrls: [], excludedImageUrls: [] };
    const view = gallery({ selection: empty, metadata: undefined, onChange });
    const button = nodes(view).find((item) => item.props['aria-label'] === '选择商品图 1')!;
    expect(button.props.disabled).toBeFalsy();
    click(view, '选择此图');
    const next = onChange.mock.calls[0][0] as SalesColorSelection;
    expect(next).toEqual({ ...empty, variantId: undefined, confirmedImageUrls: ['/black.png'] });
    expect(eligibleSalesImages(images, next)).toEqual([images[0]]);
    expect(images).toHaveLength(3);
  });
  it('preserves selected legacy images but clears the old color constraint on direct selection', () => {
    const onChange = vi.fn();
    click(gallery({ onChange }), '选择此图');
    expect(onChange).toHaveBeenCalledWith({ colorLabel: '', variantId: undefined, confirmedImageUrls: ['/black.png', '/red.png'], excludedImageUrls: [] });
  });
  it('deselects and restores a mapped picture without deleting it', () => {
    const onChange = vi.fn();
    click(gallery({ onChange }), '已选 · 取消选择');
    const next = onChange.mock.calls[0][0] as SalesColorSelection;
    expect(eligibleSalesImages(images, next, metadata)).toEqual([]);
    hooks.index = 0;
    click(gallery({ selection: next, onChange }), '选择此图');
    expect(onChange).toHaveBeenLastCalledWith({ colorLabel: '', variantId: undefined, confirmedImageUrls: ['/black.png'], excludedImageUrls: [] });
    expect(images).toHaveLength(3);
  });
  it('filters the selected and unselected images', () => {
    hooks.values = ['selected'];
    expect(renderToStaticMarkup(gallery())).not.toContain('查看商品图 2 大图');
    hooks.index = 0;
    hooks.values = ['unselected'];
    const html = renderToStaticMarkup(gallery());
    expect(html).not.toContain('查看商品图 1 大图');
    expect(html).toContain('查看商品图 2 大图');
    expect(html).toContain('查看商品图 3 大图');
  });
  it('keeps unavailable images and busy controls disabled', () => {
    for (const override of [{ disabled: true }, { images: [{ ...images[0], unavailable: true }] }]) {
      hooks.index = 0;
      const view = gallery({ selection: { colorLabel: '', confirmedImageUrls: [], excludedImageUrls: [] }, ...override });
      expect(nodes(view).find((item) => item.props['aria-label'] === '选择商品图 1')?.props.disabled).toBe(true);
    }
  });
  it('allows direct selection from the full preview without a color', () => {
    hooks.values = ['all', images[0]];
    const onChange = vi.fn();
    const view = gallery({ selection: { colorLabel: '', confirmedImageUrls: [], excludedImageUrls: [] }, onChange });
    const html = renderToStaticMarkup(view);
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('完整商品图 1');
    expect(html).toContain('flex-1 object-contain');
    expect(nodes(view).find((item) => item.type === 'button' && renderToStaticMarkup(item).includes('选择此图用于生成'))?.props.disabled).toBeFalsy();
    click(view, '选择此图用于生成');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ colorLabel: '', confirmedImageUrls: ['/black.png'] }));
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
  it('lets a rejected detail image retry while its generated reference is still awaiting validation', () => {
    const assets: SalesCreativeAsset[] = [
      { id: 'main', kind: 'keyframe', label: '黑色卫衣正面平铺主图', prompt: '平铺主图', required: true, status: 'done', url: '/main.jpg', validation: 'pending' },
      { id: 'detail', kind: 'keyframe', label: '胸前绣花与罗纹领口细节', prompt: '绣花细节', required: true, status: 'uncertain', validation: 'pending', usesProduct: true, referenceAssetIds: ['main'], validationReason: '图 2 缺失参考图无法读取；参考图预设 SM19' },
    ];
    const view = createElement(SalesAssetsSection, { script: { ...script, shots: [{ ...script.shots[0], imageIndex: 0 }], assets }, imageModel: 'image', disabled: false, onModel: vi.fn(), onEditPrompt: vi.fn(), onGenerate: vi.fn() });
    const html = renderToStaticMarkup(view);
    const retryAt = html.indexOf('重试此素材（可能计费）');
    const retryStart = html.lastIndexOf('<button', retryAt);
    const opening = html.slice(retryStart, html.indexOf('>', retryStart));
    expect(html).toContain('第 2 张参考图「黑色卫衣正面平铺主图」');
    expect(html).toContain('前置图已生成，可直接重试');
    expect(html).not.toContain('请先核对服务商记录');
    expect(html).not.toContain('请先生成并通过校验');
    expect(html).not.toContain('参考图预设 SM19');
    expect(opening).not.toMatch(/\sdisabled[=\s>/]/);
  });
  it('offers validation-only recovery for existing images without requiring an image model', () => {
    const onGenerate = vi.fn();
    const assets: SalesCreativeAsset[] = [{ id: 'front', kind: 'keyframe', label: '正面', prompt: '正面', required: true, usesProduct: true, productImageIndexes: [7], status: 'done', url: '/front.jpg' }];
    const view = SalesAssetsSection({ script: { ...script, assets }, imageModel: '', disabled: false, onModel: vi.fn(), onEditPrompt: vi.fn(), onGenerate });
    click(view, '仅重新校验已有图片');
    expect(onGenerate).toHaveBeenCalledExactlyOnceWith(undefined, false, true);
    const html = renderToStaticMarkup(view);
    expect(html).toContain('商品参考 8');
    expect(html).toContain('w-fit max-w-full');
    const imgClass = html.match(/<img[^>]*class="([^"]*)"/)?.[1] ?? '';
    expect(imgClass.split(/\s+/)).not.toContain('w-full');
  });
  it('keeps legacy reference error numbering aligned with every selected product image', () => {
    const assets: SalesCreativeAsset[] = [
      { id: 'main', kind: 'keyframe', label: '前置静帧', prompt: '商品', required: true, status: 'done', url: '/main.jpg' },
      { id: 'detail', kind: 'keyframe', label: '细节', prompt: '局部', required: true, usesProduct: true, referenceAssetIds: ['main'], status: 'failed', error: '图 3 缺失参考图无法读取' },
    ];
    const html = renderToStaticMarkup(createElement(SalesAssetsSection, { script: { ...script, assets }, productImages: images.slice(0, 2), imageModel: 'image', disabled: false, onModel: vi.fn(), onEditPrompt: vi.fn(), onGenerate: vi.fn() }));
    expect(html).toContain('第 3 张参考图「前置静帧」');
    expect(html).toContain('商品参考 1、商品参考 2');
  });
  it('keeps video configuration gated until assets are ready and accepts a missing full prompt', () => {
    const html = renderToStaticMarkup(createElement(SalesVideoSection, { state: defaultSalesStudioState, script, modelId: '', disabled: false, assetsReady: false, videoError: null, onChange: vi.fn(), onEditPrompt: vi.fn() }));
    expect(html).toContain('定稿模型和视频参数届时开放');
    expect(html).toContain('脚本阶段无需完整视频提示词');
    expect(html).not.toContain('aria-haspopup="listbox"');
    expect(html).not.toContain('<textarea');
  });
  it('keeps finalization and paid video submission as separate user actions', () => {
    const finalize = vi.fn();
    const render = vi.fn();
    const action = SalesActionBar({ primary: { label: '生成视频提示词', onClick: finalize }, secondary: { label: '确认生成整段视频', onClick: render } });
    click(action, '生成视频提示词');
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
  it('keeps the skill at the top of planning settings and marks supplemental facts as optional', () => {
    const fields = renderToStaticMarkup(createElement(SalesProductFields, { productName: '', brand: '', sellingPoints: '', disabled: false, onChange: vi.fn() }));
    const settings = renderToStaticMarkup(createElement(SalesPlanningSettings, { state: defaultSalesStudioState, disabled: false, onOpenRules: vi.fn(), onChange: vi.fn() }));
    expect(fields).not.toContain('创作技能');
    expect(settings.indexOf('创作设置')).toBeLessThan(settings.indexOf('创作技能'));
    expect(settings.indexOf('创作技能')).toBeLessThan(settings.indexOf('多模态分析与口播模型'));
    expect(settings).toContain('同一模型也用于可选图片校验和视频提示词');
    expect(settings).toContain('通用制作流程');
    expect(settings).toContain('服饰专属规则');
    expect(settings).toContain('value="generic"');
    for (const label of ['商品品类', '美妆护肤', '食品零食', '家居日用', '服饰鞋包', '数码3C', '通用百货']) expect(fields).not.toContain(label);
    expect(fields).toContain('品牌');
    expect(fields).not.toContain('补充品牌');
    expect(fields).not.toContain('<details');
    expect(fields).not.toContain('价格');
    expect(fields).not.toContain('品牌未返回');
  });
  it('keeps the rule description in settings without duplicating rule buttons', () => {
    const onOpenRules = vi.fn();
    const guide = renderToStaticMarkup(createElement(SalesEmptyGuide, { kind: 'plan', category: 'fashion', onOpenRules }));
    const settings = renderToStaticMarkup(createElement(SalesPlanningSettings, { state: { ...defaultSalesStudioState, category: 'fashion' }, disabled: false, onOpenRules, onChange: vi.fn() }));
    expect(guide).not.toContain('本次创作规则');
    expect(guide).not.toContain('带货规则');
    expect(settings).toContain('服饰专属规则');
    expect(settings).not.toContain('>带货规则</button>');
  });
  it('keeps long prompt editing collapsed without losing the complete value', () => {
    const html = renderToStaticMarkup(createElement(SalesPromptDetails, { title: '完整提示词', value: '真实图片与一条整段视频', disabled: false, onChange: vi.fn(), copyable: true }));
    expect(html).toContain('复制完整提示词');
    expect(html).toContain('真实图片与一条整段视频');
    expect(html.match(/<details[^>]*>/)?.[0]).not.toContain('open=');
  });
  it('keeps video mode labels from sharing a shrinking row', () => {
    hooks.values = [true];
    const html = renderToStaticMarkup(createElement(SalesVideoParams, { modelId: 'wan3.0', refMode: 'first_frame', aspectRatio: '9:16', resolution: '720P', targetDuration: 15, disabled: false, onChange: vi.fn() }));
    const modes = html.slice(html.indexOf('模式选择'), html.indexOf('画面比例'));
    expect(modes).toContain('flex-wrap');
    expect(modes).toContain('min-w-fit');
    expect(modes).not.toContain('minmax(0, 1fr)');
    for (const label of ['全能参考', '首帧生视频', '首尾帧', '文生视频']) expect(modes).toContain(label);
  });
  it('shows submission-specific blockers beside the final prompt', () => {
    const html = renderToStaticMarkup(createElement(SalesVideoSection, { state: defaultSalesStudioState, script: { ...script, fullPrompt: '整段提示词' }, modelId: '', disabled: false, assetsReady: true, finalized: true, videoError: null, submitError: '上次视频提交结果未确认，请先核对生成记录', onChange: vi.fn(), onEditPrompt: vi.fn() }));
    expect(html).toContain('上次视频提交结果未确认');
    expect(html).toContain('纯文本');
    expect(html).toContain('整段提示词');
    expect(html).toContain('编辑');
    expect(html).not.toContain('图片1 ·');
    expect(html).toContain('定稿提示词模型');
    expect(html).toContain('与口播脚本是同一只多模态模型');
    expect(html.indexOf('定稿提示词模型')).toBeLessThan(html.indexOf('>视频模型<'));
  });
  it('shows the final prompt with the actual reference images in submission order', () => {
    const ready = {
      ...script,
      fullPrompt: '图片1黑色上衣，图片2出镜人物',
      shots: script.shots.map((shot) => ({ ...shot, imageIndex: 0 })),
      assets: [{ id: 'person', kind: 'person' as const, label: '出镜人物', prompt: '人物', required: true, url: '/person.jpg', status: 'done' as const }],
    };
    const html = renderToStaticMarkup(createElement(SalesVideoSection, {
      state: { ...defaultSalesStudioState, imageCatalog: images.slice(0, 1), colorSelection: { colorLabel: '', confirmedImageUrls: ['/black.png'], excludedImageUrls: [] } },
      script: ready, modelId: '', disabled: false, assetsReady: true, finalized: true, videoError: null, onChange: vi.fn(), onEditPrompt: vi.fn(),
    }));
    expect(html).toContain('纯文本');
    expect(html).toContain('图片1黑色上衣，图片2出镜人物');
    expect(html.indexOf('图片1 · 商品参考 1')).toBeLessThan(html.indexOf('图片2 · 出镜人物'));
    expect(html.indexOf('图片2 · 出镜人物')).toBeLessThan(html.indexOf('图片1黑色上衣'));
    expect(html).toContain('src="/black.png"');
    expect(html).toContain('src="/person.jpg"');
  });
  it('keeps stopped or uncertain task recovery separate from duplicate controls', () => {
    const html = renderToStaticMarkup(createElement(SalesResultSection, { script: { ...script, renderTaskId: 'receipt', renderStatus: 'uncertain' }, aspectRatio: '9:16', resultUrl: null, renderPhase: null, isRendering: false, onStop: vi.fn(), onCompose: vi.fn(), singleDelivery: true, actionsInFooter: true }));
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
