import { isValidElement, type ComponentProps, type ReactElement, type ReactNode, type RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioBrandChip } from '@client/shared/ui/studio/StudioBrandChip';
import SalesStudio from './SalesStudio';
import { SalesWorkspaceNavigation } from './components/SalesWorkspaceNavigation';
import { SalesPromptWorkspace } from './components/SalesPromptWorkspace';
import { SalesOCRWorkspace } from './components/SalesOCRWorkspace';
import { SalesProductionWorkspace, type SalesProductionHandle } from './components/SalesProductionWorkspace';
import { SalesEditorNavigation } from './components/SalesEditorNavigation';
import { ProductSetupPanel } from './components/salesProductSetup';
import { SalesProductSelectionSummary } from './components/SalesProductSelectionSummary';
import { useSalesCollection } from './hooks/useSalesCollection';
import { useSalesPrompts } from './hooks/useSalesPrompts';
import { emptySalesCollection } from './model/salesCollectionDraft';

const hooks = vi.hoisted(() => ({ effects: [] as Array<() => void>, index: 0, slots: [] as unknown[], refIndex: 0, refs: [] as { current: unknown }[] }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useCallback: (fn: unknown) => fn,
  useEffect: (effect: () => void, deps: unknown[]) => {
    const index = hooks.index++;
    const previous = hooks.slots[index] as unknown[] | undefined;
    if (!previous || deps.some((value, i) => !Object.is(value, previous[i]))) hooks.effects.push(effect);
    hooks.slots[index] = deps;
  },
  useId: () => 'sales-test',
  useRef: <T>(initial: T) => {
    const index = hooks.refIndex++;
    if (!(index in hooks.refs)) hooks.refs[index] = { current: initial };
    return hooks.refs[index] as { current: T };
  },
  useState: <T>(initial: T) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = initial;
    return [hooks.slots[index], (next: T | ((previous: T) => T)) => {
      hooks.slots[index] = typeof next === 'function' ? (next as (previous: T) => T)(hooks.slots[index] as T) : next;
    }];
  },
}));
vi.mock('./hooks/useSalesCollection', () => ({ useSalesCollection: vi.fn() }));
vi.mock('./hooks/useSalesPrompts', () => ({ useSalesPrompts: vi.fn() }));

const flush = vi.fn();
const back = vi.fn();
const openLibrary = vi.fn();
let active = true;
vi.mock('@client/shared/hooks/useViewVisibility',()=>({useViewVisibility:()=>active}));
function render() {
  for (;;) {
    hooks.index = 0; hooks.refIndex = 0;
    const node = SalesStudio({ onBack: back, onOpenLibrary:openLibrary });
    if (!hooks.effects.length) return node;
    hooks.effects.splice(0).forEach((effect) => effect());
  }
}
function find<P>(node: ReactNode, type: ReactElement<P>['type']): ReactElement<P> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) { const found = find<P>(child, type); if (found) return found; }
  }
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  return node.type === type ? node as ReactElement<P> : find<P>(node.props.children, type);
}
function navigation() {
  return find<ComponentProps<typeof SalesWorkspaceNavigation>>(render(), SalesWorkspaceNavigation)!.props;
}
function promptButton() { return find<{ onClick: () => void }>(find(render(), 'header'), 'button')!.props; }
function promptEditor() { return find<ComponentProps<typeof SalesPromptWorkspace>>(render(), SalesPromptWorkspace); }
function productWorkspace() { return find<ComponentProps<typeof SalesOCRWorkspace>>(render(), SalesOCRWorkspace)!.props; }
function productionWorkspace() { return find<ComponentProps<typeof SalesProductionWorkspace>>(render(), SalesProductionWorkspace)!.props; }
function editorNavigation() { return find<ComponentProps<typeof SalesEditorNavigation>>(render(), SalesEditorNavigation)!.props; }
function prepareDeliveryWith(prepareDelivery: SalesProductionHandle['prepareDelivery'], checkDeliveryScript = vi.fn(() => true)) {
  const ref = productionWorkspace().ref as RefObject<SalesProductionHandle | null>;
  ref.current = { prepareDelivery, checkDeliveryScript };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function goBack() {
  find<ComponentProps<typeof StudioBrandChip>>(render(), StudioBrandChip)!.props.onBack();
}

beforeEach(() => {
  active = true;
  hooks.index = 0; hooks.slots = []; hooks.refIndex = 0; hooks.refs = []; vi.resetAllMocks();
  vi.stubGlobal('window', { confirm: vi.fn(() => false) });
  flush.mockReturnValue(true);
  vi.mocked(useSalesCollection, { partial: true }).mockReturnValue({ state: emptySalesCollection(), autoFaces: { pending: 0, failed: 0, retry: () => {} }, flushDraft: flush });
  vi.mocked(useSalesPrompts, { partial: true }).mockReturnValue({ hasUnsaved: false });
});
afterEach(() => vi.unstubAllGlobals());

describe('delivery navigation waits for automatic storyboard rewriting', () => {
  it.each(['top', 'bottom'] as const)('prepares delivery before advancing through the %s entry', async (entry) => {
    editorNavigation().onChange('storyboard');
    const pending = deferred<boolean>();
    const prepare = vi.fn(() => pending.promise);
    prepareDeliveryWith(prepare);
    const request = entry === 'top'
      ? editorNavigation().onChange('delivery')
      : productionWorkspace().onViewChange('delivery');
    expect(prepare).toHaveBeenCalledOnce();
    expect(productionWorkspace().deliveryStep).toBe('storyboard');
    expect(editorNavigation().view).toBe('storyboard');
    pending.resolve(true);
    await request;
    expect(editorNavigation().view).toBe('delivery');
  });

  it.each(['top', 'bottom'] as const)('keeps the storyboard when preparation fails or is canceled through the %s entry', async (entry) => {
    editorNavigation().onChange('storyboard');
    const prepare = vi.fn(async () => false);
    prepareDeliveryWith(prepare);
    if (entry === 'top') await editorNavigation().onChange('delivery');
    else await productionWorkspace().onViewChange('delivery');
    expect(prepare).toHaveBeenCalledOnce();
    expect(editorNavigation().view).toBe('storyboard');
  });

  it('keeps the storyboard open when the final script cannot be assembled and allows retry', async () => {
    editorNavigation().onChange('storyboard');
    const check = vi.fn(() => false);
    prepareDeliveryWith(vi.fn(async () => true), check);
    await productionWorkspace().onViewChange('delivery');
    expect(editorNavigation().view).toBe('storyboard');
    expect(check).toHaveBeenCalledOnce();
    expect(productionWorkspace().deliveryStep).toBeNull();
    check.mockReturnValue(true);
    await productionWorkspace().onViewChange('delivery');
    expect(editorNavigation().view).toBe('delivery');
  });

  it('coalesces repeated clicks while waiting and still advances after success', async () => {
    editorNavigation().onChange('storyboard');
    const pending = deferred<boolean>();
    const prepare = vi.fn(() => pending.promise);
    prepareDeliveryWith(prepare);
    const first = editorNavigation().onChange('delivery');
    const second = productionWorkspace().onViewChange('delivery');
    expect(prepare).toHaveBeenCalledOnce();
    pending.resolve(true);
    await Promise.all([first, second]);
    expect(editorNavigation().view).toBe('delivery');
  });

  it('does not jump to delivery after the user chooses another page during preparation', async () => {
    editorNavigation().onChange('storyboard');
    const pending = deferred<boolean>();
    prepareDeliveryWith(() => pending.promise);
    const request = editorNavigation().onChange('delivery');
    editorNavigation().onChange('summary');
    expect(editorNavigation().view).toBe('summary');
    pending.resolve(true);
    await request;
    expect(editorNavigation().view).toBe('summary');
  });

  it('keeps the product page opened by dragging a reference image while preparation finishes', async () => {
    editorNavigation().onChange('storyboard');
    const pending = deferred<boolean>();
    prepareDeliveryWith(() => pending.promise);
    const request = editorNavigation().onChange('delivery');
    const gallery = find<ComponentProps<typeof ProductSetupPanel>>(render(), ProductSetupPanel)!;
    gallery.props.onImageDragging?.('/product.jpg');
    expect(editorNavigation().view).toBe('summary');
    pending.resolve(true);
    await request;
    expect(editorNavigation().view).toBe('summary');
  });

  it('allows direct inspection when no rewriting is needed and does not prepare the already active page again', async () => {
    const prepare = vi.fn(async () => true);
    prepareDeliveryWith(prepare);
    await editorNavigation().onChange('delivery');
    expect(editorNavigation().view).toBe('delivery');
    expect(prepare).toHaveBeenCalledOnce();
    await editorNavigation().onChange('delivery');
    expect(prepare).toHaveBeenCalledOnce();
  });
});

describe('sales navigation preserves pending work', () => {
  it('opens the missing prompt directly and returns to the same storyboard draft', () => {
    const select = vi.fn();
    vi.mocked(useSalesPrompts, { partial: true }).mockReturnValue({ hasUnsaved: false, select });
    editorNavigation().onChange('storyboard');
    const state = productionWorkspace().state;
    productionWorkspace().onOpenPrompt?.('spoken-review');
    expect(flush).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledExactlyOnceWith('spoken-review');
    expect(openLibrary).not.toHaveBeenCalled();
    expect(promptEditor()).toBeDefined();
    expect(useSalesPrompts).toHaveBeenLastCalledWith(true);
    promptButton().onClick();
    expect(editorNavigation().view).toBe('storyboard');
    expect(productionWorkspace().state).toBe(state);
  });

  it('keeps the draft in place when prompt navigation cannot save it or production is running', () => {
    const select = vi.fn();
    vi.mocked(useSalesPrompts, { partial: true }).mockReturnValue({ hasUnsaved: false, select });
    flush.mockReturnValue(false);
    productionWorkspace().onOpenPrompt?.('spoken-review');
    expect(openLibrary).not.toHaveBeenCalled();
    flush.mockReturnValue(true);
    productionWorkspace().onBusyChange(true);
    productionWorkspace().onOpenPrompt?.('spoken-review');
    expect(openLibrary).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });

  it('keeps the storyboard gallery available for multiple picks until confirmation succeeds', () => {
    const state = emptySalesCollection();
    state.imageCatalog = [{ index: 0, role: 'main', url: '/selected.jpg' }];
    vi.mocked(useSalesCollection, { partial: true }).mockReturnValue({ state, autoFaces: { pending: 0, failed: 0, retry: () => {} }, flushDraft: flush });
    const galleryHidden = () => find<{ hidden: boolean }>(render(), 'aside')!.props.hidden;
    const confirm = () => find<ComponentProps<typeof ProductSetupPanel>>(render(), ProductSetupPanel)!.props.onConfirmSelection?.();
    editorNavigation().onChange('storyboard');
    state.colorSelection.confirmedImageUrls = ['/selected.jpg'];
    expect(galleryHidden()).toBe(false);
    flush.mockReturnValue(false);
    expect(confirm()).toBe(false);
    expect(galleryHidden()).toBe(false);
    flush.mockReturnValue(true);
    expect(confirm()).toBe(true);
    expect(galleryHidden()).toBe(true);
    expect(find(render(), SalesProductSelectionSummary)).toBeUndefined();
    editorNavigation().onChange('summary');
    expect(galleryHidden()).toBe(false);
    editorNavigation().onChange('storyboard');
    expect(galleryHidden()).toBe(true);
    expect(find(render(), SalesProductSelectionSummary)).toBeUndefined();
  });

  it('hides both gallery states on delivery and keeps the selected images for the storyboard', async () => {
    const state = emptySalesCollection();
    state.imageCatalog = [{ index: 0, role: 'main', url: '/selected.jpg' }];
    state.colorSelection.confirmedImageUrls = ['/selected.jpg'];
    vi.mocked(useSalesCollection, { partial: true }).mockReturnValue({ state, autoFaces: { pending: 0, failed: 0, retry: () => {} }, flushDraft: flush });
    prepareDeliveryWith(vi.fn(async () => true));
    await editorNavigation().onChange('delivery');
    expect(editorNavigation().view).toBe('delivery');
    expect(find(render(), SalesProductSelectionSummary)).toBeUndefined();
    expect(find<{ hidden: boolean }>(render(), 'aside')?.props.hidden).toBe(true);
    editorNavigation().onChange('storyboard');
    expect(find(render(), SalesProductSelectionSummary)).toBeUndefined();
    expect(find<{ hidden: boolean }>(render(), 'aside')?.props.hidden).toBe(true);
    expect(state.colorSelection.confirmedImageUrls).toEqual(['/selected.jpg']);
  });

  it('protects running production from home and asset navigation until waiting stops', () => {
    const production = () => find<ComponentProps<typeof SalesProductionWorkspace>>(render(), SalesProductionWorkspace)!.props;
    expect(productWorkspace()).not.toHaveProperty('onOpenModelSettings');
    expect(production()).not.toHaveProperty('onOpenModelSettings');
    production().onBusyChange?.(true);
    expect(find<ComponentProps<typeof StudioBrandChip>>(render(), StudioBrandChip)!.props.disabled).toBe(true);
    goBack(); navigation().onOpen(); production().onOpenStage('materials', 'sound');
    expect(openLibrary).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
    production().onBusyChange?.(false);
    goBack();
    expect(back).toHaveBeenCalledOnce();
  });
  it('keeps home navigation on the current page when saving the collection fails', () => {
    flush.mockReturnValue(false);
    goBack();
    expect(back).not.toHaveBeenCalled();
    expect(openLibrary).not.toHaveBeenCalled();
    flush.mockReturnValue(true);
    goBack();
    expect(back).toHaveBeenCalledOnce();
  });
  it('protects prompt drafts when leaving for home and keeps asset navigation available', () => {
    promptButton().onClick();
    vi.mocked(useSalesPrompts, { partial: true }).mockReturnValue({ hasUnsaved: true });
    promptButton().onClick();
    expect(openLibrary).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
    goBack();
    expect(back).not.toHaveBeenCalled();
    expect(window.confirm).toHaveBeenCalledOnce();
    vi.mocked(window.confirm).mockReturnValue(true);
    goBack();
    expect(back).toHaveBeenCalledOnce();
  });
  it('loads prompts only on entry and retains the section and draft manager across workspace switches', () => {
    expect(promptEditor()).toBeUndefined();
    expect(useSalesPrompts).toHaveBeenLastCalledWith(false);
    promptButton().onClick();
    expect(promptEditor()).toBeDefined();
    expect(useSalesPrompts).toHaveBeenLastCalledWith(true);
    vi.mocked(useSalesPrompts, { partial: true }).mockReturnValue({ hasUnsaved: true });
    navigation().onOpen();
    expect(openLibrary).toHaveBeenLastCalledWith(undefined);
    active = false;
    expect(promptEditor()).toBeUndefined();
    expect(useSalesPrompts).toHaveBeenLastCalledWith(false);
    active = true;
    expect(productionWorkspace().refreshVersion).toBe(1);
    promptButton().onClick();
    expect(promptEditor()?.props.manager.hasUnsaved).toBe(true);
    promptButton().onClick();
    expect(productionWorkspace().refreshVersion).toBe(2);
    expect(window.confirm).not.toHaveBeenCalled();
  });
  it('opens the correct asset section from existing production shortcuts', () => {
    productionWorkspace().onOpenStage('materials');
    expect(openLibrary).toHaveBeenLastCalledWith('persona');
    active = true;
    productionWorkspace().onOpenStage('scripts');
    expect(openLibrary).toHaveBeenLastCalledWith('script');
  });
  it.each(['persona', 'scene', 'sound'] as const)('opens the %s library directly from its production setting', (section) => {
    productionWorkspace().onOpenStage('materials', section);
    expect(openLibrary).toHaveBeenLastCalledWith(section);
  });
});
