import { useEffect, useRef, useState } from 'react';
import { resolveModalityModelRoute } from '@shared/domain/models/modalityStorage';
import { eligibleSalesImages, salesAssetsReady, salesAssetsGenerated } from '@shared/domain/sales/workflow';
import { FashionSkillSheet } from './components/FashionSkillSheet';
import { SalesActionBar, SalesHistorySection, SalesStudioHeader, salesPanelClass } from './components/salesChrome';
import { SalesPlanSection } from './components/salesPlanning';
import { ProductSetupPanel, SalesEmptyGuide } from './components/salesProductSetup';
import { SalesAssetsSection } from './components/SalesAssetsSection';
import { SalesResultSection } from './components/SalesResultSection';
import { SalesVideoSection } from './components/SalesVideoSection';
import { SalesStageSummary } from './components/SalesStageSummary';
import { useSalesPanelWidth } from './hooks/useSalesPanelWidth';
import { useSalesNavigation } from './hooks/useSalesNavigation';
import { useVideoSalesStudio } from './hooks/useVideoSalesStudio';
import { assertSalesPlanCurrent, salesFinalInputRevision, salesPlanReason, salesVideoPreflightError } from './model/salesStageRules';
import { hasSalesProductContent } from './model/salesStudioDraft';
import { SALES_WORKFLOW_STEPS, salesHasQueryableTask, salesHasRenderActivity, salesStageActions, type SalesActionIntent, type SalesWorkflowStepView } from './model/salesWorkspaceView';
import { salesAssetProgress } from './model/salesAssetProgress';

interface Props { onBack: () => void }

export default function SalesStudio({ onBack }: Props) {
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
  const isBusy = studio.isCollecting || studio.isUploading || studio.isPlanning || studio.isPreparingAssets || studio.isFinalizing || studio.isRendering;
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
  const progress = studio.isCollecting ? '正在采集商品资料' : studio.isUploading ? '正在上传商品图片' : studio.isPlanning ? ({ analyze: '正在分析商品图片', script: '正在编写口播脚本', select: '正在匹配商品参考图', prompt: '正在整理视频提示词' }[studio.planPhase || 'analyze']) : studio.isPreparingAssets ? (studio.isValidatingAssets ? '正在自动校验已有图片' : `${studio.isQueryingAssets ? '正在查询原图片任务' : '正在生成素材图片'} · 已生成 ${assetProgress.generated}/${assetProgress.total}`) : studio.isFinalizing ? '正在生成视频提示词' : studio.isRendering ? '正在等待并查询视频结果' : null;
  const actions = salesStageActions({ step, busy: isBusy, progress, hasScript, planCurrent, planReason, assetsReady, assetsGenerated, assetsQueryable: assetProgress.queryable, assetsUnresolved: assetProgress.unresolved, preflightError: salesVideoPreflightError(state), assetCount: assetProgress.total, imageReady: Boolean(imageRoute.modelId), finalized, videoError: studio.videoError, submitError: studio.videoSubmitError, rendering: studio.isRendering, canQuery: salesHasQueryableTask(script), hasResult: Boolean(state.composedResultUrl), submissionUncertain: script?.renderStatus === 'uncertain', renderFailed: script?.renderStatus === 'failed' });
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
  const actionProps = (action: typeof actions.primary) => ({ ...action, onClick: () => runAction(action.intent), ...(action.intent === 'download' && state.composedResultUrl ? { href: state.composedResultUrl, download: `${script?.title || '带货视频'}.mp4` } : {}) });

  return (
    <div className="flex h-full w-full flex-col overflow-hidden text-slate-900 dark:text-slate-100">
      <SalesStudioHeader onBack={onBack} onReset={() => { void resetCurrentProduct(); }} resetDisabled={resetDisabled} resetTitle={resetTitle} steps={steps} onStep={navigate} onOpenRules={() => setRulesOpen(true)} />
      <SalesHistorySection scripts={state.scripts} selected={state.selectedScriptIndex} disabled={isBusy} onSelect={(selectedScriptIndex) => studio.updateState({ selectedScriptIndex, composedResultUrl: state.scripts[selectedScriptIndex]?.renderResultUrl || null })} />
      {studio.error && !(step === 'result' && script && hasResult) && <p role="alert" className="mx-3 mb-3 shrink-0 rounded-xl border border-rose-500/15 bg-rose-500/[0.06] px-4 py-3 text-xs leading-5 text-rose-600 sm:mx-5 dark:text-rose-300">{studio.error}</p>}
      <div ref={containerRef} className="flex min-h-0 flex-1 px-3 pb-3 sm:px-5 sm:pb-4">
        <aside aria-label="商品确认与前置设置" style={{ width: wide ? width : '100%' }} className={`${wide || step === 'product' ? 'flex' : 'hidden'} min-h-0 shrink-0 flex-col overflow-hidden ${salesPanelClass}`}>
          <div ref={configScrollRef} className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5"><ProductSetupPanel state={state} updateState={studio.updateState} compact={step !== 'product'} isBusy={isBusy} isCollecting={studio.isCollecting} isUploading={studio.isUploading} onCollect={() => { void studio.runProductCollect(); }} onImageError={studio.markImageUnavailable} onUpload={studio.addProductImages} onOpenRules={() => setRulesOpen(true)} /></div>
        </aside>
        {wide && <div {...separatorProps} title="拖动调整宽度；方向键调整，Shift 加速，Home / End 到边界" className="group flex w-4 shrink-0 touch-none cursor-col-resize items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500/70"><span className="h-12 w-0.5 rounded-full bg-black/10 group-hover:bg-black/30 dark:bg-white/10 dark:group-hover:bg-white/30" /></div>}
        <section aria-label="创作与生成结果" className={`${wide || step !== 'product' ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${salesPanelClass}`}>
          <div ref={workspaceScrollRef} className="min-h-0 flex-1 overflow-y-auto">
            <SalesStageSummary step={step} checks={step === 'product' ? [{ label: '商品名称', done: Boolean(state.productName.trim()) }, { label: `已选 ${usable.length} 张商品图`, done: usable.length > 0 }, { label: '创作设置', done: !planReason }] : [{ label: '脚本有效', done: planCurrent }, { label: '素材已确认', done: assetsReady }, { label: '提示词已定稿', done: finalized }]} />
            {(step === 'plan' || step === 'product') && (script ? <SalesPlanSection suppliedFacts={JSON.stringify({ sellingPoints: state.sellingPoints, props: state.props })} analysis={state.analysis} script={script} disabled={isBusy} onEditShot={studio.editShot} /> : <SalesEmptyGuide kind="plan" category={state.category} onOpenRules={() => setRulesOpen(true)} />)}
            {step === 'assets' && (script ? <SalesAssetsSection script={script} productImages={usable} imageModel={state.selectedImageModel || imageRoute.modelId || ''} disabled={isBusy} onModel={(selectedImageModel) => studio.updateState({ selectedImageModel })} onEditPrompt={studio.editAssetPrompt} onGenerate={(id, queryOnly, validateOnly) => { void studio.runAssets(id, queryOnly, validateOnly); }} /> : <SalesEmptyGuide kind="assets" />)}
            {step === 'video' && (script ? <SalesVideoSection key={script.id} state={state} script={script} modelId={videoRoute.modelId || ''} disabled={isBusy} assetsReady={assetsReady} finalized={finalized} videoError={studio.videoError} submitError={studio.videoSubmitError} onChange={studio.updateState} onEditPrompt={studio.editFullPrompt} /> : <SalesEmptyGuide kind="video" />)}
            {step === 'result' && (script && hasResult ? <SalesResultSection key={script.id} onPrepareRetry={() => { void studio.prepareVideoRetry().then((prepared) => { if (prepared) navigate('video'); }); }} script={script} aspectRatio={state.aspectRatio} resultUrl={state.composedResultUrl} renderPhase={studio.renderPhase} isRendering={studio.isRendering} onStop={studio.stopRender} onCompose={() => { void studio.runRender({ resumeOnly: true }); }} singleDelivery={script.deliveryMode === 'single'} actionsInFooter globalError={studio.error} /> : <SalesEmptyGuide kind="result" />)}
          </div>
        </section>
      </div>
      <SalesActionBar primary={actionProps(actions.primary)} secondary={actions.secondary ? actionProps(actions.secondary) : undefined} busy={isBusy} reason={actions.reason} note={actions.note} progress={progress} />
      {rulesOpen && <FashionSkillSheet active={state.category === 'fashion'} onClose={() => setRulesOpen(false)} />}
    </div>
  );
}
