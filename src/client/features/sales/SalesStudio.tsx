import { useEffect, useRef, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { queueSettingsSection } from '@shared/domain/settings/settingsNavigationStorage';
import { resolveModalityModelRoute } from '@shared/domain/models/modalityStorage';
import { eligibleSalesImages, salesAssetsReady, salesAssetsGenerated } from '@shared/domain/sales/workflow';
import { FashionSkillSheet } from './components/FashionSkillSheet';
import { SalesActionBar, SalesHistorySection, SalesStudioHeader, salesFocusClass, salesPanelClass } from './components/salesChrome';
import { SalesFooterCreationControls, SalesPlanSection, SalesScriptOutline } from './components/salesPlanning';
import { ProductSetupPanel, SalesEmptyGuide, SalesProductWorkspace } from './components/salesProductSetup';
import { SalesAssetsSection } from './components/SalesAssetsSection';
import { SalesResultSection } from './components/SalesResultSection';
import { SalesVideoSection } from './components/SalesVideoSection';
import { SalesFooterVideoControls } from './components/SalesFooterVideoControls';
import { SalesVideoMaterials } from './components/SalesVideoMaterials';
import { SalesResultSidebar } from './components/SalesResultSidebar';
import { useSalesPanelWidth } from './hooks/useSalesPanelWidth';
import { useSalesNavigation } from './hooks/useSalesNavigation';
import { useVideoSalesStudio } from './hooks/useVideoSalesStudio';
import { assertSalesPlanCurrent, salesFinalInputRevision, salesPlanReason, salesVideoPreflightError } from './model/salesStageRules';
import { hasSalesProductContent } from './model/salesStudioDraft';
import { SALES_WORKFLOW_STEPS, salesHasQueryableTask, salesHasRenderActivity, salesStageActions, type SalesActionIntent, type SalesWorkflowStepView } from './model/salesWorkspaceView';
import { salesAssetProgress } from './model/salesAssetProgress';

interface Props { onBack: () => void; onOpenSettings?: () => void }

export default function SalesStudio({ onBack, onOpenSettings }: Props) {
  const studio = useVideoSalesStudio();
  const { state, updateState } = studio;
  const script = state.scripts[state.selectedScriptIndex];
  const hasScript = Boolean(script?.shots.length);
  let planCurrent = false;
  try { if (script) { assertSalesPlanCurrent(state, script); planCurrent = true; } } catch { /* 过期方案仍可查看，但不可作为已完成阶段。 */ }
  const assetsReady = planCurrent && salesAssetsReady(script);
  const assetsGenerated = planCurrent && salesAssetsGenerated(script);
  const hasResult = salesHasRenderActivity(script, state.composedResultUrl, studio.isRendering);
  const chatRoute = resolveModalityModelRoute('chat', state.selectedChatModel);
  const videoRoute = resolveModalityModelRoute('video', state.selectedVideoModel);
  const imageRoute = resolveModalityModelRoute('image', state.selectedImageModel);
  const finalized = Boolean(script?.fullPrompt?.trim() && assetsReady && script.finalizedRevision === salesFinalInputRevision(state, script));
  const usable = eligibleSalesImages(state.imageCatalog, state.colorSelection, state.variantMetadata);
  const isBusy = studio.isCollecting || studio.isUploading || Boolean(studio.isAnalyzing) || studio.isPlanning || studio.isPreparingAssets || studio.isFinalizing || studio.isRendering;
  const resetDisabled = isBusy || !hasSalesProductContent(state);
  const resetTitle = isBusy ? '请等待当前任务完成；视频生成可先停止' : resetDisabled ? '暂无可清空的商品内容' : '清空当前商品，保留生成设置和原始文件';
  const configScrollRef = useRef<HTMLDivElement>(null);
  const workspaceScrollRef = useRef<HTMLDivElement>(null);
  const { containerRef, wide, width, separatorProps } = useSalesPanelWidth();
  const [rulesOpen, setRulesOpen] = useState(false);
  const { step, lastCreativeStep, navigate, resetNavigation } = useSalesNavigation({ state, script, hasResult, isPlanning: studio.isPlanning, isFinalizing: studio.isFinalizing, isRendering: studio.isRendering, updateState });
  useEffect(() => { workspaceScrollRef.current?.scrollTo({ top: 0 }); }, [step, script?.id]);

  const resetCurrentProduct = async () => {
    if (!await studio.resetProject()) return;
    resetNavigation();
    requestAnimationFrame(() => configScrollRef.current?.scrollTo({ top: 0 }));
  };
  const planReason = salesPlanReason(state, chatRoute.modelId);
  const complete = { product: !planReason, plan: planCurrent, assets: assetsReady, video: finalized, result: Boolean(state.composedResultUrl) };
  const assetProgress = salesAssetProgress(script?.assets || []);
  const steps: SalesWorkflowStepView[] = SALES_WORKFLOW_STEPS.map(([id, label]) => ({ id, label, state: id === step ? 'current' : complete[id] ? 'done' : 'pending' }));
  const progress = studio.isCollecting ? '正在采集商品资料' : studio.isUploading ? '正在上传商品图片' : studio.isAnalyzing ? '正在 AI 提炼商品卖点与信息' : studio.isPlanning ? ({ analyze: '正在分析商品图片并提炼卖点', script: '正在生成卖点与完整脚本', select: '正在匹配商品参考图', prompt: '正在整理分镜视频提示词' }[studio.planPhase || 'analyze']) : studio.isPreparingAssets ? (studio.isValidatingAssets ? '正在自动校验已有图片' : `${studio.isQueryingAssets ? '正在查询原图片任务' : '正在补齐素材图片'} · 已生成 ${assetProgress.generated}/${assetProgress.total}`) : studio.isFinalizing ? '正在合成完整视频提示词' : studio.isRendering ? '正在生成并查询视频结果' : null;
  const isCollected = Boolean(state.detailsMissing !== undefined || state.collectionSource !== undefined || state.fromCache !== undefined);
  const actions = salesStageActions({ step, busy: isBusy, progress, hasScript, collected: isCollected, planCurrent, planReason, assetsReady, assetsGenerated, assetsQueryable: assetProgress.queryable, assetsUnresolved: assetProgress.unresolved, preflightError: salesVideoPreflightError(state), assetCount: assetProgress.total, imageReady: Boolean(imageRoute.modelId), finalized, videoError: studio.videoError, submitError: studio.videoSubmitError, rendering: studio.isRendering, canQuery: salesHasQueryableTask(script), hasResult: Boolean(state.composedResultUrl), submissionUncertain: script?.renderStatus === 'uncertain', renderFailed: script?.renderStatus === 'failed' });
  const runAction = (intent: SalesActionIntent) => {
    if (intent === 'write') void studio.runPlan();
    else if (intent === 'prepare') void studio.runAssets();
    else if (intent === 'queryAssets') void studio.runAssets(undefined, true);
    else if (intent === 'confirmAssets') { if (studio.confirmAssets()) navigate('video'); }
    else if (intent === 'finalize') void studio.runFinalize();
    else if (intent === 'render') void studio.runRender();
    else if (intent === 'query') void studio.runRender({ resumeOnly: true });
    else if (intent === 'stop') studio.stopWork();
    else if (intent === 'resume') navigate(lastCreativeStep);
    else if (intent !== 'download') navigate(intent);
  };
  const actionProps = (action: typeof actions.primary) => ({ ...action, onClick: () => runAction(action.intent), ...(action.intent === 'download' && state.composedResultUrl ? { href: state.composedResultUrl, download: `${script?.title || '电商视频'}.mp4` } : {}) });
  const collectAndAnalyze = () => {
    void studio.runProductCollect().then((collected) => {
      if (collected) void studio.runProductAnalyze?.();
    });
  };
  const outline = (step === 'plan' || step === 'assets' || step === 'video') && script && <>
    <SalesScriptOutline script={script} productImages={usable} showPlannedAssets={step !== 'video'} />
    {step === 'video' && <SalesVideoMaterials script={script} productImages={usable} />}
  </>;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden text-slate-900 dark:text-slate-100">
      <SalesStudioHeader onBack={onBack} onReset={() => { void resetCurrentProduct(); }} resetDisabled={resetDisabled} resetTitle={resetTitle} steps={steps} onStep={navigate} onOpenRules={() => setRulesOpen(true)} hideSteps={step === 'result'} />
      <SalesHistorySection scripts={state.scripts} selected={state.selectedScriptIndex} disabled={isBusy} onSelect={(selectedScriptIndex) => studio.updateState({ selectedScriptIndex, composedResultUrl: state.scripts[selectedScriptIndex]?.renderResultUrl || null })} />
      {studio.error && !(step === 'result' && script && hasResult) && <div role="alert" className="mx-3 mb-3 flex shrink-0 items-start gap-2.5 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2.5 text-xs leading-5 text-rose-700 sm:mx-5 dark:text-rose-200">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1">{studio.error}</p>
        {onOpenSettings && /鉴权失败|认证失败|API.?Key|密钥/i.test(studio.error) && <button type="button" className="shrink-0 font-medium underline underline-offset-2" onClick={() => { queueSettingsSection('chat'); onOpenSettings(); }}>去模型设置</button>}
        <button type="button" className={`shrink-0 rounded-md px-1.5 py-0.5 font-medium hover:bg-rose-500/10 ${salesFocusClass}`} onClick={() => { if (/商品图片|商品图|AI 提炼|卖点|分析/i.test(studio.error || '')) void studio.runProductAnalyze?.(); else void studio.runPlan(); }}>重试</button>
        <button type="button" aria-label="关闭错误提示" className={`shrink-0 rounded-md p-0.5 hover:bg-rose-500/10 ${salesFocusClass}`} onClick={studio.clearError}><X className="h-4 w-4" /></button>
      </div>}
      <div ref={containerRef} className="flex min-h-0 flex-1 px-3 pb-3 sm:px-5 sm:pb-4">
        <aside aria-label={step === 'plan' ? '商品采集与前置设置；脚本大纲' : '商品采集与前置设置'} style={{ width: wide ? width : '100%' }} className={`${wide || step === 'product' ? 'flex' : 'hidden'} ${step === 'plan' ? 'h-fit max-h-full' : 'min-h-0'} shrink-0 flex-col overflow-hidden ${salesPanelClass}`}>
          <div ref={configScrollRef} className={`${step === 'plan' ? 'max-h-full overflow-y-auto' : 'min-h-0 flex-1 overflow-y-auto'} p-4 sm:p-5`}>
            {step === 'product' ? <ProductSetupPanel state={state} updateState={studio.updateState} mediaOnly={wide} isBusy={isBusy} isCollecting={studio.isCollecting} isUploading={studio.isUploading} isAnalyzing={studio.isAnalyzing} onAnalyze={() => { void studio.runProductAnalyze?.(); }} onCollect={collectAndAnalyze} onImageError={studio.markImageUnavailable} onUpload={studio.addProductImages} onOpenRules={() => setRulesOpen(true)} /> : <><ProductSetupPanel state={state} updateState={studio.updateState} compact isBusy={isBusy} isCollecting={studio.isCollecting} isUploading={studio.isUploading} isAnalyzing={studio.isAnalyzing} onAnalyze={() => { void studio.runProductAnalyze?.(); }} onCollect={collectAndAnalyze} onImageError={studio.markImageUnavailable} onUpload={studio.addProductImages} onOpenRules={() => setRulesOpen(true)} />{outline}{step === 'result' && script && <SalesResultSidebar script={script} productImages={usable} />}</>}
          </div>
        </aside>
        {wide && <div {...separatorProps} title="拖动调整宽度；方向键调整，Shift 加速，Home / End 到边界" className="group flex w-4 shrink-0 touch-none cursor-col-resize items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500/70"><span className="h-12 w-0.5 rounded-full bg-black/10 group-hover:bg-black/30 dark:bg-white/10 dark:group-hover:bg-white/30" /></div>}
        <section aria-label="创作与生成结果" className={`${wide || step !== 'product' ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${step === 'result' ? '' : salesPanelClass}`}>
          {step !== 'product' && !wide && <div className={`${step === 'video' || step === 'result' ? 'max-h-[55%] overflow-y-auto' : ''} shrink-0 border-b border-slate-100 px-4 py-3 sm:px-5 dark:border-white/[0.08]`}><ProductSetupPanel state={state} updateState={studio.updateState} compact isBusy={isBusy} isCollecting={studio.isCollecting} isUploading={studio.isUploading} isAnalyzing={studio.isAnalyzing} onAnalyze={() => { void studio.runProductAnalyze?.(); }} onCollect={collectAndAnalyze} onImageError={studio.markImageUnavailable} onUpload={studio.addProductImages} onOpenRules={() => setRulesOpen(true)} />{outline}{step === 'result' && script && <SalesResultSidebar script={script} productImages={usable} />}</div>}
          <div ref={workspaceScrollRef} className="min-h-0 flex-1 overflow-y-auto">
            {step === 'product' && wide && <SalesProductWorkspace state={state} disabled={isBusy} isAnalyzing={studio.isAnalyzing} onAnalyze={() => { void studio.runProductAnalyze?.(); }} onOpenRules={() => setRulesOpen(true)} onChange={studio.updateState} />}
            {(step === 'plan' || (step === 'product' && !wide)) && (script ? <SalesPlanSection suppliedFacts={JSON.stringify({ sellingPoints: state.sellingPoints, props: state.props })} script={script} disabled={isBusy} onEditShot={studio.editShot} productImages={usable} /> : <SalesEmptyGuide kind="plan" category={state.category} onOpenRules={() => setRulesOpen(true)} />)}
            {step === 'assets' && (script ? <SalesAssetsSection script={script} aspectRatio={state.aspectRatio} productImages={usable} imageModel={state.selectedImageModel || imageRoute.modelId || ''} disabled={isBusy} onModel={(selectedImageModel) => studio.updateState({ selectedImageModel })} onEditPrompt={studio.editAssetPrompt} onGenerate={(id, queryOnly, validateOnly) => { void studio.runAssets(id, queryOnly, validateOnly); }} /> : <SalesEmptyGuide kind="assets" />)}
            {step === 'video' && (script ? <SalesVideoSection key={script.id} state={state} script={script} disabled={isBusy} assetsReady={assetsReady} finalizing={studio.isFinalizing} videoError={studio.videoError} submitError={studio.videoSubmitError} onEditPrompt={studio.editFullPrompt} /> : <SalesEmptyGuide kind="video" />)}
            {step === 'result' && (script && hasResult ? <SalesResultSection key={script.id} onPrepareRetry={() => { void studio.prepareVideoRetry().then((prepared) => { if (prepared) navigate('video'); }); }} onBindTask={studio.bindVideoTask} script={script} aspectRatio={state.aspectRatio} resultUrl={state.composedResultUrl} renderPhase={studio.renderPhase} isRendering={studio.isRendering} onStop={studio.stopRender} onCompose={() => { void studio.runRender({ resumeOnly: true }); }} singleDelivery={script.deliveryMode === 'single'} actionsInFooter globalError={studio.error} /> : <SalesEmptyGuide kind="result" />)}
          </div>
        </section>
      </div>
      <SalesActionBar primary={actionProps(actions.primary)} secondary={actions.secondary ? actionProps(actions.secondary) : undefined} busy={isBusy} reason={actions.reason} note={actions.note} progress={progress} controls={step === 'product' || step === 'plan' ? <SalesFooterCreationControls state={state} disabled={isBusy} onChange={studio.updateState} /> : step === 'video' && script ? <SalesFooterVideoControls state={state} modelId={videoRoute.modelId || ''} disabled={isBusy || !assetsReady} onChange={studio.updateState} /> : undefined} />
      {rulesOpen && <FashionSkillSheet active={state.category === 'fashion'} onClose={() => setRulesOpen(false)} />}
    </div>
  );
}
