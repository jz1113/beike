import { isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioBrandChip } from '@client/shared/ui/studio/StudioBrandChip';
import SalesStudio from './SalesStudio';
import { SalesWorkspaceNavigation } from './components/SalesWorkspaceNavigation';
import { SalesScriptWorkspace } from './components/SalesScriptWorkspace';
import { SalesMaterialWorkspace } from './components/SalesMaterialWorkspace';
import { SalesOCRWorkspace } from './components/SalesOCRWorkspace';
import { SalesProductionWorkspace } from './components/SalesProductionWorkspace';
import { SalesEditorNavigation } from './components/SalesEditorNavigation';
import { SalesProductSelectionSummary } from './components/SalesProductSelectionSummary';
import { useSalesCollection } from './hooks/useSalesCollection';
import { useSalesPrompts } from './hooks/useSalesPrompts';
import { emptySalesCollection } from './model/salesCollectionDraft';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[] }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useCallback: (fn: unknown) => fn,
  useEffect: () => {},
  useId: () => 'sales-test',
  useRef: () => ({ current: null }),
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
function render() { hooks.index = 0; return SalesStudio({ onBack: back }); }
function find<P>(node: ReactNode, type: ReactElement<P>['type']): ReactElement<P> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) { const found = find<P>(child, type); if (found) return found; }
  }
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  return node.type === type ? node as ReactElement<P> : find<P>(node.props.children, type);
}
function navigation() { return find<ComponentProps<typeof SalesWorkspaceNavigation>>(render(), SalesWorkspaceNavigation)!.props; }
function scripts() { return find<ComponentProps<typeof SalesScriptWorkspace>>(render(), SalesScriptWorkspace)!.props; }
function assets() { return find<ComponentProps<typeof SalesMaterialWorkspace>>(render(), SalesMaterialWorkspace)!.props; }
function productWorkspace() { return find<ComponentProps<typeof SalesOCRWorkspace>>(render(), SalesOCRWorkspace)!.props; }
function productionWorkspace() { return find<ComponentProps<typeof SalesProductionWorkspace>>(render(), SalesProductionWorkspace)!.props; }
function goBack() { find<ComponentProps<typeof StudioBrandChip>>(render(), StudioBrandChip)!.props.onBack(); }

beforeEach(() => {
  hooks.index = 0; hooks.slots = []; vi.resetAllMocks();
  vi.stubGlobal('window', { confirm: vi.fn(() => false) });
  flush.mockReturnValue(true);
  vi.mocked(useSalesCollection, { partial: true }).mockReturnValue({ state: emptySalesCollection(), flushDraft: flush });
  vi.mocked(useSalesPrompts, { partial: true }).mockReturnValue({ hasUnsaved: false });
});
afterEach(() => vi.unstubAllGlobals());

describe('sales navigation preserves pending work', () => {
  it('gives storyboard editing room after reference images are chosen and lets users reopen the gallery', () => {
    const state = emptySalesCollection();
    state.colorSelection.confirmedImageUrls = ['/selected-product.jpg'];
    vi.mocked(useSalesCollection, { partial: true }).mockReturnValue({ state, flushDraft: flush });
    const editor = () => find<ComponentProps<typeof SalesEditorNavigation>>(render(), SalesEditorNavigation)!.props;
    const summary = () => find<ComponentProps<typeof SalesProductSelectionSummary>>(render(), SalesProductSelectionSummary);
    expect(summary()).toBeUndefined();
    editor().onChange('storyboard');
    expect(summary()).toBeDefined();
    expect(editor().view).toBe('storyboard');
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    summary()!.props.onExpand();
    expect(summary()).toBeUndefined();
    expect(state.colorSelection.confirmedImageUrls).toEqual(['/selected-product.jpg']);
  });

  it('protects running production from home and asset navigation until waiting stops', () => {
    const production = () => find<ComponentProps<typeof SalesProductionWorkspace>>(render(), SalesProductionWorkspace)!.props;
    expect(productWorkspace()).not.toHaveProperty('onOpenModelSettings');
    expect(production()).not.toHaveProperty('onOpenModelSettings');
    production().onBusyChange?.(true);
    expect(find<ComponentProps<typeof StudioBrandChip>>(render(), StudioBrandChip)!.props.disabled).toBe(true);
    goBack(); navigation().onChange('assets'); production().onOpenStage('materials', 'sound');
    expect(navigation().workspace).toBe('workflow');
    expect(back).not.toHaveBeenCalled();
    production().onBusyChange?.(false);
    goBack();
    expect(back).toHaveBeenCalledOnce();
  });
  it('keeps home navigation on the current page when saving the collection fails', () => {
    flush.mockReturnValue(false);
    goBack();
    expect(back).not.toHaveBeenCalled();
    expect(navigation().workspace).toBe('workflow');
    flush.mockReturnValue(true);
    goBack();
    expect(back).toHaveBeenCalledOnce();
  });
  it('retains an edited script on canceled navigation and blocks navigation while saving', () => {
    navigation().onChange('assets');
    expect(assets().section).toBe('script');
    scripts().onDraftStateChange?.(true, false);
    assets().onSectionChange('prompts'); goBack();
    expect(navigation().workspace).toBe('assets');
    expect(assets().section).toBe('script');
    expect(back).not.toHaveBeenCalled();
    scripts().onDraftStateChange?.(true, true);
    vi.mocked(window.confirm).mockClear().mockReturnValue(true);
    navigation().onChange('workflow'); assets().onSectionChange('prompts'); goBack();
    expect(navigation().disabled).toBe(true);
    expect(assets().navigationDisabled).toBe(true);
    expect(navigation().workspace).toBe('assets');
    expect(assets().section).toBe('script');
    expect(window.confirm).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
    scripts().onDraftStateChange?.(true, false);
    assets().onSectionChange('prompts');
    expect(assets().section).toBe('prompts');
  });
  it('keeps saved scripts in the library until the user switches to production', () => {
    navigation().onChange('assets');
    assets().onSectionChange('script');
    scripts().onDraftStateChange?.(true, true);
    scripts().onDraftStateChange?.(false, false);
    expect(navigation().workspace).toBe('assets');
    navigation().onChange('workflow');
    expect(navigation().workspace).toBe('workflow');
    expect(window.confirm).not.toHaveBeenCalled();
  });
  it('protects prompt drafts when leaving for home and keeps asset navigation available', () => {
    navigation().onChange('assets');
    assets().onSectionChange('prompts');
    vi.mocked(useSalesPrompts, { partial: true }).mockReturnValue({ hasUnsaved: true });
    navigation().onChange('workflow');
    expect(navigation().workspace).toBe('workflow');
    expect(window.confirm).not.toHaveBeenCalled();
    goBack();
    expect(back).not.toHaveBeenCalled();
    expect(window.confirm).toHaveBeenCalledOnce();
    vi.mocked(window.confirm).mockReturnValue(true);
    goBack();
    expect(back).toHaveBeenCalledOnce();
  });
  it('loads prompts only on entry and retains the section and draft manager across workspace switches', () => {
    navigation().onChange('assets');
    expect(useSalesPrompts).toHaveBeenLastCalledWith(false);
    assets().onSectionChange('prompts');
    expect(assets().section).toBe('prompts');
    expect(useSalesPrompts).toHaveBeenLastCalledWith(true);
    vi.mocked(useSalesPrompts, { partial: true }).mockReturnValue({ hasUnsaved: true });
    navigation().onChange('assets');
    expect(assets().section).toBe('prompts');
    expect(assets().promptsUnsaved).toBe(true);
    navigation().onChange('workflow');
    const version = productionWorkspace().refreshVersion;
    expect(version).toBe(1);
    expect(useSalesPrompts).toHaveBeenLastCalledWith(false);
    navigation().onChange('assets');
    expect(assets().section).toBe('prompts');
    expect(assets().promptsUnsaved).toBe(true);
    assets().onSectionChange('persona');
    expect(assets().section).toBe('persona');
    expect(assets().promptsUnsaved).toBe(true);
    expect(window.confirm).not.toHaveBeenCalled();
  });
  it('opens the correct asset section from existing production shortcuts', () => {
    productionWorkspace().onOpenStage('materials');
    expect(navigation().workspace).toBe('assets');
    expect(assets().section).toBe('persona');
    navigation().onChange('workflow');
    productionWorkspace().onOpenStage('scripts');
    expect(navigation().workspace).toBe('assets');
    expect(assets().section).toBe('script');
  });
  it.each(['persona', 'scene', 'sound'] as const)('opens the %s library directly from its production setting', (section) => {
    productionWorkspace().onOpenStage('materials', section);
    expect(navigation().workspace).toBe('assets');
    expect(assets().section).toBe(section);
  });
});
