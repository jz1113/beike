import { Children, createElement, isValidElement, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewVisibilityContext } from '@client/shared/hooks/useViewVisibility';
import { SkillGuideDialog, type SkillGuideItem } from './SkillGuideDialog';
import { SkillGuideDocumentView } from './SkillGuideDocumentView';

const state = vi.hoisted(() => ({
  openId: null as string | null, tab: 'overview', copyState: 'idle',
  setOpenId: vi.fn(), setTab: vi.fn(), setCopyState: vi.fn(),
}));
vi.mock('react', async (original) => {
  const react = await original<typeof import('react')>();
  return {
    ...react,
    useState: (initial: unknown) => {
      if (initial === null) return [state.openId, state.setOpenId];
      if (initial === 'overview') return [state.tab, state.setTab];
      if (initial === 'idle') return [state.copyState, state.setCopyState];
      return react.useState(initial);
    },
  };
});

const item: SkillGuideItem = {
  id: 'example', title: '示例规则', summary: '规则摘要', appliesWhen: '封面',
  input: '商品图', output: '一张封面', flow: ['准备', '生成'],
  sections: [{ heading: '规则', body: ['保持商品一致'] }], mark: null,
};
const document = {
  name: 'example-skill', filename: 'SKILL.md', source: '---\nname: example-skill\n---\n# 完整文档正文\n',
  body: '# 完整文档正文', overview: createElement('p', null, '概览说明'),
};
const base = { title: '技能说明', status: '适用说明', items: [item], layout: 'grid' as const, onClose: () => {} };

function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap((child) => isValidElement<Record<string, unknown>>(child) ? [child, ...nodes(child.props.children as ReactNode)] : []);
}
function findNode(tree: ReactNode, predicate: (node: ReactElement<Record<string, unknown>>) => boolean) {
  const node = nodes(tree).find(predicate);
  expect(node).toBeDefined();
  return node!;
}
function capture(render: () => ReactNode) {
  let tree: ReactNode = null;
  function Capture() { tree = render(); return tree; }
  const html = renderToStaticMarkup(createElement(Capture));
  return { tree, html };
}
function keyEvent(key: string, overrides: Record<string, unknown> = {}) {
  return { key, defaultPrevented: false, nativeEvent: { isComposing: false }, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...overrides };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  state.openId = null;
  state.tab = 'overview';
  state.copyState = 'idle';
});

afterEach(() => vi.unstubAllGlobals());

describe('skill guide dialog rendering', () => {
  it('keeps existing cards content-sized with a single scroll region', () => {
    const html = renderToStaticMarkup(createElement(SkillGuideDialog, base));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('示例规则');
    expect(html).toContain('查看详情');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('max-w-[840px]');
    expect(html).toContain('max-h-[calc(100dvh-2rem)]');
    expect(html).not.toContain('h-[min(740px');
    expect(html.match(/overflow-y-auto/g)).toHaveLength(1);
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('复制技能文件');
  });

  it('mounts a card document only when its details are open, without nesting scroll areas', () => {
    const props = { ...base, items: [{ ...item, document }] };
    const closed = renderToStaticMarkup(createElement(SkillGuideDialog, props));
    expect(closed).not.toContain('完整文档正文');
    expect(closed).not.toContain('复制完整 SKILL.md');
    state.openId = item.id;
    const open = renderToStaticMarkup(createElement(SkillGuideDialog, props));
    expect(open).toContain('完整文档正文');
    expect(open).toContain('example-skill');
    expect(open).toContain('保持商品一致');
    expect(open).toContain('aria-label="复制完整 SKILL.md 文件"');
    expect(open).toContain('aria-expanded="true"');
    expect(open.match(/overflow-y-auto/g)).toHaveLength(1);
    expect(open).not.toContain('role="tablist"');
    expect(open).not.toContain('h-[min(740px');
    expect(open).not.toContain('name: example-skill');
  });

  it('keeps document mode tabs and defers the inactive document body', () => {
    const html = renderToStaticMarkup(createElement(SkillGuideDialog, { ...base, document }));
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="技能视图"');
    expect(html).toContain('role="tab" aria-selected="true"');
    expect(html).toContain('role="tab" aria-selected="false"');
    expect(html).toMatch(/role="tabpanel"[^>]*hidden=""/);
    expect(html).toContain('概览说明');
    expect(html).not.toContain('完整文档正文');
    expect(html).toContain('aria-label="复制完整 SKILL.md 文件"');
    expect(html).toContain('aria-disabled="false" aria-busy="false"');
    expect(html).not.toContain(' disabled=');
    expect(html).toContain('max-w-[800px]');
    expect(html).not.toContain('查看详情');
    expect(html).not.toContain('示例规则');
    state.tab = 'document';
    const selected = renderToStaticMarkup(createElement(SkillGuideDialog, { ...base, document }));
    expect(selected).toContain('完整文档正文');
    expect(selected).toContain('example-skill');
    expect(selected).not.toContain('概览说明');
    expect(selected).not.toContain('name: example-skill');
  });

  it('suspends dialogs in hidden kept-alive views', () => {
    const html = renderToStaticMarkup(createElement(ViewVisibilityContext.Provider, { value: false }, createElement(SkillGuideDialog, { ...base, document })));
    expect(html).toBe('');
  });
});

describe('skill guide interactions', () => {
  it('returns focus to the card toggle when details collapse', () => {
    state.openId = item.id;
    const focus = vi.fn();
    const getElementById = vi.fn(() => ({ focus }));
    vi.stubGlobal('document', { getElementById });
    const { tree } = capture(() => SkillGuideDialog(base));
    const detail = findNode(tree, (node) => typeof node.props.onCollapse === 'function');
    (detail.props.onCollapse as () => void)();
    expect(state.setOpenId).toHaveBeenCalledWith(null);
    expect(getElementById).toHaveBeenCalledWith(expect.stringMatching(/-toggle-example$/));
    expect(focus).toHaveBeenCalledOnce();
  });

  it('closes on Escape while ignoring an input-method composition', () => {
    const onClose = vi.fn();
    const { tree } = capture(() => SkillGuideDialog({ ...base, onClose }));
    const dialog = findNode(tree, (node) => node.props.role === 'dialog');
    const handler = dialog.props.onKeyDown as (event: KeyboardEvent<HTMLElement>) => void;
    const composing = keyEvent('Escape', { nativeEvent: { isComposing: true } });
    handler(composing as unknown as KeyboardEvent<HTMLElement>);
    expect(onClose).not.toHaveBeenCalled();
    const escape = keyEvent('Escape');
    handler(escape as unknown as KeyboardEvent<HTMLElement>);
    expect(onClose).toHaveBeenCalledOnce();
    expect(escape.preventDefault).toHaveBeenCalledOnce();
    expect(escape.stopPropagation).toHaveBeenCalledOnce();
  });

  it('wraps Tab focus inside the dialog and skips hidden or aria-disabled controls', () => {
    const control = (visible = true, disabled = false) => ({ tabIndex: 0, getClientRects: () => visible ? [{}] : [], getAttribute: () => disabled ? 'true' : null, focus: vi.fn() });
    const first = control();
    const last = control();
    const hidden = control(false);
    const disabled = control(true, true);
    const currentTarget = { querySelectorAll: () => [first, hidden, last, disabled] };
    const { tree } = capture(() => SkillGuideDialog(base));
    const dialog = findNode(tree, (node) => node.props.role === 'dialog');
    const handler = dialog.props.onKeyDown as (event: KeyboardEvent<HTMLElement>) => void;
    vi.stubGlobal('document', { activeElement: last });
    const forward = keyEvent('Tab', { currentTarget });
    handler(forward as unknown as KeyboardEvent<HTMLElement>);
    expect(first.focus).toHaveBeenCalledOnce();
    expect(forward.preventDefault).toHaveBeenCalledOnce();
    vi.stubGlobal('document', { activeElement: first });
    handler(keyEvent('Tab', { currentTarget, shiftKey: true }) as unknown as KeyboardEvent<HTMLElement>);
    expect(last.focus).toHaveBeenCalledOnce();
    expect(hidden.focus).not.toHaveBeenCalled();
    expect(disabled.focus).not.toHaveBeenCalled();
  });

  it('preserves arrow-key tab navigation and moves focus to the selected tab', () => {
    const { tree } = capture(() => SkillGuideDocumentView({ document, uid: 'test' }));
    const tablist = findNode(tree, (node) => node.props.role === 'tablist');
    const focus = vi.fn();
    (tablist.props.ref as { current: unknown }).current = { querySelectorAll: () => [{ focus: vi.fn() }, { focus }] };
    const event = keyEvent('ArrowRight');
    (tablist.props.onKeyDown as (event: KeyboardEvent<HTMLDivElement>) => void)(event as unknown as KeyboardEvent<HTMLDivElement>);
    expect(state.setTab).toHaveBeenCalledWith('document');
    expect(focus).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('copies the complete original file including metadata and trailing whitespace', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const { tree } = capture(() => SkillGuideDocumentView({ document, uid: 'test', mode: 'inline' }));
    const button = findNode(tree, (node) => node.props['aria-label'] === '复制完整 SKILL.md 文件');
    (button.props.onClick as () => void)();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith(document.source);
    expect(state.setCopyState).toHaveBeenNthCalledWith(1, 'copying');
    expect(state.setCopyState).toHaveBeenLastCalledWith('copied');
  });

  it('reports clipboard failures and keeps an in-progress copy button focusable', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('clipboard denied'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const { tree } = capture(() => SkillGuideDocumentView({ document, uid: 'test', mode: 'inline' }));
    const button = findNode(tree, (node) => node.props['aria-label'] === '复制完整 SKILL.md 文件');
    (button.props.onClick as () => void)();
    await Promise.resolve();
    expect(state.setCopyState).toHaveBeenLastCalledWith('error');
    state.copyState = 'error';
    expect(renderToStaticMarkup(createElement(SkillGuideDocumentView, { document, uid: 'test', mode: 'inline' }))).toContain('复制失败，请重试');
    state.copyState = 'copying';
    const copying = capture(() => SkillGuideDocumentView({ document, uid: 'test', mode: 'inline' }));
    expect(copying.html).toContain('aria-disabled="true" aria-busy="true"');
    expect(copying.html).not.toContain(' disabled=');
    const busyButton = findNode(copying.tree, (node) => node.props['aria-label'] === '复制完整 SKILL.md 文件');
    (busyButton.props.onClick as () => void)();
    expect(writeText).toHaveBeenCalledOnce();
  });
});

describe('in-place skill detail page', () => {
  const page = { ...base, layout: 'compact' as const, detailMode: 'page' as const, items: [{ ...item, document }] };

  it('replaces the compact overview instead of appending details below', () => {
    const closed = renderToStaticMarkup(createElement(SkillGuideDialog, page));
    expect(closed).toContain('示例规则');
    expect(closed).toContain('查看详情');
    expect(closed).toContain('max-w-[560px]');
    expect(closed).toContain('h-9 w-9');
    expect(closed).not.toContain('完整文档正文');
    expect(closed).not.toContain('max-w-[840px]');
    expect(closed.match(/overflow-y-auto/g)).toHaveLength(1);
    state.openId = item.id;
    const open = renderToStaticMarkup(createElement(SkillGuideDialog, page));
    expect(open).toContain('返回');
    expect(open).toContain('完整文档正文');
    expect(open).toContain('example-skill');
    expect(open).toContain('保持商品一致');
    expect(open).toContain('max-w-[720px]');
    expect(open).toContain('h-[min(720px,calc(100dvh-2rem))]');
    expect(open).not.toContain('查看详情');
    expect(open).not.toContain('max-w-[560px]');
    expect(open).not.toContain('name: example-skill');
    expect(open.match(/overflow-y-auto/g)).toHaveLength(1);
  });

  it('moves focus into the detail page and restores the overview button', async () => {
    const focus = vi.fn();
    const getElementById = vi.fn(() => ({ focus }));
    vi.stubGlobal('document', { getElementById });
    const { tree } = capture(() => SkillGuideDialog(page));
    const card = findNode(tree, (node) => typeof node.props.onToggle === 'function');
    (card.props.onToggle as () => void)();
    await Promise.resolve();
    expect(state.setOpenId).toHaveBeenCalledWith(item.id);
    expect(getElementById).toHaveBeenCalledWith(expect.stringMatching(/-detail-example$/));
    expect(focus).toHaveBeenCalledOnce();

    state.openId = item.id;
    focus.mockClear();
    getElementById.mockClear();
    const open = capture(() => SkillGuideDialog(page));
    const back = findNode(open.tree, (node) => node.type === 'button' && renderToStaticMarkup(node).includes('返回'));
    (back.props.onClick as () => void)();
    await Promise.resolve();
    expect(state.setOpenId).toHaveBeenCalledWith(null);
    expect(getElementById).toHaveBeenCalledWith(expect.stringMatching(/-toggle-example$/));
    expect(focus).toHaveBeenCalledOnce();
  });

  it('copies the original skill file from the detail page', async () => {
    state.openId = item.id;
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const { tree } = capture(() => {
      const dialog = SkillGuideDialog(page);
      const detail = findNode(dialog, (node) => typeof node.props.detailId === 'string');
      const detailTree = (detail.type as (props: object) => ReactNode)(detail.props);
      const documentView = findNode(detailTree, (node) => node.props.mode === 'inline');
      return (documentView.type as (props: object) => ReactNode)(documentView.props);
    });
    const button = findNode(tree, (node) => node.props['aria-label'] === '复制完整 SKILL.md 文件');
    (button.props.onClick as () => void)();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith(document.source);
    expect(state.setCopyState).toHaveBeenLastCalledWith('copied');
  });
});
