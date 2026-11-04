import { isValidElement, type ReactNode, type ReactElement, type Ref } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptySalesCollection } from '../model/salesCollectionDraft';
import { patchSalesScript } from '../api/salesScripts';
import type { SalesLibraryChoice } from '../model/salesWorkspace';
import { SalesProductionWorkspace, type SalesProductionHandle } from './SalesProductionWorkspace';

const workflow = vi.hoisted(() => ({
  prepareDelivery: vi.fn(),
  selectPersona: vi.fn(),
  patchPlan: vi.fn(),
  runEffects:false,
  textModels: vi.fn(),
  visionModels: vi.fn(),
  error: '',
  errorPromptId: '',
}));

vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useEffect: (fn:()=>void) => { if (workflow.runEffects) fn(); },
  useRef: <T>(current:T) => ({current}),
  useCallback: <T>(fn:T) => fn,
  useState: <T>(initial: T | (() => T)) => [typeof initial === 'function' ? (initial as () => T)() : initial, vi.fn()],
  // Run the component's real handle factory so the test exercises its model forwarding.
  useImperativeHandle: <T>(ref: Ref<T> | undefined, create: () => T) => {
    const handle = create();
    if (typeof ref === 'function') ref(handle);
    else if (ref) ref.current = handle;
  },
}));
vi.mock('../hooks/useSalesProduction', () => ({
  useSalesProduction: () => ({
    prepareDelivery: workflow.prepareDelivery, scripts: [], activeScript: null, assembled: null,
    selectPersona:workflow.selectPersona, patchPlan:workflow.patchPlan, busy: '', error: workflow.error, errorPromptId: workflow.errorPromptId, notice: '',
  }),
}));
vi.mock('../hooks/useSalesTextModels', () => ({ useSalesTextModels: workflow.textModels }));
vi.mock('../hooks/useSalesSummaryModels', () => ({ useSalesSummaryModels: workflow.visionModels }));
vi.mock('../hooks/useSalesScriptTaxonomy', () => ({ useSalesScriptTaxonomy: () => ({ items: [], refresh: vi.fn() }) }));
vi.mock('../api/salesScripts', () => ({ patchSalesScript: vi.fn() }));
vi.mock('@client/shared/ui/studio/StudioSheet', () => ({ StudioSheet: () => null }));
vi.mock('./SalesAssetBindingPanel', () => ({ SalesAssetBindingPanel: () => null }));
vi.mock('./SalesBottomActionBar', () => ({ SalesBottomActionBar: () => null }));
vi.mock('./SalesFinalPromptPanel', () => ({ SalesFinalPromptPanel: () => null }));
vi.mock('./SalesMusicPicker', () => ({ SalesMusicPicker: () => null }));
vi.mock('./SalesPlanAdaptPanel', () => ({ SalesPlanAdaptPanel: () => null }));
vi.mock('./SalesPresentationModePanel', () => ({ SalesPresentationModePanel: () => null }));
vi.mock('./SalesStoryboardBottomBar', () => ({ SalesStoryboardBottomBar: () => null }));
vi.mock('./SalesVideoSettings', () => ({ SalesVideoSettings: () => null }));

beforeEach(() => { vi.resetAllMocks(); workflow.error = ''; workflow.errorPromptId = ''; workflow.runEffects = false; });

function promptButton(node: ReactNode): ReactElement<{ onClick: () => void }> | undefined {
  if (Array.isArray(node)) return node.map(promptButton).find(Boolean);
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  if (node.type === 'button' && node.props.children === '去配置提示词') return node as ReactElement<{ onClick: () => void }>;
  return promptButton(node.props.children);
}

describe('automatic delivery preparation model selection', () => {
  it('offers a direct prompt action only for a configuration error', () => {
    workflow.textModels.mockReturnValue({ model: 'text' });
    const onOpenPrompt = vi.fn();
    const render = () => SalesProductionWorkspace({ active: true, sourceBusy: false, refreshVersion: 0,
      view: 'storyboard', state: emptySalesCollection(), onViewChange: vi.fn(), onBusyChange: vi.fn(),
      onChange: vi.fn(), onOpenStage: vi.fn(), onOpenPrompt });
    workflow.error = '尚未保存「口播语义验收」';
    workflow.errorPromptId = 'spoken-review';
    promptButton(render())!.props.onClick();
    expect(onOpenPrompt).toHaveBeenCalledExactlyOnceWith('spoken-review');
    workflow.error = '后台尚未提供验收规则，请重启';
    workflow.errorPromptId = '';
    expect(promptButton(render())).toBeUndefined();
    workflow.error = '';
    expect(promptButton(render())).toBeUndefined();
  });

  it('forwards the configured text entry ID through the exposed handle instead of a bare model or legacy vision selection', async () => {
    const customEntry = 'custom-chat-entry-42';
    const upstreamModel = 'vendor/new-text-model';
    const state = { ...emptySalesCollection(), summaryModel: upstreamModel };
    workflow.textModels.mockReturnValue({ model: customEntry, options: [{ id: customEntry, upstreamId: upstreamModel, name: '新增改写模型' }] });
    workflow.visionModels.mockReturnValue({ model: 'legacy-vision-entry', options: [] });
    workflow.prepareDelivery.mockResolvedValue(true);
    const ref: { current: SalesProductionHandle | null } = { current: null };

    SalesProductionWorkspace({
      ref, active: true, sourceBusy: false, refreshVersion: 0, view: 'storyboard', state,
      onViewChange: vi.fn(), onBusyChange: vi.fn(), onChange: vi.fn(), onOpenStage: vi.fn(),
    });

    expect(ref.current).not.toBeNull();
    await expect(ref.current!.prepareDelivery()).resolves.toBe(true);
    expect(workflow.textModels).toHaveBeenCalledExactlyOnceWith(upstreamModel);
    expect(workflow.prepareDelivery).toHaveBeenCalledExactlyOnceWith(customEntry);
    expect(workflow.visionModels).not.toHaveBeenCalled();
  });
});

describe('selecting assets from the unified library', () => {
  function choose(type:SalesLibraryChoice['type'], sourceBusy=false) {
    workflow.runEffects = true;
    workflow.textModels.mockReturnValue({model:'text'});
    const onChange = vi.fn(), handled = vi.fn();
    vi.mocked(patchSalesScript).mockRejectedValue(new Error('usage counter unavailable'));
    SalesProductionWorkspace({active:true, sourceBusy, view:'storyboard', refreshVersion:0, state:emptySalesCollection(),
      libraryChoice:{type,id:'saved',title:'资产'}, onChoiceHandled:handled, onChange,
      onViewChange:vi.fn(), onBusyChange:vi.fn(), onOpenStage:vi.fn()});
    return {onChange, handled};
  }
  it('selects the stored script and records a single use', () => {
    const {onChange,handled} = choose('script');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({selectedScriptId:'saved'}));
    expect(patchSalesScript).toHaveBeenCalledExactlyOnceWith('saved',{recordUse:true});
    expect(handled).toHaveBeenCalledExactlyOnceWith(true);
  });
  it.each(['persona','scene','voice','bgm'] as const)('binds the matching %s asset', type => {
    expect(choose(type).handled).toHaveBeenCalledExactlyOnceWith(true);
    if (type === 'persona') expect(workflow.selectPersona).toHaveBeenCalledExactlyOnceWith('saved');
    else expect(workflow.patchPlan).toHaveBeenCalledWith(expect.objectContaining({[type+'Id']:'saved'}));
  });
  it('leaves the current draft untouched while production is locked', () => {
    const {onChange,handled} = choose('script',true);
    expect(handled).toHaveBeenCalledExactlyOnceWith(false);
    expect(onChange).not.toHaveBeenCalled();
    expect(patchSalesScript).not.toHaveBeenCalled();
  });
});
