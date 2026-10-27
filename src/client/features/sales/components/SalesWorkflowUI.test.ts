import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SalesColorSelection, SalesCreativeAsset, SalesImageRef, VideoSalesScript } from '@shared/domain/sales';
import { eligibleSalesImages } from '@shared/domain/sales/workflow';
import { defaultSalesStudioState } from '../model/salesStudioDraft';
import { SalesActionBar, SalesStudioHeader } from './salesChrome';
import { SalesPlanSection, SalesPlanningSettings, SalesPromptDetails, SalesScriptOutline } from './salesPlanning';
import { SalesEmptyGuide, SalesProductFields } from './salesProductSetup';
import { SalesAssetsSection } from './SalesAssetsSection';
import { SalesColorGallery } from './SalesColorGallery';
import { SalesResultSection } from './SalesResultSection';
import { SalesVideoSection } from './SalesVideoSection';
import { SalesFooterVideoControls } from './SalesFooterVideoControls';
import { SalesPromptReferences } from './SalesPromptReferences';
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
const script: VideoSalesScript = { id: 's', title: '商品口播', totalDuration: 15, deliveryMode: 'single', assets: [], seo: { title: '', hashtags: [], coverText: '', interactionGuide: '', description: '' }, shots: [{ shotId: 1, type: 'hook', duration: 3, description: '展示商品', speechMode: 'voiceover', voiceover: '看这个商品', camera: '近景', visualSource: 'product_image', transition: 'direct_concat' }, { shotId: 2, type: 'demo', duration: 12, description: '使用展示', voiceover: '看细节', camera: '特写', visualSource: 'product_image', transition: 'direct_concat' }] };

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
    for (const label of ['只看已选', '商品参考图', '查看商品图 1 大图', '查看商品图 2 大图', '查看商品图 3 大图']) expect(html).toContain(label);
    expect(html).not.toContain('未选');
    for (const label of ['本次商品颜色', '确认此颜色', '搜索商品颜色']) expect(html).not.toContain(label);
    expect(nodes(gallery()).some((item) => item.type === 'button' && renderToStaticMarkup(item).includes('删除'))).toBe(false);
    expect(html).toContain('object-contain');
  });
  it('renders the complete catalog without a collapse control', () => {
    const fullCatalog = [...images, { index: 3, role: 'detail' as const, url: '/detail-1.png' }, { index: 4, role: 'detail' as const, url: '/detail-2.png' }, { index: 5, role: 'detail' as const, url: '/detail-3.png' }, { index: 6, role: 'detail' as const, url: '/detail-4.png' }];
    const html = renderToStaticMarkup(gallery({ images: fullCatalog }));
    expect(html).toContain('查看商品图 7 大图');
    expect(html).not.toContain('展开其余');
    expect(html).not.toContain('收起更多商品图');
  });
  it('selects an image without typing a color and makes it eligible for generation', () => {
    const onChange = vi.fn();
    const empty = { colorLabel: '', confirmedImageUrls: [], excludedImageUrls: [] };
    const view = gallery({ selection: empty, metadata: undefined, onChange });
    const button = nodes(view).find((item) => item.props['aria-label'] === '选择商品图 1')!;
    expect(button.props.disabled).toBeFalsy();
    (button.props.onClick as () => void)();
    const next = onChange.mock.calls[0][0] as SalesColorSelection;
    expect(next).toEqual({ ...empty, variantId: undefined, confirmedImageUrls: ['/black.png'] });
    expect(eligibleSalesImages(images, next)).toEqual([images[0]]);
    expect(images).toHaveLength(3);
  });
  it('preserves selected legacy images but clears the old color constraint on direct selection', () => {
    const onChange = vi.fn();
    const button = nodes(gallery({ onChange })).find((item) => item.type === 'button' && item.props['aria-label'] === '取消选择商品图 1')!;
    (button.props.onClick as () => void)();
    expect(onChange).toHaveBeenCalledWith({ colorLabel: '', variantId: undefined, confirmedImageUrls: [], excludedImageUrls: ['/black.png'] });
  });
  it('deselects and restores a mapped picture without deleting it', () => {
    const onChange = vi.fn();
    const button = nodes(gallery({ onChange })).find((item) => item.type === 'button' && item.props['aria-label'] === '取消选择商品图 1')!;
    (button.props.onClick as () => void)();
    const next = onChange.mock.calls[0][0] as SalesColorSelection;
    expect(eligibleSalesImages(images, next, metadata)).toEqual([]);
    hooks.index = 0;
    const restore = nodes(gallery({ selection: next, onChange })).find((item) => item.type === 'button' && item.props['aria-label'] === '选择商品图 1')!;
    (restore.props.onClick as () => void)();
    expect(onChange).toHaveBeenLastCalledWith({ colorLabel: '', variantId: undefined, confirmedImageUrls: ['/black.png'], excludedImageUrls: [] });
    expect(images).toHaveLength(3);
  });
  it('filters the selected images while keeping the full catalog as the default view', () => {
    hooks.values = ['selected'];
    expect(renderToStaticMarkup(gallery())).not.toContain('查看商品图 2 大图');
    hooks.index = 0;
    hooks.values = ['all'];
    const html = renderToStaticMarkup(gallery());
    expect(html).toContain('查看商品图 1 大图');
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
    const html = renderToStaticMarkup(createElement(SalesPlanSection, { script: { ...script, fullPrompt: '不应显示在脚本区', historicalData: { personImagePrompt: '旧人物绘图' } }, disabled: false, onEditShot: vi.fn() }));
    expect(html).toContain('0');
    expect(html).toContain('15');
    expect(html).toContain('口播与画面时间轴');
    expect(html).not.toContain('卖点与脚本摘要');
    expect(html).not.toContain('脚本时长分布');
    expect(html).toContain('查看完整提示词');
    expect(html).toContain('更多设置');
    expect(html).toContain('sales-shot-0');
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
      { id: 'detail', kind: 'keyframe', label: '胸前绣花与罗纹领口细节', prompt: '绣花细节', required: true, status: 'uncertain', validation: 'pending', usesProduct: true, productImageIndexes: [0], referenceAssetIds: ['main'], validationReason: '图 2 缺失参考图无法读取；参考图预设 SM19' },
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
  it('does not render the removed validation-only toolbar action', () => {
    const assets: SalesCreativeAsset[] = [{ id: 'front', kind: 'keyframe', label: '正面', prompt: '正面', required: true, usesProduct: true, productImageIndexes: [7], status: 'done', url: '/front.jpg' }];
    const view = SalesAssetsSection({ script: { ...script, assets }, imageModel: '', disabled: false, onModel: vi.fn(), onEditPrompt: vi.fn(), onGenerate: vi.fn() });
    const html = renderToStaticMarkup(view);
    expect(html).not.toContain('仅重新校验已有图片');
    expect(html).not.toContain('本素材参考图片');
    expect(html).toContain('object-contain');
    const imgClass = html.match(/<img[^>]*class="([^"]*)"/)?.[1] ?? '';
    expect(imgClass.split(/\s+/)).not.toContain('w-full');
  });
  it('keeps reference error numbering aligned with explicitly bound product images', () => {
    const assets: SalesCreativeAsset[] = [
      { id: 'main', kind: 'keyframe', label: '前置静帧', prompt: '商品', required: true, status: 'done', url: '/main.jpg' },
      { id: 'detail', kind: 'keyframe', label: '细节', prompt: '局部', required: true, usesProduct: true, productImageIndexes: [0, 1], referenceAssetIds: ['main'], status: 'failed', error: '图 3 缺失参考图无法读取' },
    ];
    const html = renderToStaticMarkup(createElement(SalesAssetsSection, { script: { ...script, assets }, productImages: images.slice(0, 2), imageModel: 'image', disabled: false, onModel: vi.fn(), onEditPrompt: vi.fn(), onGenerate: vi.fn() }));
    expect(html).toContain('第 3 张参考图「前置静帧」');
  });
  it('keeps video configuration gated until assets are ready and accepts a missing full prompt', () => {
    const html = renderToStaticMarkup(createElement(SalesVideoSection, { state: defaultSalesStudioState, script, disabled: false, assetsReady: false, videoError: null, onEditPrompt: vi.fn() }));
    expect(html).toContain('视频提示词和视频参数届时开放');
    expect(html).toContain('完整提示词将在这里生成');
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
  it('shows five workflow steps in the shared header', () => {
    const html = renderToStaticMarkup(createElement(SalesStudioHeader, { onBack: vi.fn(), onReset: vi.fn(), resetDisabled: false, resetTitle: '', onOpenRules: vi.fn() }));
    expect(html).toContain('电商视频');
    expect(html).toContain('带货规则');
    expect(html).toContain('aria-label="电商视频制作步骤"');
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).not.toContain('role="tablist"');
  });
  it('keeps the skill at the top of planning settings and marks supplemental facts as optional', () => {
    const fields = renderToStaticMarkup(createElement(SalesProductFields, { productName: '', brand: '', sellingPoints: '', disabled: false, onChange: vi.fn() }));
    const settings = renderToStaticMarkup(createElement(SalesPlanningSettings, { state: defaultSalesStudioState, disabled: false, onOpenRules: vi.fn(), onChange: vi.fn() }));
    expect(fields).not.toContain('创作技能');
    expect(settings.indexOf('创作设置')).toBeLessThan(settings.indexOf('创作技能'));
    expect(settings.indexOf('创作技能')).toBeLessThan(settings.indexOf('卖点与脚本模型'));
    expect(settings).toContain('同一模型也用于商品分析和视频提示词');
    expect(settings).not.toContain('通用制作流程');
    expect(settings).toContain('服饰专属规则');
    expect(settings).not.toContain('value="generic"');
    for (const label of ['商品品类', '美妆护肤', '食品零食', '家居日用', '服饰鞋包', '数码3C', '通用百货']) expect(fields).not.toContain(label);
    expect(fields).not.toContain('品牌');
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
    const html = renderToStaticMarkup(createElement(SalesVideoSection, { state: defaultSalesStudioState, script: { ...script, fullPrompt: '整段提示词' }, disabled: false, assetsReady: true, videoError: null, submitError: '上次视频提交结果未确认，请先核对生成记录', onEditPrompt: vi.fn() }));
    expect(html).toContain('上次视频提交结果未确认');
    expect(html).not.toContain('纯文本');
    expect(html).toContain('整段提示词');
    expect(html).toContain('编辑');
    expect(html).not.toContain('图片1 ·');
    expect(html).not.toContain('视频提示词模型');
    expect(html).not.toContain('提示词引用的素材');
    expect(html).not.toContain('生成视频</');
  });
  it('groups video models and parameters in compact footer controls', () => {
    const html = renderToStaticMarkup(createElement(SalesFooterVideoControls, { state: defaultSalesStudioState, modelId: '', disabled: false, onChange: vi.fn() }));
    expect(html).toContain('aria-label="视频设置"');
    expect(html.indexOf('视频提示词模型')).toBeLessThan(html.indexOf('aria-label="视频模型"'));
    expect(html).toContain('aria-label="视频能力与参数"');
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
      script: ready, disabled: false, assetsReady: true, videoError: null, onEditPrompt: vi.fn(),
    }));
    expect(html).not.toContain('纯文本');
    expect(html).toContain('@图片1');
    expect(html).toContain('@图片2');
    expect(html).toContain('</button>黑色上衣，<button');
    expect(html).not.toContain('target="_blank"');
    expect(html.match(/aria-haspopup="dialog"/g)).toHaveLength(2);
    expect(html).not.toContain('aria-label="引用素材映射"');
    expect(html.indexOf('查看图片1')).toBeLessThan(html.indexOf('查看图片2'));
    expect(html).not.toContain('提示词引用的素材');
    expect(html).toContain('src="/black.png"');
    expect(html).toContain('src="/person.jpg"');
  });
  it('preserves unknown image numbers and renders spaced, repeated and @ image references', () => {
    const html = renderToStaticMarkup(createElement(SalesPromptReferences, { prompt: '图片 1、@图片1、图片99、图片10、15秒', references: [{ id: 'p', kind: 'product', label: '商品', url: '/product.png' }] }));
    expect(html.match(/src="\/product.png"/g)).toHaveLength(2);
    expect(html).toContain('图片99、图片10、15秒');
  });
  it('keeps stopped or uncertain task recovery separate from duplicate controls', () => {
    const html = renderToStaticMarkup(createElement(SalesResultSection, { script: { ...script, renderTaskId: 'receipt', renderStatus: 'uncertain' }, aspectRatio: '9:16', resultUrl: null, renderPhase: null, isRendering: false, onStop: vi.fn(), onQuery: vi.fn(), singleDelivery: true, actionsInFooter: true }));
    expect(html).toContain('提交结果待确认');
    expect(html).toContain('不会重新提交');
    expect(html).not.toContain('继续查询原任务（不重新提交）');
  });
  it('turns an unconfirmed submission without receipt into a recoverable card', () => {
    const html = renderToStaticMarkup(createElement(SalesResultSection, { script: { ...script, renderSubmissionKey: 'key-1', renderStatus: 'uncertain', renderError: '视频提交响应未确认（网络或响应读取阶段，尝试 1 个端点）' }, aspectRatio: '9:16', resultUrl: null, renderPhase: null, isRendering: false, onStop: vi.fn(), onQuery: vi.fn(), singleDelivery: true, actionsInFooter: true, onPrepareRetry: vi.fn(), onBindTask: vi.fn() }));
    expect(html).toContain('不会自动重新提交');
    expect(html).toContain('技术详情');
    expect(html).toContain('绑定并查询');
    expect(html).toContain('已核实未提交，准备新草稿');
    expect(html).not.toContain('bg-rose');
  });
  it('offers direct image selection without color quick selection', () => {
    const onChange = vi.fn();
    const view = gallery({ onChange, selection: { colorLabel: '', confirmedImageUrls: [], excludedImageUrls: [] } });
    expect(renderToStaticMarkup(view)).not.toContain('按颜色快选');
    expect(renderToStaticMarkup(view)).not.toContain('红色');
    click(view, '选择商品图 2');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ variantId: undefined, colorLabel: '', confirmedImageUrls: ['/red.png'] }));
    onChange.mockClear();
    hooks.index = 0;
    click(gallery({ onChange, selection: { colorLabel: '', confirmedImageUrls: ['/red.png'], excludedImageUrls: [] } }), '清空重选');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ variantId: undefined, colorLabel: '', confirmedImageUrls: [] }));
  });
  it('renders current SKU specifications and asset thumbnails without a duplicate prompt reference strip', () => {
    const fields = renderToStaticMarkup(createElement(SalesProductFields, {
      productName: '卫衣',
      brand: '品牌',
      sellingPoints: '纯棉',
      props: { 材质: '100%棉', 领型: '圆领', 商品分类: '1315', 商品毛重: '0.660' },
      productUrl: '100265837786',
      images: images.slice(0, 1),
      colorSelection: { colorLabel: '黑色加绒', confirmedImageUrls: ['/black.png'], excludedImageUrls: [] },
      variantMetadata: { version: 1, requestedSkuId: '100265837786', selectedVariantId: 'black-fleece', variants: [{ id: 'black-fleece', label: '黑色加绒', color: '黑色加绒', skuIds: ['100265837786'], imageUrls: ['/black.png'] }] },
      analysis: { productName: '卫衣', category: 'fashion', visualFeatures: { mainColor: '黑色', designStyle: '简约', productForm: '圆领套头', texture: '华夫格' }, sellingPoints: ['秋冬季单穿内搭都合适'], targetAudience: '青年男士', usageScenarios: ['日常通勤'], painPoints: [], knownFacts: ['圆领罗纹收口'], videoSuggestions: { recommendedAngles: [], keyVisuals: [], suggestedStyle: '' } },
      disabled: false,
      onChange: vi.fn(),
    }));
    expect(fields).toContain('商品规格');
    expect(fields).not.toContain('100%棉');
    expect(fields).toContain('100265837786');
    expect(fields).toContain('黑色 / 加绒');
    expect(fields).toContain('已自动提炼 · 1 条');
    expect(fields).toContain('提炼依据与适用场景');
    expect(fields).toContain('圆领罗纹收口');
    expect(fields).not.toContain('AI 提炼卖点与信息');
    expect(fields).not.toContain('aria-expanded');
    expect(fields).not.toContain('1315');
    expect(fields).not.toContain('0.660');
    expect(fields).not.toContain('展开全部参数');

    const planHtml = renderToStaticMarkup(createElement(SalesPlanSection, {
      script: {
        ...script,
        beat: 'unbox',
        assets: [{ id: 'person', kind: 'person', label: '出镜人物', prompt: '人物', required: true }],
        shots: [{ ...script.shots[0], duration: 10, imageIndex: 0, speechMode: 'on_camera' }],
      },
      disabled: false,
      onEditShot: vi.fn(),
      productImages: images.slice(0, 1),
    }));
    expect(planHtml).not.toContain('当前分镜合计');
    expect(planHtml).not.toContain('当前出镜方式为画外音展示');
    expect(planHtml).not.toContain('待准备素材');
    expect(planHtml).toContain('商品参考 #1');

    const outlineHtml = renderToStaticMarkup(createElement(SalesScriptOutline, {
      script: {
        ...script,
        assets: [{ id: 'person', kind: 'person', label: '出镜人物', prompt: '人物', required: true }],
        shots: [{ ...script.shots[0], duration: 10, imageIndex: 0, speechMode: 'on_camera' }],
      },
      productImages: images.slice(0, 1),
    }));
    expect(outlineHtml).toContain('待准备素材');
    expect(outlineHtml).toContain('出镜人物');

    const assetHtml = renderToStaticMarkup(createElement(SalesAssetsSection, {
      script: { ...script, assets: [{ id: 'front', kind: 'keyframe', label: '正面', prompt: '正面', required: true, usesProduct: true, productImageIndexes: [0], status: 'done', url: '/front.jpg' }] },
      productImages: images.slice(0, 1),
      imageModel: 'image',
      disabled: false,
      onModel: vi.fn(),
      onEditPrompt: vi.fn(),
      onGenerate: vi.fn(),
    }));
    expect(assetHtml).not.toContain('本素材参考图片');
    expect(assetHtml).not.toContain('绘图提示词');
    expect(assetHtml).toContain('src="/front.jpg"');

    const preFinalHtml = renderToStaticMarkup(createElement(SalesVideoSection, {
      state: { ...defaultSalesStudioState, imageCatalog: images.slice(0, 1), colorSelection: { colorLabel: '', confirmedImageUrls: ['/black.png'], excludedImageUrls: [] } },
      script: { ...script, fullPrompt: undefined, shots: script.shots.map((shot) => ({ ...shot, imageIndex: 0 })), assets: [{ id: 'person', kind: 'person', label: '出镜人物', prompt: '人物', required: true, url: '/person.jpg', status: 'done' }] },
      disabled: false,
      assetsReady: true,
      videoError: null,
      onEditPrompt: vi.fn(),
    }));
    expect(preFinalHtml).not.toContain('提示词引用的素材');
    expect(preFinalHtml).not.toContain('<img');
  });
  it('keeps progress and stop in the footer without an extra running note', () => {
    const html = renderToStaticMarkup(createElement(SalesActionBar, { primary: { label: '正在生成视频', disabled: true }, secondary: { label: '停止继续提交', onClick: vi.fn() }, busy: true, progress: '正在查询任务', note: '已提交任务仍可能计费' }));
    expect(html).toContain('正在查询任务');
    expect(html).not.toContain('已提交任务仍可能计费');
    expect(html).toContain('停止继续提交');
    expect(html).toContain('aria-describedby=');
  });
});
