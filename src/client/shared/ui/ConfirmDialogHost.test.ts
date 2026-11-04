import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { confirmAction } from '@client/shared/utils/confirmAction';
import { ConfirmDialogHost } from './ConfirmDialogHost';

const hooks = vi.hoisted(() => ({
  index: 0, slots: [] as unknown[],
  effects: [] as { run: () => void | (() => void); state: { cleanup?: () => void } }[],
}));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: <T>(initial: T | (() => T)) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
    return [hooks.slots[index], (next: T | ((current: T) => T)) => {
      hooks.slots[index] = typeof next === 'function' ? (next as (current: T) => T)(hooks.slots[index] as T) : next;
    }];
  },
  useRef: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useCallback: <T>(callback: T, deps: readonly unknown[]) => {
    const index = hooks.index++;
    const previous = hooks.slots[index] as { value: T; deps: readonly unknown[] } | undefined;
    if (!previous || deps.length !== previous.deps.length || deps.some((value, offset) => !Object.is(value, previous.deps[offset]))) {
      hooks.slots[index] = { value: callback, deps };
    }
    return (hooks.slots[index] as { value: T }).value;
  },
  useEffect: (run: () => void | (() => void), deps?: readonly unknown[]) => {
    const index = hooks.index++;
    const previous = hooks.slots[index] as { kind: 'effect'; deps?: readonly unknown[]; cleanup?: () => void } | undefined;
    if (!previous || !deps || !previous.deps || deps.length !== previous.deps.length || deps.some((value, offset) => !Object.is(value, previous.deps![offset]))) {
      const state = { kind: 'effect' as const, deps, cleanup: previous?.cleanup };
      hooks.slots[index] = state;
      hooks.effects.push({ run, state });
    }
  },
}));
vi.mock('react-dom', async (original) => ({
  ...await original<typeof import('react-dom')>(),
  createPortal: vi.fn((child: ReactNode) => child),
}));

type Element = ReactElement<Record<string, unknown>>;
type NativeNode = {
  open: boolean; isConnected: boolean; showModal: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>; contains: (node: unknown) => boolean;
};
let tree: ReactNode;
let activeElement: NativeNode | null;
const nativeNodes = new Map<string, NativeNode>();
let elementInstances = new WeakMap<Record<string, unknown>, NativeNode>();
const browserWindow = { addEventListener: vi.fn(), removeEventListener: vi.fn(), confirm: vi.fn(() => false) };
const browserDocument = { body: {}, get activeElement() { return activeElement; } };

function nodes(root: ReactNode): Element[] {
  return Children.toArray(root).flatMap((child) => isValidElement<Record<string, unknown>>(child) ? [child, ...nodes(child.props.children as ReactNode)] : []);
}
function find(predicate: (element: Element) => boolean) {
  const found = nodes(tree).find(predicate);
  expect(found).toBeDefined();
  return found!;
}
function button(text: string) {
  return find((element) => element.type === 'button' && element.props.children === text);
}
function nativeNode(key: string): NativeNode {
  let result = nativeNodes.get(key);
  if (!result) {
    const node: NativeNode = {
      open: false, isConnected: true,
      showModal: vi.fn(() => { node.open = true; }), close: vi.fn(() => { node.open = false; }),
      focus: vi.fn(() => { activeElement = node; }), contains: (value) => value === node,
    };
    nativeNodes.set(key, node);
    result = node;
  }
  return result;
}
function mountRefs() {
  nodes(tree).forEach((element, index) => {
    if (typeof element.type !== 'string') return;
    const key = element.type === 'dialog' ? 'dialog' : `${element.type}:${String(element.props.children)}:${index}`;
    const ref = element.props.ref;
    const instance = nativeNode(key);
    elementInstances.set(element.props, instance);
    if (typeof ref === 'function') ref(instance);
    else if (ref && typeof ref === 'object' && 'current' in ref) ref.current = instance;
  });
}
function render() {
  hooks.index = 0;
  tree = ConfirmDialogHost();
  mountRefs();
  hooks.effects.splice(0).forEach(({ run, state }) => {
    state.cleanup?.();
    state.cleanup = run() || undefined;
  });
  return tree;
}
function unmount() {
  [...hooks.slots].reverse().forEach((slot) => {
    if (slot && typeof slot === 'object' && 'kind' in slot && slot.kind === 'effect' && 'cleanup' in slot) {
      (slot.cleanup as (() => void) | undefined)?.();
    }
  });
  hooks.slots = [];
  tree = null;
}
function click(element: Element) { (element.props.onClick as () => void)(); }
function event(key?: string) {
  return { key, preventDefault: vi.fn(), stopPropagation: vi.fn(), nativeEvent: { isComposing: false }, isComposing: false };
}

beforeEach(() => {
  vi.clearAllMocks();
  hooks.index = 0; hooks.slots = []; hooks.effects = [];
  nativeNodes.clear(); elementInstances = new WeakMap(); activeElement = null;
  vi.stubGlobal('document', browserDocument);
  vi.stubGlobal('window', browserWindow);
  render();
});
afterEach(() => { unmount(); vi.unstubAllGlobals(); });

it('opens the confirmation with the native modal API in a body portal', async () => {
  const result = confirmAction({ title: '删除人物？', confirmText: '确认删除' });
  render();
  const dialog = find((element) => element.type === 'dialog');
  expect(String(dialog.props['aria-modal'])).toBe('true');
  expect(createPortal).toHaveBeenLastCalledWith(expect.anything(), browserDocument.body);
  expect(nativeNode('dialog').showModal).toHaveBeenCalledOnce();
  expect(nativeNode('dialog').open).toBe(true);
  click(button('取消')); render();
  await expect(result).resolves.toBe(false);
  expect(nativeNode('dialog').close).toHaveBeenCalledOnce();
});

it('settles explicit cancellation and confirmation with the selected result', async () => {
  const cancelled = confirmAction({ title: '确认操作', confirmText: '继续' });
  render(); click(button('取消')); render();
  await expect(cancelled).resolves.toBe(false);
  const confirmed = confirmAction({ title: '确认操作', confirmText: '继续' });
  render(); click(button('继续')); render();
  await expect(confirmed).resolves.toBe(true);
});

it('treats a native Escape cancellation as false without closing the underlying asset dialog', async () => {
  const assetDialog = nativeNode('asset-dialog'); assetDialog.open = true;
  const result = confirmAction({ title: '删除人物？' });
  render();
  const cancellation = event('Escape');
  (find((element) => element.type === 'dialog').props.onCancel as (value: typeof cancellation) => void)(cancellation);
  render();
  await expect(result).resolves.toBe(false);
  expect(cancellation.preventDefault).toHaveBeenCalledOnce();
  expect(cancellation.stopPropagation).toHaveBeenCalledOnce();
  expect(assetDialog.open).toBe(true);
  expect(assetDialog.close).not.toHaveBeenCalled();
});

it.each([{ title: '删除人物？' }, { title: '清空当前内容？', danger: true }])('focuses cancellation first for destructive actions: $title', async (options) => {
  const result = confirmAction(options);
  render();
  const cancel = elementInstances.get(button('取消').props)!;
  expect(cancel.focus).toHaveBeenCalledOnce();
  expect(activeElement).toBe(cancel);
  click(button('取消')); await expect(result).resolves.toBe(false);
});

it('focuses confirmation for an ordinary action', async () => {
  const result = confirmAction({ title: '继续编辑？', confirmText: '继续' });
  render();
  const confirm = elementInstances.get(button('继续').props)!;
  expect(confirm.focus).toHaveBeenCalledOnce();
  expect(activeElement).toBe(confirm);
  click(button('取消')); await expect(result).resolves.toBe(false);
});

it('keeps Enter local and lets the focused cancel button decide a destructive action', async () => {
  const result = confirmAction({ title: '删除人物？' });
  const settled = vi.fn(); void result.then(settled);
  render();
  const key = event('Enter');
  (find((element) => element.type === 'dialog').props.onKeyDown as (value: typeof key) => void)(key);
  await Promise.resolve();
  expect(key.stopPropagation).toHaveBeenCalledOnce();
  expect(settled).not.toHaveBeenCalled();
  expect(browserWindow.addEventListener.mock.calls.some(([name]) => name === 'keydown')).toBe(false);
  click(button('取消')); await expect(result).resolves.toBe(false);
});

it('cancels the previous unresolved request when another confirmation replaces it', async () => {
  const previous = confirmAction({ title: '旧操作' });
  render();
  const current = confirmAction({ title: '新操作', confirmText: '继续' });
  render();
  await expect(previous).resolves.toBe(false);
  click(button('继续')); await expect(current).resolves.toBe(true);
});

it('cancels an unresolved confirmation and closes the modal when the host unmounts', async () => {
  const result = confirmAction({ title: '未完成操作' });
  render();
  unmount();
  await expect(result).resolves.toBe(false);
  expect(nativeNode('dialog').close).toHaveBeenCalledOnce();
  await expect(confirmAction('宿主已卸载')).resolves.toBe(false);
  expect(browserWindow.confirm).toHaveBeenCalledOnce();
});
