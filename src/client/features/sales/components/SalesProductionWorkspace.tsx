import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref, type ReactNode } from 'react';
import { X } from 'lucide-react';
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
import { SalesFinalPromptPanel } from './SalesFinalPromptPanel';
import { SalesMusicPicker } from './SalesMusicPicker';
import { SalesPlanAdaptPanel } from './SalesPlanAdaptPanel';
import { SalesPresentationModePanel } from './SalesPresentationModePanel';
import { SalesStoryboardBottomBar } from './SalesStoryboardBottomBar';
import { SalesVideoSettings } from './SalesVideoSettings';
import type { SalesEditorView } from '../model/salesWorkspace';

import type { SalesLibraryChoice } from '../model/salesWorkspace';
import type { SalesCanvasStage } from '@shared/domain/sales/salesCanvas';
import type { SalesCanvasProjection } from '@shared/domain/sales/salesCanvas';
import { salesCanvasProjection } from '../model/salesCanvasProjection';

export interface SalesProductionHandle {
  prepareDelivery: () => Promise<boolean>;
  checkDeliveryScript: () => boolean;
}

interface Props {
  renderCanvasNode?: (stage: SalesCanvasStage, content: ReactNode) => ReactNode;
  onProjection?: (projection: SalesCanvasProjection) => void;
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
  state, onChange, onOpenStage, onEditFaces, onOpenPrompt, onOutputProduced, onStoryboardPreview, onProjection, renderCanvasNode = (stage, content) => <div key={stage}>{content}</div>,
}: Props) {
  const prod = useSalesProduction(state, onChange, refreshVersion, onOutputProduced);
  const projected = JSON.stringify(salesCanvasProjection(state, prod.busy, prod.assembled));
  const projectionRef = useRef(onProjection); projectionRef.current = onProjection;
  useEffect(() => { projectionRef.current?.(JSON.parse(projected)); }, [projected]);
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

      {renderCanvasNode('sales-storyboard', <>
        {prod.error && <p role="alert" className="mb-3 text-rose-400">{prod.error}</p>}
        {notice}
        {prod.activeScript && prod.assembled ? <div className="sales-editor-storyboard">
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
        </div> : <div className="space-y-4">
          <h3 className="font-semibold">选择参考脚本，编排商品分镜</h3>
          <p className="text-sm text-slate-400">先在商品节点确认参考图，再选择脚本、人物和场景。</p>
          {verifiedScripts[0] && <button type="button" disabled={editingLocked} onClick={() => selectScriptId(verifiedScripts[0].id)} className={salesPrimaryButtonClass}>选用「{verifiedScripts[0].title}」</button>}
          <button type="button" disabled={editingLocked} onClick={() => onOpenStage('scripts')} className={salesGhostButtonClass}>选择脚本素材</button>
          {storyboardSettings}
        </div>}
      </>)}
      {(['voice', 'video', 'subtitles', 'export'] as const).map(canvasStage => renderCanvasNode(`sales-${canvasStage}`, <>
        {prod.error && <p role="alert" className="mb-3 text-rose-400">{prod.error}</p>}
        {prod.activeScript && prod.assembled ? <div className="sales-editor-delivery">
                <SalesFinalPromptPanel
                  canvasStage={canvasStage}
                  active={active}
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
                      active={active}
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
        </div> : <div className="beike-node-empty"><p>{{ voice: '分镜确认后，在这里选择音色并生成旁白。', video: '分镜与素材准备好后，在这里设置模型和生成视频。', subtitles: '分镜台词确认后，在这里检查与下载字幕。', export: '视频生成后，在这里合成配音、配乐并下载成片。' }[canvasStage]}</p><button type="button" onClick={() => onViewChange('storyboard')} className={salesGhostButtonClass}>定位分镜节点</button></div>}
      </>))}

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
