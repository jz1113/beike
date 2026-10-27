import { useEffect, useRef, useState } from 'react';
import './salesProduct.css';
import './salesResult.css';
import './salesWorkflow.css';
import { AlertCircle, X } from 'lucide-react';
import { queueSettingsSection } from '@shared/domain/settings/settingsNavigationStorage';
import { resolveModalityModelRoute } from '@shared/domain/models/modalityStorage';
import { eligibleSalesImages, salesAssetsReady, salesAssetsGenerated } from '@shared/domain/sales/workflow';
import { FashionSkillSheet } from './components/FashionSkillSheet';
import { SalesActionBar, SalesHistorySection, SalesStudioHeader, salesFocusClass, salesPanelClass } from './components/salesChrome';
import { SalesFooterCreationControls, SalesPlanSection } from './components/salesPlanning';
import { ProductSetupPanel, SalesEmptyGuide, SalesProductWorkspace } from './components/salesProductSetup';
import { SalesAssetsSection } from './components/SalesAssetsSection';
import { SalesResultSection } from './components/SalesResultSection';
import { SalesVideoSection } from './components/SalesVideoSection';
import { SalesFooterVideoControls } from './components/SalesFooterVideoControls';
import { SalesResultSidebar } from './components/SalesResultSidebar';
import { SalesResultActions } from './components/SalesResultPublishing';
import { useSalesNavigation } from './hooks/useSalesNavigation';
import { useVideoSalesStudio } from './hooks/useVideoSalesStudio';
import { assertSalesPlanCurrent, salesFinalInputRevision, salesPlanReason, salesVideoPreflightError } from './model/salesStageRules';
import { hasSalesProductContent } from './model/salesStudioDraft';
import { salesHasQueryableTask, salesHasRenderActivity, salesStageActions, type SalesActionIntent } from './model/salesWorkspaceView';
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

  const [rulesOpen, setRulesOpen] = useState(false);
  const { step, lastCreativeStep, navigate, resetNavigation } = useSalesNavigation({ state, script, hasResult, isPlanning: studio.isPlanning, isFinalizing: studio.isFinalizing, isRendering: studio.isRendering, updateState });
  useEffect(() => { workspaceScrollRef.current?.scrollTo({ top: 0 }); }, [step, script?.id]);

  const resetCurrentProduct = async () => {
    if (!await studio.resetProject()) return;
    resetNavigation();
    requestAnimationFrame(() => configScrollRef.current?.scrollTo({ top: 0 }));
  };
  const planReason = salesPlanReason(state, chatRoute.modelId);
  const assetProgress = salesAssetProgress(script?.assets || []);
  const progress = studio.isCollecting ? '正在采集商品资料' : studio.isUploading ? '正在上传商品图片' : studio.isAnalyzing ? '正在 AI 提炼商品卖点与信息' : studio.isPlanning ? ({ analyze: '正在分析商品图片并提炼卖点', script: '正在生成卖点与完整脚本', select: '正在匹配商品参考图' }[studio.planPhase || 'analyze']) : studio.isPreparingAssets ? `${studio.isQueryingAssets ? '正在查询原图片任务' : '正在补齐素材图片'} · 已生成 ${assetProgress.generated}/${assetProgress.total}` : studio.isFinalizing ? '正在合成完整视频提示词' : studio.isRendering ? '正在生成并查询视频结果' : null;
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
  const collectProduct = () => { void studio.runProductCollect(); };
  const resultWorkspace = step === 'result' && script && hasResult;
  const sidebar = script && <SalesResultSidebar script={script} state={state} productImages={usable} />;
  const availableSteps = [
    'product' as const,
    ...(hasScript ? ['plan' as const] : []),
    ...(hasScript && planCurrent ? ['assets' as const] : []),
    ...(assetsReady ? ['video' as const] : []),
    ...(hasResult ? ['result' as const] : []),
  ];

  return (
    <div className={`sales-studio ${resultWorkspace ? 'has-result-workspace' : ''} flex h-full w-full flex-col overflow-hidden text-slate-900 dark:text-slate-100`}>
      <SalesStudioHeader onBack={onBack} onReset={() => { void resetCurrentProduct(); }} resetDisabled={resetDisabled} resetTitle={resetTitle} step={step} availableSteps={availableSteps} onNavigate={navigate} history={<SalesHistorySection scripts={state.scripts} selected={state.selectedScriptIndex} disabled={isBusy} onSelect={(selectedScriptIndex) => studio.updateState({ selectedScriptIndex, composedResultUrl: state.scripts[selectedScriptIndex]?.renderResultUrl || null })} />} onViewResult={hasResult && step !== 'result' ? () => navigate('result') : undefined} onOpenRules={() => setRulesOpen(true)} />
      {studio.error && !(step === 'result' && script && hasResult) && <div role="alert" className="mx-3 mb-3 flex shrink-0 items-start gap-2.5 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2.5 text-xs leading-5 text-rose-700 sm:mx-5 dark:text-rose-200">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1">{studio.error}</p>
        {onOpenSettings && /鉴权失败|认证失败|API.?Key|密钥/i.test(studio.error) && <button type="button" className="shrink-0 font-medium underline underline-offset-2" onClick={() => { queueSettingsSection('chat'); onOpenSettings(); }}>去模型设置</button>}
        <button type="button" aria-label="关闭错误提示" className={`shrink-0 rounded-md p-0.5 hover:bg-rose-500/10 ${salesFocusClass}`} onClick={studio.clearError}><X className="h-4 w-4" /></button>
      </div>}
      <div className={`sales-work-area ${step === 'product' ? 'sales-product-layout' : resultWorkspace ? 'sales-result-layout' : 'sales-creative-layout'}`}>
      {resultWorkspace ? <SalesResultSection key={script.id} onPrepareRetry={() => { void studio.prepareVideoRetry().then((prepared) => { if (prepared) navigate('video'); }); }} onBindTask={studio.bindVideoTask} script={script} aspectRatio={state.aspectRatio} resultUrl={state.composedResultUrl} renderPhase={studio.renderPhase} isRendering={studio.isRendering} onStop={studio.stopWork} onQuery={() => { void studio.runRender({ resumeOnly: true }); }} singleDelivery={script.deliveryMode === 'single'} actionsInFooter globalError={studio.error} productImages={usable}
        sidebar={sidebar}
        actions={<SalesResultActions primary={actionProps(actions.primary)} secondary={actions.secondary ? actionProps(actions.secondary) : undefined} busy={studio.isRendering} reason={actions.reason} note={actions.note} resultUrl={state.composedResultUrl} title={script.title} />}
      /> : step === 'product' ? <>
        <aside ref={configScrollRef} aria-label="商品采集与前置设置" className="sales-product-input min-h-0 min-w-0 overflow-hidden">
          <ProductSetupPanel state={state} updateState={studio.updateState} mediaOnly isBusy={isBusy} isCollecting={studio.isCollecting} isUploading={studio.isUploading} isAnalyzing={studio.isAnalyzing} onAnalyze={() => { void studio.runProductAnalyze?.(); }} onCollect={collectProduct} onImageError={studio.markImageUnavailable} onUpload={studio.addProductImages} onOpenRules={() => setRulesOpen(true)} />
        </aside>
        <section ref={workspaceScrollRef} aria-label="创作与生成结果" className="sales-product-output min-h-0 min-w-0 overflow-hidden">
          <SalesProductWorkspace state={state} disabled={isBusy} isAnalyzing={studio.isAnalyzing} onAnalyze={() => { void studio.runProductAnalyze?.(); }} onChange={studio.updateState} />
        </section>
      </> : <>
        <aside aria-label="商品信息与分镜" className={`sales-shared-sidebar ${salesPanelClass}`}>{sidebar}</aside>
        <section aria-label="创作与生成结果" className={`sales-creative-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${salesPanelClass}`}>
          <div ref={workspaceScrollRef} className={`sales-workspace-scroll min-h-0 flex-1 ${step === 'video' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
            {step === 'plan' && (script ? <SalesPlanSection suppliedFacts={JSON.stringify({ sellingPoints: state.sellingPoints, props: state.props })} script={script} disabled={isBusy} onEditShot={studio.editShot} productImages={usable} /> : <SalesEmptyGuide kind="plan" category={state.category} onOpenRules={() => setRulesOpen(true)} />)}
            {step === 'assets' && (script ? <SalesAssetsSection script={script} aspectRatio={state.aspectRatio} productImages={usable} imageModel={state.selectedImageModel || imageRoute.modelId || ''} disabled={isBusy} onStop={studio.isPreparingAssets ? studio.stopWork : undefined} onModel={(selectedImageModel) => studio.updateState({ selectedImageModel })} onEditPrompt={studio.editAssetPrompt} onGenerate={(id, queryOnly) => { void studio.runAssets(id, queryOnly); }} /> : <SalesEmptyGuide kind="assets" />)}
            {step === 'video' && (script ? <SalesVideoSection key={script.id} state={state} script={script} disabled={isBusy} assetsReady={assetsReady} finalizing={studio.isFinalizing} videoError={studio.videoError} submitError={studio.videoSubmitError} onEditPrompt={studio.editFullPrompt} /> : <SalesEmptyGuide kind="video" />)}
            {step === 'result' && <SalesEmptyGuide kind="result" />}
          </div>
        </section>
      </>}
      </div>
      {!resultWorkspace && <SalesActionBar primary={{ ...actionProps(actions.primary), ...(step === 'product' && !isBusy ? { label: '生成卖点与脚本' } : {}) }} quietReason={step === 'product' && (!state.productName.trim() || usable.length === 0)} primaryTitle={step === 'product' && !state.productName.trim() ? '请先采集商品或填写商品名称' : undefined} secondary={actions.secondary ? actionProps(actions.secondary) : undefined} busy={isBusy} reason={actions.reason} note={actions.note} progress={step === 'assets' && studio.isPreparingAssets ? null : progress} hideProgress={step === 'assets' && studio.isPreparingAssets} controls={step === 'product' || step === 'plan' ? <SalesFooterCreationControls state={state} disabled={isBusy} onChange={studio.updateState} /> : step === 'video' && script ? <SalesFooterVideoControls state={state} modelId={videoRoute.modelId || ''} disabled={isBusy || !assetsReady} onChange={studio.updateState} /> : undefined} />}
      {rulesOpen && <FashionSkillSheet active={state.category === 'fashion'} onClose={() => setRulesOpen(false)} />}
    </div>
  );
}
