import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptBarModelPickerModal } from '@client/shared/prompt-bar/controls/PromptBarModelPickerModal';
import { CoverFeedPanel } from './CoverFeedPanel';

vi.mock('@client/shared/prompt-bar/controls/PromptBarModelPickerModal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@client/shared/prompt-bar/controls/PromptBarModelPickerModal')>();
  return { ...actual, PromptBarModelPickerModal: vi.fn(() => null) };
});

const base: ComponentProps<typeof CoverFeedPanel> = {
  jobs: [{ id: 'sample', name: '封面.png', source: '封面.png', file: new File([], '封面.png', { type: 'image/png' }), previewUrl: '/sample.png', status: 'queued' }],
  models: [
    { selectionId: 'channel-a-model', modelId: 'gpt-4o-mini', name: 'gpt-4o-mini', channel: '渠道甲', textProtocol: 'openai', unavailable: false },
    { selectionId: 'channel-b-model', modelId: 'gpt-4o-mini', name: 'gpt-4o-mini', channel: '渠道乙', textProtocol: 'openai', unavailable: false },
    { selectionId: 'removed', modelId: 'claude-3-7-sonnet', name: 'Claude', channel: '渠道已移除', textProtocol: 'anthropic', unavailable: true },
  ],
  selectionId: 'channel-b-model', effort: 'medium', busy: false, notice: null,
  onSelectModel: vi.fn(), onEffortChange: vi.fn(), onClose: vi.fn(), onFiles: vi.fn(), onRemove: vi.fn(),
  onStart: vi.fn(), onRetry: vi.fn(), onOpenSettings: vi.fn(),
};

function render(overrides: Partial<typeof base> = {}) {
  const html = renderToStaticMarkup(createElement(CoverFeedPanel, { ...base, ...overrides }));
  const props = vi.mocked(PromptBarModelPickerModal).mock.lastCall?.[0];
  if (!props) throw new Error('Expected the shared model picker to be rendered');
  return { html, picker: props };
}

describe('cover feed model picker', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the Agent picker with readable names and channel-specific selections', () => {
    const { html, picker } = render();
    expect(html).not.toContain('<select');
    expect(html).toContain('GPT 4o Mini · 渠道乙');
    expect(html).toContain('aria-expanded="false"');
    expect(picker).toMatchObject({ selectedModelId: 'channel-b-model', modalityKind: 'chat', isUp: false, isOpen: false });
    expect(picker.models.map((model) => model.id)).toEqual(['channel-a-model', 'channel-b-model']);
    expect(picker.models.map((model) => model.upstreamId)).toEqual(['gpt-4o-mini', 'gpt-4o-mini']);
    picker.onSelectModel('channel-a-model');
    expect(base.onSelectModel).toHaveBeenCalledExactlyOnceWith('channel-a-model');
    picker.onSelectModel('removed');
    expect(base.onSelectModel).toHaveBeenCalledTimes(1);
  });

  it('renders the real shared menu with model generations and variants', async () => {
    const actual = await vi.importActual<typeof import('@client/shared/prompt-bar/controls/PromptBarModelPickerModal')>('@client/shared/prompt-bar/controls/PromptBarModelPickerModal');
    const { picker } = render({ models: [base.models[0]], selectionId: 'channel-a-model' });
    const html = renderToStaticMarkup(createElement(actual.PromptBarModelPickerModal, { ...picker, isOpen: true }));
    expect(html).toContain('GPT 4o');
    expect(html).toContain('Mini');
    expect(html).toContain('dark:bg-white/10');
    expect(html).not.toContain('暂无已启用的模型');
  });

  it('renders both channel choices in the real shared menu', async () => {
    const actual = await vi.importActual<typeof import('@client/shared/prompt-bar/controls/PromptBarModelPickerModal')>('@client/shared/prompt-bar/controls/PromptBarModelPickerModal');
    const { picker } = render();
    const html = renderToStaticMarkup(createElement(actual.PromptBarModelPickerModal, { ...picker, isOpen: true }));
    expect(html).toContain('gpt-4o-mini · 渠道甲');
    expect(html).toContain('gpt-4o-mini · 渠道乙');
    expect(html).not.toContain('渠道已移除');
  });

  it('allows a replacement selection when the previous model has disappeared', () => {
    const { html, picker } = render({ selectionId: 'removed' });
    expect(html).toContain('选择反推模型');
    expect(html).not.toContain('暂无可用的视觉模型');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>投喂并反推<\/button>/);
    picker.onSelectModel('channel-b-model');
    expect(base.onSelectModel).toHaveBeenCalledExactlyOnceWith('channel-b-model');
  });

  it('disables the trigger, picker and submission while analysis is busy', () => {
    const { html, picker } = render({ busy: true });
    expect(html).toMatch(/aria-expanded="false" disabled=""/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>投喂并反推<\/button>/);
    expect(picker.isOpen).toBe(false);
    picker.onSelectModel('channel-a-model');
    expect(base.onSelectModel).not.toHaveBeenCalled();
  });

  it('shows the model default when the selected model has no confirmed effort levels', () => {
    const { html } = render();
    expect(html).toContain('思考强度');
    expect(html).toContain('默认');
    expect(html).toContain('暂未确认此模型的强度参数，使用模型默认设置。');
    expect(html).not.toContain('aria-label="思考强度档位"');
  });

  it('offers the verified effort levels for the selected reverse model and locks them while busy', () => {
    const haiku = { selectionId: 'haiku', modelId: 'claude-haiku-5-5', name: 'Claude 5.5 Haiku', channel: '渠道甲', textProtocol: 'anthropic' as const, unavailable: false };
    const { html } = render({ models: [...base.models, haiku], selectionId: 'haiku', effort: 'xhigh' });
    expect(html).toContain('极高');
    expect(html).toContain('aria-label="思考强度档位"');
    expect(html).toContain('aria-valuetext="极高"');
    expect(html).toContain('value="3"');
    const busy = render({ models: [...base.models, haiku], selectionId: 'haiku', effort: 'high', busy: true }).html;
    const range = busy.match(/<input\b[^>]*type="range"[^>]*>/)?.[0] || '';
    expect(range).toContain('disabled=""');
  });

  it.each([{ models: [] }, { models: [base.models[2]] }])('offers settings and prevents submission without an available model', ({ models }) => {
    const { html, picker } = render({ models, selectionId: models[0]?.selectionId || '' });
    expect(picker.models).toEqual([]);
    expect(html).toContain('暂无可用的视觉模型');
    expect(html).toContain('去设置同步模型');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>投喂并反推<\/button>/);
  });
});
