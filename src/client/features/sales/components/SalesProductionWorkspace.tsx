import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Clapperboard, Film, X } from 'lucide-react';
import { StudioSheet } from '@client/shared/ui/studio/StudioSheet';
import { useSalesScriptTaxonomy } from '../hooks/useSalesScriptTaxonomy';
import { patchSalesScript } from '../api/salesScripts';
import type { SalesCollectionState } from '../model/salesCollectionDraft';
import { planForSelectedScript } from '../model/salesProductionDraft';
import { salesProductionSummaryIsStale } from '../model/salesPlanSource';
import { useSalesProduction } from '../hooks/useSalesProduction';
import { useSalesTextModels } from '../hooks/useSalesTextModels';
import { salesFocusClass, salesGhostButtonClass, salesPrimaryButtonClass } from './salesChrome';
import { SalesAssetBindingPanel } from './SalesAssetBindingPanel';
import { SalesBottomActionBar } from './SalesBottomActionBar';
import { SalesFinalPromptPanel } from './SalesFinalPromptPanel';
import { SalesMusicPicker } from './SalesMusicPicker';
import { SalesPlanAdaptPanel } from './SalesPlanAdaptPanel';
import { SalesPresentationModePanel } from './SalesPresentationModePanel';
import { SalesStoryboardBottomBar } from './SalesStoryboardBottomBar';
import { SalesVideoSettings } from './SalesVideoSettings';
import type { SalesEditorView } from './SalesEditorNavigation';

import type { SalesLibraryChoice } from '../model/salesWorkspace';

export interface SalesProductionHandle {
  prepareDelivery: () => Promise<boolean>;
  checkDeliveryScript: () => boolean;
}

interface Props {
  ref?: Ref<SalesProductionHandle>;
  libraryChoice?: SalesLibraryChoice | null;
  onChoiceHandled?:(accepted:boolean)=>void;
  active: boolean;
  refreshVersion: number;
  sourceBusy: boolean;
  view: SalesEditorView;
  deliveryStep?: 'storyboard' | 'script' | null;
  onViewChange: (view: SalesEditorView) => void;
  onBusyChange: (busy: boolean) => void;
  state: SalesCollectionState;
  onChange: (patch: Partial<SalesCollectionState>) => void;
  onOpenStage: (stage: 'scripts' | 'materials', section?: 'persona' | 'scene' | 'sound') => void;
  onEditFaces?: (urls: string[]) => void;
  onOpenPrompt?: (id: string) => void;
  onOutputProduced?: () => void;
  onStoryboardPreview?: (text: string) => void;
}

export function SalesProductionWorkspace({
  ref, libraryChoice, onChoiceHandled, active, sourceBusy, refreshVersion, view, deliveryStep, onViewChange, onBusyChange,
  state, onChange, onOpenStage, onEditFaces, onOpenPrompt, onOutputProduced, onStoryboardPreview,
}: Props) {
  const prod = useSalesProduction(state, onChange, refreshVersion, onOutputProduced);
  const storyboard = prod.assembled?.storyboardPreview || '';
  useEffect(() => { onStoryboardPreview?.(storyboard); }, [onStoryboardPreview, storyboard]);
  const { model } = useSalesTextModels(state.summaryModel);
  const prepareDelivery = prod.prepareDelivery;
  const checkDeliveryScript = prod.checkDeliveryScript;
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setSettingsOpen(false);
  }, [view, active]);

  const taxonomy = useSalesScriptTaxonomy();
  const refreshTaxonomy = taxonomy.refresh;
  useEffect(() => {
    if (!refreshVersion) return;
    void refreshTaxonomy();
  }, [refreshVersion, refreshTaxonomy]);

  const working = Boolean(prod.busy && prod.busy !== 'loading');
  const editingLocked = working || sourceBusy || Boolean(deliveryStep);
  useEffect(() => { onBusyChange(working); }, [onBusyChange, working]);

  const effectiveVoice = prod.assembled?.effectiveVoiceMode
    || (state.productionPlan.presentationMode === 'clean_visual' ? 'none' : state.productionPlan.voiceModeOverride || 'speech');

  const selectScriptId = useCallback((id: string) => {
    onChange({ selectedScriptId: id, productionPlan: planForSelectedScript(state.productionPlan, id) });
    if (id && id !== state.selectedScriptId) {
      void patchSalesScript(id, { recordUse: true }).catch(() => { /* 使用次数统计不阻塞主流程 */ });
    }
  }, [onChange, state.productionPlan, state.selectedScriptId]);

  useImperativeHandle(ref, () => ({
    prepareDelivery: () => sourceBusy ? Promise.resolve(false) : prepareDelivery(model),
    checkDeliveryScript,
  }), [model, prepareDelivery, checkDeliveryScript, sourceBusy]);

  const handled = useRef<SalesLibraryChoice | null>(null);
  const [selectionError, setSelectionError] = useState('');
  useEffect(() => {
    if (!libraryChoice) { handled.current = null; return; }
    if (handled.current === libraryChoice || prod.busy === 'loading') return;
    handled.current = libraryChoice;
    if (editingLocked) {
      setSelectionError('视频制作正在处理任务，本次素材选择未应用。');
      onChoiceHandled?.(false);
      return;
    }
    const {type, id} = libraryChoice;
    setSelectionError('');
    switch (type) {
      case 'script': selectScriptId(id); break;
      case 'persona': prod.selectPersona(id); break;
      case 'scene': prod.patchPlan({sceneId:id, customSceneImageUrl:'', customPrompt:''}); break;
      case 'voice': prod.patchPlan({voiceId:id, customPrompt:''}); break;
      case 'bgm': prod.patchPlan({bgmId:id, customBgmUrl:'', mixedVideoUrl:''}); break;
    }
    onChoiceHandled?.(true);
  }, [libraryChoice, editingLocked, prod, onChoiceHandled, selectScriptId]);

  const verifiedScripts = prod.scripts.filter((item) => item.status === 'verified');

  const storyboardSettings = (
    <SalesStoryboardBottomBar
      scripts={prod.scripts}
      activeScript={prod.activeScript}
      taxonomy={taxonomy.items}
      selectedScriptId={state.selectedScriptId}
      loadingScripts={prod.busy === 'loading'}
      category={state.category}
      audience={state.audience}
      plan={state.productionPlan}
      effectiveVoiceMode={effectiveVoice}
      rankedPersonas={prod.rankedPersonas}
      rankedScenes={prod.rankedScenes}
      rankedVoices={prod.rankedVoices}
      selectedPersona={prod.selectedPersona}
      selectedScene={prod.selectedScene}
      selectedVoice={prod.selectedVoice}
      disabled={editingLocked}
      videoSettings={prod.activeScript && prod.assembled && (
        <SalesVideoSettings
          plan={state.productionPlan}
          script={prod.activeScript.script}
          videoModels={prod.videoModels}
          references={prod.assembled.references}
          audios={prod.assembled.audios}
          disabled={editingLocked}
          planning
          onPatchPlan={prod.patchPlan}
        />
      )}
      onSelectScript={selectScriptId}
      onSelectPersona={prod.selectPersona}
      onPatchPlan={prod.patchPlan}
      onPresentationModeChange={prod.setPresentationMode}
      onVoiceModeChange={prod.setVoiceMode}
      onScriptVideoReferenceChange={(mode) => prod.patchPlan({
        scriptVideoReference: mode,
        imitationMode: mode === 'none' ? 'script_only' : 'depth_imitation',
        customPrompt: '',
      })}
      onSmartMatch={() => prod.applySmartDefaults(false)}
      onUploadSlot={(target, file) => { void prod.uploadCustomSlot(target, file); }}
      onOpenStage={onOpenStage}
    />
  );

  const deliveryNotice = view === 'delivery' && Boolean(prod.activeScript && prod.assembled);
  const notice = prod.notice && !prod.error && (
    <div role="status" className={deliveryNotice ? 'sales-delivery-info' : 'sales-studio-alert flex shrink-0 items-start gap-3 bg-sky-500/10 px-3.5 py-2 text-xs leading-5 text-sky-700 dark:text-sky-200'}>
      <p className="min-w-0 flex-1">{prod.notice}</p>
      <button type="button" aria-label="关闭制作提示" onClick={prod.clearNotice} className={`rounded ${salesFocusClass}`}><X className="h-4 w-4" /></button>
    </div>
  );

  return (
    <>
      {selectionError && <p role="alert">{selectionError} <button onClick={()=>setSelectionError('')}>关闭</button></p>}
      {prod.error && (
        <div role="alert" className="sales-studio-alert flex shrink-0 items-start gap-3 bg-rose-500/10 px-3.5 py-2 text-xs leading-5 text-rose-700 dark:text-rose-200">
          <p className="min-w-0 flex-1">{prod.error}</p>
          {prod.errorPromptId && onOpenPrompt && <button type="button" disabled={editingLocked}
            className={salesGhostButtonClass} onClick={() => onOpenPrompt(prod.errorPromptId)}>去配置提示词</button>}
          <button type="button" aria-label="关闭生产提示" onClick={prod.clearError} className={`rounded ${salesFocusClass}`}><X className="h-4 w-4" /></button>
        </div>
      )}
      {!deliveryNotice && notice}

      <div className="sales-editor-production" hidden={view !== 'storyboard' && view !== 'delivery'}>
        <div className="sales-editor-production-body">
          {sourceBusy && <p className="sales-plan-banner" role="status">商品资料正在处理，完成后即可编辑分镜和生成视频。</p>}
          {!prod.activeScript || !prod.assembled ? (
            <div className={view === 'storyboard' ? 'sales-sb-workbench' : 'sales-editor-delivery'}>
              <div className="sales-editor-empty">
                <div className="sales-editor-empty-mark">{view === 'delivery' ? <Film size={24} aria-hidden /> : <Clapperboard size={24} aria-hidden />}</div>
                <h2>{view === 'delivery' ? '选定参考脚本后生成成片' : '选择参考脚本开始编排分镜'}</h2>
                <p>{verifiedScripts.length > 0 ? '选择一条参考脚本模板，自动搭配匹配当前商品人群的人物与场景。' : '请先在资产库的「动作」文件夹导入分析参考脚本模板。'}</p>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                  {verifiedScripts[0] && (
                    <button type="button" disabled={editingLocked} onClick={() => selectScriptId(verifiedScripts[0].id)} className={salesPrimaryButtonClass}>
                      选用「{verifiedScripts[0].title}」
                    </button>
                  )}
                  <button type="button" disabled={editingLocked} onClick={() => onOpenStage('scripts')} className={salesGhostButtonClass}>
                    打开动作素材
                  </button>
                </div>
              </div>
              {view === 'storyboard'
                ? <aside className="sales-sb-settings" aria-label="分镜制作设置"><h2>制作设置</h2>{storyboardSettings}</aside>
                : <SalesBottomActionBar ariaLabel="参考脚本选择" left={storyboardSettings} />}
            </div>
          ) : (
            <>
              <div hidden={view !== 'storyboard'} className="sales-editor-storyboard">
                {prod.durationPlanning && (
                  <div className="sales-plan-banner" role={prod.durationPlanning.error ? 'alert' : 'status'} aria-label="成片模型与分镜时长">
                    原脚本 {prod.durationPlanning.sourceDurationSec} 秒 · 模型最长 {prod.durationPlanning.modelMaxDurationSec} 秒 · 本次生成 {prod.durationPlanning.targetDurationSec} 秒
                    {(prod.durationPlanning.error || prod.durationPlanning.notice) && <span className="ml-2">{prod.durationPlanning.error || prod.durationPlanning.notice}</span>}
                  </div>
                )}
                <SalesPlanAdaptPanel
                  script={prod.activeScript.script}
                  preferredModel={state.summaryModel}
                  onModelChange={(summaryModel) => onChange({ summaryModel })}
                  selectedImages={prod.selectedImages}
                  productFaceEdits={state.productionPlan.productFaceEdits}
                  beatBindings={prod.beatBindings}
                  adaptedBeats={state.productionPlan.adaptedBeats}
                  productSpokenCopy={state.productSummary?.editedCopy ?? state.productSummary?.result.copy ?? ''}
                  productSpokenCopyStale={salesProductionSummaryIsStale(state)}
                  effectiveVoiceMode={prod.assembled.effectiveVoiceMode}
                  presentationMode={state.productionPlan.presentationMode}
                  hasSceneReplacement={Boolean(prod.selectedScene || state.productionPlan.customSceneImageUrl?.trim())}
                  spokenCharCount={prod.assembled.spokenCharCount}
                  estimatedSpeakSec={prod.assembled.estimatedSpeakSec}
                  deliveryStep={deliveryStep}
                  adapting={prod.busy === 'adapt'}
                  disabled={sourceBusy || (working && prod.busy !== 'adapt')}
                  actions={prod.catalog.actions}
                  beatActionIds={state.productionPlan.beatActionIds}
                  onBindBeatAction={prod.bindBeatAction}
                  onRunAdapt={(model) => { void prod.runPlanAdapt(model); }}
                  onCancel={prod.cancel}
                  onChangeBeatImage={(beatIndex, imageUrl) => prod.patchPlan({
                    beatImageOverrides: { ...state.productionPlan.beatImageOverrides, [beatIndex]: imageUrl },
                    customPrompt: '',
                  })}
                  onChangeAdaptedBeat={prod.updateAdaptedBeat}
                  settings={storyboardSettings}
                  onNextStep={() => onViewChange('delivery')}
                />
              </div>
              <div hidden={view !== 'delivery'} className="sales-editor-delivery">
                <SalesFinalPromptPanel
                  active={active && view === 'delivery'}
                  notice={deliveryNotice ? notice : undefined}
                  script={prod.activeScript.script}
                  beatBindings={prod.beatBindings}
                  onEditMaterials={() => setSettingsOpen(true)}
                  onEditFaces={onEditFaces}
                  onEditStoryboard={() => onViewChange('storyboard')}
                  backgroundMusicUrl={prod.selectedBgm?.audioUrl}
                  musicPicker={(
                    <SalesMusicPicker
                      plan={state.productionPlan}
                      rankedBgms={prod.rankedBgms}
                      selectedBgm={prod.selectedBgm}
                      disabled={editingLocked}
                      active={active && view === 'delivery'}
                      onPatchPlan={prod.patchPlan}
                      onUploadBgm={(file) => { void prod.uploadCustomSlot('bgm', file); }}
                    />
                  )}
                  assembled={prod.assembled}
                  plan={state.productionPlan}
                  videoModels={prod.videoModels}
                  voiceModels={prod.voiceModels}
                  rankedVoices={prod.rankedVoices}
                  selectedVoice={prod.selectedVoice}
                  onOpenVoiceMaterials={() => onOpenStage('materials', 'sound')}
                  busy={prod.busy || (sourceBusy ? 'loading' : '')}
                  progressText={prod.progressText}
                  generationSourceError={prod.generationSourceError}
                  onReadaptStoryboard={model && !prod.durationPlanning?.error ? () => { void prod.runPlanAdapt(model); } : undefined}
                  onPatchPlan={prod.patchPlan}
                  onSynthesizeVoice={() => { void prod.runSynthesizeVoice(model); }}
                  onGenerateVideo={() => { void prod.runGenerateVideo(model); }}
                  onUploadRawVideo={(file) => { void prod.uploadCustomSlot('rawVideo', file); }}
                  onMixFinal={() => { void prod.runMixFinal(); }}
                  onCancel={prod.cancel}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {working && view !== 'delivery' && (
        <div className="sales-editor-task-status" role="status">
          <span>
            {prod.progressText || (prod.busy === 'adapt' ? '正在改写分镜…' : prod.busy === 'tts' ? '正在生成配音…' : prod.busy === 'upload' ? '正在上传素材…' : '正在制作视频…')}
          </span>
          {(prod.busy !== 'adapt' || view !== 'storyboard') && (
            <button type="button" onClick={prod.cancel} className={salesFocusClass}>停止等待</button>
          )}
        </div>
      )}

      {prod.activeScript && prod.assembled && (
        <StudioSheet
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          title="更换人物、场景与表现形式"
          subtitle="修改后将自动同步到本次成片引用素材"
          widthClassName="w-full max-w-[560px]"
        >
          <div className="flex flex-col gap-5 p-4">
            <SalesPresentationModePanel
              script={prod.activeScript.script}
              plan={state.productionPlan}
              effectiveVoiceMode={effectiveVoice}
              disabled={editingLocked}
              onPresentationModeChange={prod.setPresentationMode}
              depthVideoUrl={prod.activeScript.depthVideoUrl}
              onScriptVideoReferenceChange={(mode) => prod.patchPlan({
                scriptVideoReference: mode,
                imitationMode: mode === 'none' ? 'script_only' : 'depth_imitation',
                customPrompt: '',
              })}
              onVoiceModeChange={prod.setVoiceMode}
            />
            <SalesAssetBindingPanel
              onOpenMaterials={(section) => {
                if (!editingLocked) {
                  setSettingsOpen(false);
                  onOpenStage('materials', section);
                }
              }}
              script={prod.activeScript.script}
              plan={state.productionPlan}
              rankedPersonas={prod.rankedPersonas}
              rankedScenes={prod.rankedScenes}
              rankedVoices={prod.rankedVoices}
              selectedPersona={prod.selectedPersona}
              selectedScene={prod.selectedScene}
              selectedVoice={prod.selectedVoice}
              effectiveVoiceMode={prod.assembled.effectiveVoiceMode}
              disabled={editingLocked}
              onSmartMatch={() => prod.applySmartDefaults(false)}
              onSelectPersona={prod.selectPersona}
              onPatchPlan={prod.patchPlan}
              onEditPresentation={() => {}}
              onUploadSlot={prod.uploadCustomSlot}
            />
          </div>
        </StudioSheet>
      )}

    </>
  );
}
