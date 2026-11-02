import { useEffect, useState } from 'react';
import { Clapperboard, Film, X } from 'lucide-react';
import { StudioSheet } from '@client/shared/ui/studio/StudioSheet';
import { useSalesScriptTaxonomy } from '../hooks/useSalesScriptTaxonomy';
import { patchSalesScript } from '../api/salesScripts';
import type { SalesCollectionState } from '../model/salesCollectionDraft';
import { planForSelectedScript } from '../model/salesProductionDraft';
import { useSalesProduction } from '../hooks/useSalesProduction';
import { salesFocusClass, salesGhostButtonClass, salesPrimaryButtonClass } from './salesChrome';
import { SalesAssetBindingPanel } from './SalesAssetBindingPanel';
import { SalesBottomActionBar } from './SalesBottomActionBar';
import { SalesFinalPromptPanel } from './SalesFinalPromptPanel';
import { SalesMusicPicker } from './SalesMusicPicker';
import { SalesPlanAdaptPanel } from './SalesPlanAdaptPanel';
import { SalesPresentationModePanel } from './SalesPresentationModePanel';
import { SalesStoryboardBottomBar } from './SalesStoryboardBottomBar';
import { AtlasHubDrawer } from './atlas/AtlasHubDrawer';
import type { SalesEditorView } from './SalesEditorNavigation';

interface Props {
  active: boolean;
  refreshVersion: number;
  sourceBusy: boolean;
  view: SalesEditorView;
  onViewChange: (view: SalesEditorView) => void;
  onBusyChange: (busy: boolean) => void;
  state: SalesCollectionState;
  onChange: (patch: Partial<SalesCollectionState>) => void;
  onOpenStage: (stage: 'scripts' | 'materials', section?: 'persona' | 'scene' | 'sound') => void;
  onOutputProduced?: () => void;
}

export function SalesProductionWorkspace({
  active, sourceBusy, refreshVersion, view, onViewChange, onBusyChange,
  state, onChange, onOpenStage, onOutputProduced,
}: Props) {
  const prod = useSalesProduction(state, onChange, refreshVersion, onOutputProduced);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [atlasOpen, setAtlasOpen] = useState(false);
  const [atlasTab, setAtlasTab] = useState<'face' | 'pose'>('pose');

  useEffect(() => {
    setSettingsOpen(false);
    setAtlasOpen(false);
  }, [view, active]);

  const taxonomy = useSalesScriptTaxonomy();
  const refreshTaxonomy = taxonomy.refresh;
  useEffect(() => {
    if (!refreshVersion) return;
    void refreshTaxonomy();
  }, [refreshVersion, refreshTaxonomy]);

  const working = Boolean(prod.busy && prod.busy !== 'loading');
  const editingLocked = working || sourceBusy;
  useEffect(() => { onBusyChange(working); }, [onBusyChange, working]);

  const effectiveVoice = prod.assembled?.effectiveVoiceMode
    || (state.productionPlan.presentationMode === 'clean_visual' ? 'none' : state.productionPlan.voiceModeOverride || 'speech');

  const selectScriptId = (id: string) => {
    onChange({ selectedScriptId: id, productionPlan: planForSelectedScript(state.productionPlan, id) });
    if (id && id !== state.selectedScriptId) {
      void patchSalesScript(id, { recordUse: true }).catch(() => { /* 使用次数统计不阻塞主流程 */ });
    }
  };

  const openAtlas = (tab: 'face' | 'pose') => {
    setAtlasTab(tab);
    setAtlasOpen(true);
  };

  const verifiedScripts = prod.scripts.filter((item) => item.status === 'verified');

  const bottomBar = (
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
      onOpenFaceAtlas={() => openAtlas('face')}
    />
  );

  return (
    <>
      {prod.error && (
        <div role="alert" className="sales-studio-alert flex shrink-0 items-start gap-3 bg-rose-500/10 px-3.5 py-2 text-xs leading-5 text-rose-700 dark:text-rose-200">
          <p className="min-w-0 flex-1">{prod.error}</p>
          <button type="button" aria-label="关闭生产提示" onClick={prod.clearError} className={`rounded ${salesFocusClass}`}><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="sales-editor-production" hidden={view !== 'storyboard' && view !== 'delivery'}>
        <div className="sales-editor-production-body">
          {sourceBusy && <p className="sales-plan-banner" role="status">商品资料正在处理，完成后即可编辑分镜和生成视频。</p>}
          {!prod.activeScript || !prod.assembled ? (
            <>
              <div className="sales-editor-empty">
                <div className="sales-editor-empty-mark">{view === 'delivery' ? <Film size={24} aria-hidden /> : <Clapperboard size={24} aria-hidden />}</div>
                <h2>{view === 'delivery' ? '选定参考脚本后生成成片' : '选择参考脚本开始编排分镜'}</h2>
                <p>{verifiedScripts.length > 0 ? '在下方选择一条参考脚本模板，自动搭配匹配当前商品人群的人物与场景。' : '请先前往脚本库导入并确认参考脚本模板。'}</p>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                  {verifiedScripts[0] && (
                    <button type="button" disabled={editingLocked} onClick={() => selectScriptId(verifiedScripts[0].id)} className={salesPrimaryButtonClass}>
                      选用「{verifiedScripts[0].title}」
                    </button>
                  )}
                  <button type="button" disabled={editingLocked} onClick={() => onOpenStage('scripts')} className={salesGhostButtonClass}>
                    去脚本库
                  </button>
                </div>
              </div>
              <SalesBottomActionBar ariaLabel="分镜脚本底部操作栏" left={bottomBar} />
            </>
          ) : (
            <>
              <div hidden={view !== 'storyboard'} className="sales-editor-storyboard">
                <SalesPlanAdaptPanel
                  script={prod.activeScript.script}
                  preferredModel={state.summaryModel}
                  onModelChange={(summaryModel) => onChange({ summaryModel })}
                  selectedImages={prod.selectedImages}
                  beatBindings={prod.beatBindings}
                  adaptedBeats={state.productionPlan.adaptedBeats}
                  effectiveVoiceMode={prod.assembled.effectiveVoiceMode}
                  presentationMode={state.productionPlan.presentationMode}
                  hasSceneReplacement={Boolean(prod.selectedScene || state.productionPlan.customSceneImageUrl?.trim())}
                  spokenCharCount={prod.assembled.spokenCharCount}
                  estimatedSpeakSec={prod.assembled.estimatedSpeakSec}
                  adapting={prod.busy === 'adapt'}
                  disabled={sourceBusy || (working && prod.busy !== 'adapt')}
                  actions={prod.catalog.actions}
                  beatActionIds={state.productionPlan.beatActionIds}
                  onBindBeatAction={prod.bindBeatAction}
                  onOpenActionAtlas={() => openAtlas('pose')}
                  onRunAdapt={(model) => { void prod.runPlanAdapt(model); }}
                  onCancel={prod.cancel}
                  onChangeBeatImage={(beatIndex, imageUrl) => prod.patchPlan({
                    beatImageOverrides: { ...state.productionPlan.beatImageOverrides, [beatIndex]: imageUrl },
                    customPrompt: '',
                  })}
                  onChangeAdaptedBeat={prod.updateAdaptedBeat}
                  bottomLeft={bottomBar}
                  onNextStep={() => onViewChange('delivery')}
                />
              </div>
              <div hidden={view !== 'delivery'} className="sales-editor-delivery">
                <SalesFinalPromptPanel
                  active={active && view === 'delivery'}
                  script={prod.activeScript.script}
                  beatBindings={prod.beatBindings}
                  onEditMaterials={() => setSettingsOpen(true)}
                  onEditStoryboard={() => onViewChange('storyboard')}
                  hasBackgroundMusic={Boolean(prod.selectedBgm)}
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
                  busy={prod.busy || (sourceBusy ? 'loading' : '')}
                  progressText={prod.progressText}
                  generationSourceError={prod.generationSourceError}
                  onPatchPlan={prod.patchPlan}
                  onSynthesizeVoice={() => { void prod.runSynthesizeVoice(); }}
                  onGenerateVideo={() => { void prod.runGenerateVideo(); }}
                  onUploadRawVideo={(file) => { void prod.uploadCustomSlot('rawVideo', file); }}
                  onMixFinal={() => { void prod.runMixFinal(); }}
                  onCancel={prod.cancel}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {working && (
        <div className="sales-editor-task-status" role="status">
          <span>
            {prod.progressText || (prod.busy === 'adapt' ? '正在改写分镜…' : prod.busy === 'tts' ? '正在生成配音…' : prod.busy === 'upload' ? '正在上传素材…' : '正在制作视频…')}
          </span>
          <button type="button" onClick={prod.cancel} className={salesFocusClass}>停止等待</button>
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

      <AtlasHubDrawer
        open={atlasOpen}
        defaultTab={atlasTab}
        onClose={() => setAtlasOpen(false)}
        onImported={() => { void prod.reloadAssets(); }}
      />
    </>
  );
}
