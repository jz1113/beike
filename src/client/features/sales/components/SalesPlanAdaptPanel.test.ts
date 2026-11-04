import { createElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeScriptTemplate } from '@shared/domain/sales/scriptTemplate';
import { ConfiguredModelPicker } from '@client/shared/models/ConfiguredModelPicker';
import { SalesPlanAdaptPanel } from './SalesPlanAdaptPanel';

type Props = ComponentProps<typeof SalesPlanAdaptPanel>;
const selection = vi.hoisted(() => ({ model: 'vision' }));
vi.mock('../hooks/useSalesTextModels', () => ({
  useSalesTextModels: () => ({
    model: selection.model,
    options: selection.model ? [{ id: selection.model, name: selection.model === 'vision' ? 'Vision' : '我的自定义模型', upstreamId: 'company-copy-v2', provider: '自选渠道' }] : [],
  }),
}));
const noop = () => {};
const script = normalizeScriptTemplate({
  title: '商品展示', durationSec: 3.5, voiceMode: 'speech',
  shots: [{ beats: [{ start: 0, end: 3.5, action: '双手轻托商品，转向镜头展示',
    subject: '人物与当前商品', expression: '看向镜头浅笑', transition: '保持站位接下一段',
  }] }],
})!;
function render(patch: Partial<Props> = {}) {
  return renderToStaticMarkup(createElement(SalesPlanAdaptPanel, {
    script, preferredModel: 'vision', onModelChange: noop,
    selectedImages: [], beatBindings: [], adaptedBeats: [], effectiveVoiceMode: 'speech',
    presentationMode: 'subtitled_intro', spokenCharCount: 0, estimatedSpeakSec: 0,
    adapting: false, disabled: false, onRunAdapt: noop, onCancel: noop,
    onChangeBeatImage: noop, onChangeAdaptedBeat: noop, onNextStep: noop, ...patch,
  }));
}
function buttons(html: string) {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
    .map(([, attrs, body]) => ({ attrs, label: body.replace(/<[^>]*>/g, '') }));
}
function textarea(html: string, label: string) {
  return [...html.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/g)]
    .find(([, attrs]) => attrs.includes(`aria-label="${label}"`));
}

describe('storyboard editing and production settings', () => {
  beforeEach(() => { selection.model = 'vision'; });

  it('exposes the current rewrite model without a settings navigation shortcut', () => {
    const html = render();
    const settings = html.match(/<aside\b[\s\S]*?<\/aside>/)?.[0] || '';
    expect(settings).toContain('aria-label="分镜改写模型"');
    expect(settings).toContain('Vision');
    expect(settings).not.toContain('配置文本与多模态模型');
    expect(settings).not.toContain('sales-selling-settings');
    expect(settings).not.toContain('sales-sb-adapt-model-pop');
    expect(settings).not.toContain('<details');
  });

  it('offers a custom chat entry and submits that exact channel when rewriting', () => {
    selection.model = 'custom-chat-entry';
    const onRunAdapt = vi.fn();
    const onModelChange = vi.fn();
    const node = editablePanel({ onRunAdapt, onModelChange,
      adaptedBeats: [{ index: 0, subject: '', action: '', spokenLine: '', subtitle: '' }] });
    const picker = fields(node).find((element) => element.type === ConfiguredModelPicker)!;
    expect(picker.props).toMatchObject({ value: 'custom-chat-entry', options: [
      { id: 'custom-chat-entry', name: '我的自定义模型', upstreamId: 'company-copy-v2', provider: '自选渠道' },
    ] });
    picker.props.onChange!('custom-chat-entry');
    expect(onModelChange).toHaveBeenCalledExactlyOnceWith('custom-chat-entry');
    const rewrite = fields(node).find((element) => element.type === 'button'
      && Array.isArray(element.props.children) && element.props.children.includes('按商品重新改写'))!;
    rewrite.props.onClick!();
    expect(onRunAdapt).toHaveBeenCalledExactlyOnceWith('custom-chat-entry');
  });

  it('combines the first rewrite with advancing and keeps an optional rewrite for existing drafts', () => {
    const html = render({ productSpokenCopy: '当前商品口播文案' });
    expect(buttons(html).find((button) => button.label === '按商品自动改写')).toBeUndefined();
    expect(buttons(html).find((button) => button.label === '下一步：准备成片脚本')?.attrs).toContain('自动按当前商品改写分镜');
    expect(html).toContain('点击“下一步：准备成片脚本”时自动按画面和时长改写口语台词');
    const existing = render({ adaptedBeats: [{ index: 0, subject: '', action: '', spokenLine: '', subtitle: '' }] });
    expect(buttons(existing).find((button) => button.label === '按商品重新改写')?.attrs).not.toContain('disabled=""');
  });

  it('keeps the source action visible when only the subject has been edited', () => {
    const html = render({ adaptedBeats: [{ index: 0, subject: '双手与商品特写', action: '', spokenLine: '', subtitle: '' }] });
    expect(textarea(html, '片段 1 画面动作')?.[2]).toBe('双手轻托商品，转向镜头展示');
    expect(html).toContain('aria-label="片段 1 编辑主体、表情与衔接"');
  });

  it.each([['眼神表情', '看向镜头浅笑'], ['段落衔接', '保持站位接下一段']])('shows inherited %s text for direct editing', (field, fallback) => {
    const html = render();
    expect(textarea(html, `片段 1 ${field}`)?.[2]).toBe(fallback);
    expect(textarea(html, `片段 1 ${field}`)?.[1]).not.toContain('disabled=""');
  });

  it('keeps explicitly cleared expression and transition empty', () => {
    const html = render({ adaptedBeats: [{ index: 0, subject: '', action: '', expression: '', transition: '', spokenLine: '', subtitle: '' }] });
    expect(textarea(html, '片段 1 眼神表情')?.[2]).toBe('');
    expect(textarea(html, '片段 1 段落衔接')?.[2]).toBe('');
  });

  it('keeps an explicitly cleared subject empty even while inheriting the original action', () => {
    const node = editablePanel({ adaptedBeats: [{ index: 0, subject: '', action: '', spokenLine: '', subtitle: '', manualPerformanceFields: ['subject'] }] });
    const field = fields(node).find((element) => element.props.label === '片段 1 画面主体');
    expect(field?.props).toMatchObject({ value: '', emptyUsesFallback: false });
    expect(textarea(render({ adaptedBeats: [{ index: 0, subject: '', action: '', spokenLine: '', subtitle: '', manualPerformanceFields: ['subject'] }] }), '片段 1 画面主体')?.[2]).toBe('');
  });

  it('does not display old subject, expression or transition after the action is adapted', () => {
    const html = render({ adaptedBeats: [{ index: 0, subject: '', action: '托起新商品展示', spokenLine: '', subtitle: '' }] });
    expect(textarea(html, '片段 1 画面主体')?.[2]).toBe('');
    expect(textarea(html, '片段 1 眼神表情')?.[2]).toBe('');
    expect(textarea(html, '片段 1 段落衔接')?.[2]).toBe('');
    expect(html).not.toContain('has-extra');
  });

  it('keeps the source expression but omits scene-dependent continuity when the scene changes', () => {
    const html = render({ hasSceneReplacement: true });
    expect(textarea(html, '片段 1 眼神表情')?.[2]).toBe('看向镜头浅笑');
    expect(textarea(html, '片段 1 段落衔接')?.[2]).toBe('');
  });

  it.each([
    ['clean_visual', 'none', 7, '原片参考'],
    ['subtitled_intro', 'none', 7, ''],
    ['subtitled_intro', 'speech', 8, '口播台词'],
    ['subtitled_intro', 'voiceover', 8, '旁白台词'],
  ] as const)('renders the %s/%s columns and a summary below the table', (presentationMode, effectiveVoiceMode, count, heading) => {
    const html = render({ presentationMode, effectiveVoiceMode });
    const head = html.match(/<thead>([\s\S]*?)<\/thead>/)?.[1] || '';
    expect([...head.matchAll(/<th\b/g)]).toHaveLength(count);
    expect(html).toContain('</table><div class="sales-sb-tfoot-bar">');
    if (heading) expect(head).toContain(heading);
    else expect(head).not.toMatch(/(?:口播|旁白)台词/);
  });

  it.each([{ adapting: true }, { disabled: true }])('locks model selection and editing while busy: %j', (patch) => {
    const html = render(patch);
    expect(buttons(html).find((button) => button.attrs.includes('aria-label="分镜改写模型"'))?.attrs).toContain('disabled=""');
    expect(textarea(html, '片段 1 画面动作')?.[1]).toContain('disabled=""');
    expect(buttons(html).find((button) => button.label === '下一步：准备成片脚本')?.attrs).toContain('disabled=""');
    if (patch.adapting) expect(buttons(html).find((button) => button.label === '停止改写')?.attrs).not.toContain('disabled=""');
  });

  it.each([
    ['storyboard', true, '1/2 改写分镜中…'],
    ['storyboard', false, '1/2 核对分镜…'],
    ['script', false, '2/2 准备成片脚本…'],
  ] as const)('shows the automatic %s stage on the primary button', (deliveryStep, adapting, label) => {
    const button = buttons(render({ deliveryStep, adapting })).find((item) => item.label === label);
    expect(button?.attrs).toContain('disabled=""');
    expect(button?.attrs).toContain('aria-busy="true"');
  });

  it('allows manual editing and advancing when no rewrite model is configured', () => {
    selection.model = '';
    const html = render();
    expect(html).toContain('或直接编辑分镜内容');
    expect(buttons(html).find((button) => button.label === '按商品自动改写')).toBeUndefined();
    expect(textarea(html, '片段 1 画面动作')?.[1]).not.toContain('disabled=""');
    expect(buttons(html).find((button) => button.label === '下一步：准备成片脚本')?.attrs).not.toContain('disabled=""');
  });

  it('warns for fast speech in subsecond beats using the actual duration and spoken characters', () => {
    const short = normalizeScriptTemplate({ durationSec: 0.4, voiceMode: 'speech',
      shots: [{ beats: [{ start: 0, end: 0.4, action: '展示商品' }] }],
    })!;
    const html = render({ script: short, adaptedBeats: [{ index: 0, subject: '', action: '', spokenLine: '你，好！', subtitle: '' }] });
    expect(html).toContain('2 字 · 5 字/秒 · 偏快');
  });

  it.each(['speech', 'voiceover'] as const)('explains connected speech and keyword subtitles for %s', (effectiveVoiceMode) => {
    const html = render({ effectiveVoiceMode });
    expect(html).toContain('选取 1—3 个商品重点');
    expect(html).toContain('写成连贯口语');
    expect(html).toContain('同一镜头内自然承接，短段可留白');
    expect(html).toContain('字幕只提炼关键词');
    expect(html).not.toContain('精简重试');
    if (effectiveVoiceMode === 'voiceover') expect(html).toContain('实际与画面的对齐及结尾是否完整请试听确认');
  });

  it('shows product copy and source speech as references without assigning them to the finished video', () => {
    const source = normalizeScriptTemplate({ durationSec: 4, voiceMode: 'speech', shots: [{ beats: [{
      start: 0, end: 4, action: '展示商品', voice: { mode: 'speech', text: '原片旧商品口播', linePattern: '介绍卖点' }, subtitle: '原片字幕',
    }] }] })!;
    const html = render({ script: source, productSpokenCopy: '本商品完整口播\n第二句' });
    expect(html).toContain('商品口播参考稿');
    expect(html).toContain('成片以本次逐镜台词为准');
    expect(html).toContain('尚未填写本次逐镜台词');
    expect(html).toContain('本商品完整口播\n第二句');
    expect(html).toContain('原片台词参考：</strong>原片旧商品口播');
    expect(html).toContain('原片字幕参考：</strong>原片字幕');
    expect(textarea(html, '片段 1 台词')?.[2]).toBe('');
    expect(textarea(html, '片段 1 字幕')?.[2]).toBe('');

    const edited = render({ script: source, productSpokenCopy: '本商品完整口播', productSpokenCopyStale: true,
      adaptedBeats: [{ index: 0, subject: '', action: '', spokenLine: '本次台词', subtitle: '' }] });
    expect(textarea(edited, '片段 1 台词')?.[2]).toBe('本次台词');
    expect(edited).toContain('原片旧商品口播');
    expect(edited).toContain('商品资料已更新，请先核对或重新提炼参考稿');
    expect(edited).toContain('商品口播参考稿（资料已更新，待核对）');
  });

  it.each(['speech', 'voiceover'] as const)('previews the current %s lines in storyboard order and collapses the separate reference', (effectiveVoiceMode) => {
    const twoBeats = normalizeScriptTemplate({ durationSec: 8, voiceMode: effectiveVoiceMode, shots: [{ beats: [
      { start: 0, end: 4, action: '正面展示' }, { start: 4, end: 8, action: '展示袖口' },
    ] }] })!;
    const adaptedBeats = [
      { index: 1, subject: '', action: '', spokenLine: ' 袖口自己调松紧。 ', subtitle: '袖口可调' },
      { index: 0, subject: '', action: '', spokenLine: '这件上衣版型宽松，', subtitle: '宽松版型' },
      { index: 2, subject: '', action: '', spokenLine: '已截去的旧台词', subtitle: '' },
    ];
    const html = render({ script: twoBeats, effectiveVoiceMode, productSpokenCopy: '长篇商品参考文案', adaptedBeats });
    expect(html).toContain(effectiveVoiceMode === 'voiceover' ? '当前逐镜旁白' : '当前逐镜口播');
    expect(html).toContain('<p>这件上衣版型宽松， 袖口自己调松紧。</p>');
    expect(html).toContain('生成前仍需通过口播校验');
    expect(html).toContain('<details><summary>商品口播参考稿</summary>');
    expect(html).not.toContain('已截去的旧台词');
    expect(html).not.toContain('尚未填写本次逐镜台词');
    const manualOnly = render({ script: twoBeats, effectiveVoiceMode, adaptedBeats: adaptedBeats.slice(0, 2) });
    expect(manualOnly).toContain('<p>这件上衣版型宽松， 袖口自己调松紧。</p>');
    expect(manualOnly).not.toContain('<details>');
    const cleared = render({ script: twoBeats, effectiveVoiceMode,
      adaptedBeats: adaptedBeats.slice(0, 2).map((beat) => ({ ...beat, spokenLine: '' })) });
    expect(cleared).not.toContain('当前逐镜');
  });

  it.each([
    { effectiveVoiceMode: 'none' as const },
    { effectiveVoiceMode: 'speech' as const, presentationMode: 'clean_visual' as const },
  ])('hides the spoken preview when speech is disabled: %j', (mode) => {
    const html = render({ ...mode, productSpokenCopy: '待使用参考稿',
      adaptedBeats: [{ index: 0, subject: '', action: '', spokenLine: '隐藏的旧台词', subtitle: '' }] });
    expect(html).not.toContain('当前逐镜');
    expect(html).not.toContain('隐藏的旧台词');
    expect(html).toContain('商品口播参考稿');
    expect(html).toContain('当前为无口播模式');
  });

  it('keeps source speech and structure visible when speech is disabled or the current line is edited', () => {
    const source = normalizeScriptTemplate({ durationSec: 4, voiceMode: 'speech', shots: [{ beats: [{
      start: 0, end: 4, action: '展示商品', voice: { mode: 'speech', text: '', linePattern: '先展示袖口', uncertain: true }, subtitle: '原片字幕',
    }] }] })!;
    const html = render({ script: source, presentationMode: 'clean_visual', effectiveVoiceMode: 'none', productSpokenCopy: '商品文案' });
    expect(html).toContain('商品文案');
    expect(html).toContain('当前为无口播模式');
    expect(html).toContain('未记录，可在脚本库补录');
    expect(html).toContain('原片台词待核对');
    expect(html).toContain('话术结构：</strong>先展示袖口');
    expect(html).toContain('原片字幕参考：</strong>原片字幕');
    expect(textarea(html, '片段 1 台词')).toBeUndefined();
    const edited = render({ script: source, adaptedBeats: [{ index: 0, subject: '', action: '', spokenLine: '当前台词', subtitle: '' }] });
    expect(textarea(edited, '片段 1 台词')?.[2]).toBe('当前台词');
    expect(edited).toContain('话术结构：</strong>先展示袖口');
  });
});

type FieldProps = {
  'aria-label'?: string;
  label?: string;
  children?: ReactNode | (() => ReactNode);
  disabled?: boolean;
  value?: string;
  fallback?: string;
  placeholder?: string;
  onChange?: (value: string | { target: { value: string } }) => void;
  onClick?: () => void;
};
function fields(node: ReactNode): ReactElement<FieldProps>[] {
  if (Array.isArray(node)) return node.flatMap(fields);
  if (!isValidElement<FieldProps>(node)) return [];
  const content = node.props.children;
  return [node, ...fields(typeof content === 'function' ? content() : content)];
}
function editablePanel(overrides: Partial<Props> = {}) {
  const source = normalizeScriptTemplate({ durationSec: 8, voiceMode: 'voiceover', shots: [{ beats: [
    { start: 0, end: 4, subject: '出镜人物', action: '正面展示{{商品}}' },
    { start: 4, end: 8, subject: '商品细节', action: '转身展示背面' },
  ] }] })!;
  return SalesPlanAdaptPanel({ script: source, preferredModel: '', onModelChange: vi.fn(),
    selectedImages: [{ index: 0, url: '/front.jpg', role: 'main' }, { index: 1, url: '/back.jpg', role: 'detail' }],
    beatBindings: [], adaptedBeats: [], effectiveVoiceMode: 'voiceover', presentationMode: 'subtitled_intro',
    spokenCharCount: 0, estimatedSpeakSec: 0, adapting: false, disabled: false,
    onRunAdapt: vi.fn(), onCancel: vi.fn(), onChangeBeatImage: vi.fn(), onChangeAdaptedBeat: vi.fn(), ...overrides });
}
const field = (node: ReactNode, label: string) => fields(node)
  .find((element) => (element.props.label || element.props['aria-label']) === label)!;

describe('inline storyboard editing', () => {
  it('updates only the edited field and image for the intended beat', () => {
    const onChangeAdaptedBeat = vi.fn();
    const onChangeBeatImage = vi.fn();
    const node = editablePanel({ onChangeAdaptedBeat, onChangeBeatImage,
      adaptedBeats: [{ index: 1, subject: '定制主体', action: '已保存的动作', spokenLine: '保留台词', subtitle: '保留字幕' }] });
    expect(field(node, '片段 2 画面动作').props.value).toBe('已保存的动作');
    expect(field(node, '片段 2 画面主体').props.value).toBe('定制主体');
    field(node, '片段 2 画面动作').props.onChange!('慢慢转身展示背面');
    field(node, '片段 2 绑定商品图').props.onChange!({ target: { value: '/back.jpg' } });
    expect(onChangeAdaptedBeat).toHaveBeenCalledExactlyOnceWith(1, { action: '慢慢转身展示背面' });
    expect(onChangeBeatImage).toHaveBeenCalledExactlyOnceWith(1, '/back.jpg');
    expect(field(node, '片段 2 台词').props.value).toBe('保留台词');
    expect(field(node, '片段 2 字幕').props.value).toBe('保留字幕');
  });

  it('keeps script defaults as display fallbacks and preserves an explicitly cleared action', () => {
    const onChangeAdaptedBeat = vi.fn();
    const node = editablePanel({ onChangeAdaptedBeat });
    expect(field(node, '片段 1 画面动作').props.value).toBeUndefined();
    expect(field(node, '片段 1 画面动作').props.fallback).toBe('正面展示商品');
    expect(field(node, '片段 1 画面主体').props.value).toBeUndefined();
    expect(field(node, '片段 1 画面主体').props.fallback).toBe('出镜人物');
    expect(onChangeAdaptedBeat).not.toHaveBeenCalled();
    field(node, '片段 1 画面动作').props.onChange!('');
    expect(onChangeAdaptedBeat).toHaveBeenCalledExactlyOnceWith(0, { action: '' });
    const cleared = editablePanel({ adaptedBeats: [{ index: 0, subject: '', action: '', spokenLine: '', subtitle: '' }] });
    expect(field(cleared, '片段 1 画面动作').props.value).toBe('');
    expect(field(cleared, '片段 1 画面动作').props.fallback).toBe('正面展示商品');
  });

  it.each([[true, false], [false, true]])('locks per-beat editing while processing: disabled=%s adapting=%s', (disabled, adapting) => {
    const node = editablePanel({ disabled, adapting });
    for (const label of ['绑定商品图', '画面主体', '画面动作', '眼神表情', '段落衔接', '台词', '字幕']) {
      expect(field(node, `片段 2 ${label}`).props.disabled).toBe(true);
    }
  });

  it('allows reviewing facial timing and ending independently from motion and dialogue', () => {
    const onChangeAdaptedBeat = vi.fn();
    const node = editablePanel({ onChangeAdaptedBeat,
      adaptedBeats: [{ index: 0, subject: '', action: '举手', expression: '抬眼浅笑', transition: '原地收势', spokenLine: '', subtitle: '' }] });
    expect(field(node, '片段 1 眼神表情').props.value).toBe('抬眼浅笑');
    expect(field(node, '片段 1 段落衔接').props.value).toBe('原地收势');
    field(node, '片段 1 眼神表情').props.onChange!('末段笑意回落');
    field(node, '片段 1 段落衔接').props.onChange!('保持末姿势');
    expect(onChangeAdaptedBeat.mock.calls).toEqual([[0, { expression: '末段笑意回落' }], [0, { transition: '保持末姿势' }]]);
  });

  it('keeps visual editing available without narration or subtitle fields in clean visual mode', () => {
    const node = editablePanel({ presentationMode: 'clean_visual', effectiveVoiceMode: 'none' });
    expect(field(node, '片段 2 画面动作').props.disabled).toBe(false);
    expect(field(node, '片段 2 台词')).toBeUndefined();
    expect(field(node, '片段 2 字幕')).toBeUndefined();
  });
});
