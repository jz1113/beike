import { createElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeScriptTemplate } from '@shared/domain/sales/scriptTemplate';
import { SalesPlanAdaptPanel } from './SalesPlanAdaptPanel';

type Props = ComponentProps<typeof SalesPlanAdaptPanel>;
const selection = vi.hoisted(() => ({ model: 'vision' }));
vi.mock('../hooks/useSalesSummaryModels', () => ({
  useSalesSummaryModels: () => ({
    model: selection.model,
    options: selection.model ? [{ id: 'vision', name: 'Vision' }] : [],
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

describe('storyboard editing and bottom actions', () => {
  beforeEach(() => { selection.model = 'vision'; });

  it('exposes the current rewrite model without a settings navigation shortcut', () => {
    const html = render();
    const footer = html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] || '';
    expect(footer).toContain('aria-label="分镜改写模型"');
    expect(footer).toContain('Vision');
    expect(footer).not.toContain('配置文本与多模态模型');
    expect(footer).not.toContain('sales-selling-settings');
    expect(footer).not.toContain('sales-sb-adapt-model-pop');
    expect(footer).not.toContain('<details');
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
    ['clean_visual', 'none', 6, ''],
    ['subtitled_intro', 'none', 7, ''],
    ['subtitled_intro', 'speech', 8, '口播台词'],
    ['subtitled_intro', 'voiceover', 8, '旁白台词'],
  ] as const)('keeps the footer aligned with the visible %s/%s columns', (presentationMode, effectiveVoiceMode, count, heading) => {
    const html = render({ presentationMode, effectiveVoiceMode });
    const head = html.match(/<thead>([\s\S]*?)<\/thead>/)?.[1] || '';
    expect([...head.matchAll(/<th\b/g)]).toHaveLength(count);
    expect(html).toContain(`colSpan="${count}"`);
    if (heading) expect(head).toContain(heading);
    else expect(head).not.toMatch(/(?:口播|旁白)台词/);
  });

  it.each([{ adapting: true }, { disabled: true }])('locks model selection and editing while busy: %j', (patch) => {
    const html = render(patch);
    expect(buttons(html).find((button) => button.attrs.includes('aria-label="分镜改写模型"'))?.attrs).toContain('disabled=""');
    expect(textarea(html, '片段 1 画面动作')?.[1]).toContain('disabled=""');
    expect(buttons(html).find((button) => button.label === '下一步：生成成片')?.attrs).toContain('disabled=""');
    if (patch.adapting) expect(buttons(html).find((button) => button.label === '停止改写')?.attrs).not.toContain('disabled=""');
  });

  it('allows manual editing and advancing when no rewrite model is configured', () => {
    selection.model = '';
    const html = render();
    expect(html).toContain('或直接编辑分镜内容');
    expect(buttons(html).find((button) => button.label === '按商品自动改写')?.attrs).toContain('disabled=""');
    expect(textarea(html, '片段 1 画面动作')?.[1]).not.toContain('disabled=""');
    expect(buttons(html).find((button) => button.label === '下一步：生成成片')?.attrs).not.toContain('disabled=""');
  });

  it('warns for fast speech in subsecond beats using the actual duration and spoken characters', () => {
    const short = normalizeScriptTemplate({ durationSec: 0.4, voiceMode: 'speech',
      shots: [{ beats: [{ start: 0, end: 0.4, action: '展示商品' }] }],
    })!;
    const html = render({ script: short, adaptedBeats: [{ index: 0, subject: '', action: '', spokenLine: '你，好！', subtitle: '' }] });
    expect(html).toContain('2 字 · 5 字/秒 · 偏快');
  });
});

type FieldProps = {
  'aria-label'?: string;
  label?: string;
  children?: ReactNode;
  disabled?: boolean;
  value?: string;
  fallback?: string;
  placeholder?: string;
  onChange?: (value: string | { target: { value: string } }) => void;
};
function fields(node: ReactNode): ReactElement<FieldProps>[] {
  if (Array.isArray(node)) return node.flatMap(fields);
  if (!isValidElement<FieldProps>(node)) return [];
  return [node, ...fields(node.props.children)];
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
