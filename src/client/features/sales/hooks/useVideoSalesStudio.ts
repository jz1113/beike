import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveModalityModelRoute } from '@shared/domain/models/modalityStorage';
import {
  appendSalesImages,
  editSalesShot,
  markSalesImageUnavailable,
  eligibleSalesImages,
  salesContentRevision,
  emptySalesColorSelection,
  type VideoSalesScript,
  type VideoSalesShot,
} from '@shared/domain/sales';
import { uploadSalesImages } from '../api/uploadSalesImages';
import { confirmAction } from '@client/shared/utils/confirmAction';
import { collectEcommerceProduct } from '../api/collectProduct';
import { composeSalesVideo, analyzeProductMedia, generateSalesScripts, selectSalesImages } from '../api/videoSalesApi';
import { bindSalesVideoTask, generateSalesReferenceFrame, generateSalesShotVideo, lookupSalesVideoSubmission } from '../api/salesMediaApi';
import { buildSalesPlan, type SalesPlanPhase } from '../model/buildSalesPlan';
import { executeSalesRender } from '../model/executeSalesRender';
import { parseProductLink } from '../model/productLink';
import { productImageFiles } from '../model/productImageDrop';
import type { SalesRenderPhase } from '../model/renderSalesVideo';
import { clearSalesProduct, hasSalesProductContent, readSalesStudioDraft, SALES_STUDIO_STORAGE_KEY, writeSalesStudioDraft, type VideoSalesStudioState as SalesStudioDraft } from '../model/salesStudioDraft';
import { salesJobAllowed, type SalesAspectRatio } from '../model/salesWorkspace';
import { reuseSalesPlanAssets } from '../model/salesAssetHelpers';
import { invalidateSalesState, salesPlanInputRevision, salesPlanReason, salesSingleVideoError } from '../model/salesStageRules';
import { useSalesCreativeStages } from './useSalesCreativeStages';
import { createSalesVideoRetry } from '../model/createSalesVideoRetry';

export type VideoSalesStudioState = SalesStudioDraft;
export type { SalesAspectRatio, SalesPlanPhase, SalesRenderPhase };

function applyRenderedScript(prev: VideoSalesStudioState, scriptId: string, recipe: (script: NonNullable<VideoSalesStudioState['scripts'][number]>) => VideoSalesStudioState['scripts'][number], extra?: { composedResultUrl?: string | null }): VideoSalesStudioState {
  const scripts = [...prev.scripts];
  const scriptIndex = scripts.findIndex((item) => item.id === scriptId);
  const currentScript = scripts[scriptIndex];
  if (!currentScript) return prev;
  scripts[scriptIndex] = recipe(currentScript);
  return { ...prev, scripts, ...(extra?.composedResultUrl !== undefined && prev.selectedScriptIndex === scriptIndex ? { composedResultUrl: extra.composedResultUrl } : {}) };
}

function chatRoute(modelId?: string) {
  const route = resolveModalityModelRoute('chat', modelId);
  return { model: route.modelId || undefined, textProtocol: route.textProtocol, customBaseUrl: route.baseUrl || undefined, customApiKey: route.apiKey || undefined };
}

export function useVideoSalesStudio() {
  const [state, setState] = useState<VideoSalesStudioState>(readSalesStudioDraft);
  const [isCollecting, setIsCollecting] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [planPhase, setPlanPhase] = useState<SalesPlanPhase | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [renderPhase, setRenderPhase] = useState<SalesRenderPhase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const stateRef = useRef(state);
  const collectAbortRef = useRef<AbortController | null>(null);
  const renderAbortRef = useRef<AbortController | null>(null);
  const planTokenRef = useRef(0);
  const planAbortRef = useRef<AbortController | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const resetPendingRef = useRef(false);
  const resumeStartedRef = useRef(false);
  const busyRef = useRef({ collecting: false, planning: false, rendering: false, uploading: false });
  const commit = useCallback((recipe: (prev: VideoSalesStudioState) => VideoSalesStudioState) => {
    const next = recipe(stateRef.current);
    stateRef.current = next;
    if (typeof window !== 'undefined') { try { window.localStorage.setItem(SALES_STUDIO_STORAGE_KEY, JSON.stringify(next)); } catch { /* keep in-memory state if storage is unavailable */ } }
    setState(next);
  }, []);

  const stages = useSalesCreativeStages({ stateRef, busyRef, commit, setError });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(SALES_STUDIO_STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore quota */ }
  }, [state]);
  useEffect(() => () => { planTokenRef.current += 1; collectAbortRef.current?.abort(); planAbortRef.current?.abort(); uploadAbortRef.current?.abort(); renderAbortRef.current?.abort(); }, []);

  const updateState = useCallback((patch: Partial<VideoSalesStudioState>) => {
    commit((prev) => invalidateSalesState(prev, patch));
  }, [commit]);

  const replaceScript = useCallback((script: VideoSalesScript, extra?: Partial<VideoSalesStudioState>) => {
    commit((prev) => ({ ...prev, scripts: [script], selectedScriptIndex: 0, ...extra }));
  }, [commit]);

  const patchShot = useCallback((index: number, patch: Partial<VideoSalesShot>) => {
    commit((prev) => {
      const scripts = [...prev.scripts];
      const current = scripts[prev.selectedScriptIndex];
      if (!current) return prev;
      const previous = current.shots[index];
      if (!previous) return prev;
      const shots = current.shots.map((shot, shotIndex) => (shotIndex === index ? { ...shot, ...patch } : shot));
      scripts[prev.selectedScriptIndex] = { ...current, shots, totalDuration: shots.reduce((sum, shot) => sum + (shot.duration || 3), 0) };
      const invalidate = patch.status === 'generating' || (patch.assetUrl !== undefined && patch.assetUrl !== previous.assetUrl);
      return { ...prev, scripts, composedResultUrl: invalidate ? null : prev.composedResultUrl };
    });
  }, [commit]);

  const runProductCollect = useCallback(async (internal = false, forceRefresh = false) => {
    if (busyRef.current.collecting) return false;
    if (!internal && !salesJobAllowed(busyRef.current, 'collect')) return false;
    const parsed = parseProductLink(stateRef.current.productUrl);
    if (!parsed.ok) { setError(parsed.error); return false; }
    if (forceRefresh && !window.confirm('重新采集会跳过缓存，可能产生接口计费；成功后替换商品资料和图片。已有方案、镜头素材与成片保留，但旧方案需要更新后才能使用新素材继续生成，是否继续？')) return false;
    const previous = collectAbortRef.current;
    const controller = new AbortController();
    collectAbortRef.current = controller;
    previous?.abort();
    busyRef.current.collecting = true;
    setIsCollecting(true);
    setError(null);
    try {
      const product = await collectEcommerceProduct(parsed.url, parsed.platform, controller.signal, forceRefresh);
      if (collectAbortRef.current !== controller || controller.signal.aborted) return false;
      commit((prev) => {
        const autoFashion = !prev.scripts.length && prev.category === 'other' && product.category === 'fashion';
        const category = autoFashion ? 'fashion' : prev.category;
        const videoMode = autoFashion && prev.videoMode === 'product_closeup' ? 'live_presenter' : prev.videoMode;
        return {
        ...prev, ...product, variantMetadata: product.variantMetadata, category, videoMode, productUrl: parsed.url, analysis: null,
        colorSelection: emptySalesColorSelection(),
        scripts: prev.scripts.map((script, index) => ({
          ...script, planStale: true, finalizedRevision: undefined, assetValidation: 'pending',
          renderResultUrl: script.renderResultUrl || (index === prev.selectedScriptIndex ? prev.composedResultUrl || undefined : undefined),
          personFrameUrl: undefined, sceneFrameUrl: undefined,
          shots: script.shots.map((shot) => ({ ...shot, promptStale: true, referenceFrameUrl: undefined })),
        })),
      };
      });
      return true;
    } catch (err) {
      if (collectAbortRef.current !== controller || controller.signal.aborted) return false;
      setError(err instanceof Error ? err.message : '商品采集失败');
      return false;
    } finally {
      if (collectAbortRef.current === controller) {
        busyRef.current.collecting = false;
        setIsCollecting(false);
      }
    }
  }, [commit]);

  const addProductImages = useCallback(async (files: File[]) => {
    if (!salesJobAllowed(busyRef.current, 'collect')) return;
    const images = productImageFiles(files);
    if (images.length === 0) { setError('没有可用的图片'); return; }
    setError(null);
    busyRef.current.uploading = true;
    setIsUploading(true);
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    try {
      const { urls, failed } = await uploadSalesImages(images, controller.signal);
      commit((prev) => {
        const imageCatalog = appendSalesImages(prev.imageCatalog, urls, 'main');
        return { ...prev, imageCatalog, productImages: imageCatalog.map((image) => image.url) };
      });
      if (failed && !controller.signal.aborted) setError(`${urls.length} 张已上传，${failed} 张失败，请只补传失败图片`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '图片上传失败');
    } finally {
      busyRef.current.uploading = false;
      setIsUploading(false);
    }
  }, [commit]);

  const markImageUnavailable = useCallback((index: number) => {
    commit((prev) => {
      if (prev.imageCatalog.find((image) => image.index === index)?.unavailable) return prev;
      return { ...prev, imageCatalog: markSalesImageUnavailable(prev.imageCatalog, index) };
    });
  }, [commit]);

  const editShot = useCallback((index: number, patch: Partial<VideoSalesShot>) => {
    commit((prev) => {
      const scripts = [...prev.scripts];
      const current = scripts[prev.selectedScriptIndex];
      if (!current?.shots[index]) return prev;
      const previous = current.shots[index];
      const shots = current.shots.map((shot, shotIndex) => (shotIndex === index ? editSalesShot(shot, patch) : shot));
      const clearFrames = Boolean(shots[index]?.promptStale && !previous.promptStale);
      scripts[prev.selectedScriptIndex] = {
        ...current, finalizedRevision: undefined, assetValidation: 'pending',
        shots,
        totalDuration: shots.reduce((sum, shot) => sum + (shot.duration || 3), 0),
        ...(clearFrames ? { personFrameUrl: undefined, sceneFrameUrl: undefined } : {}),
      };
      return { ...prev, scripts, composedResultUrl: null };
    });
  }, [commit]);

  const editFullPrompt = useCallback((fullPrompt: string) => {
    commit((prev) => {
      const scripts = [...prev.scripts];
      const current = scripts[prev.selectedScriptIndex];
      if (!current) return prev;
      scripts[prev.selectedScriptIndex] = { ...current, fullPrompt };
      return { ...prev, scripts, composedResultUrl: null };
    });
  }, [commit]);

  const runPlan = useCallback(async () => {
    if (!salesJobAllowed(busyRef.current, 'plan')) return;
    const token = ++planTokenRef.current;
    const controller = new AbortController();
    planAbortRef.current = controller;
    busyRef.current.planning = true;
    setIsPlanning(true);
    setError(null);
    try {
      if (!stateRef.current.productName.trim() && stateRef.current.productUrl.trim()) {
        const collected = await runProductCollect(true);
        if (!collected || planTokenRef.current !== token) return;
      }
      const current = stateRef.current;
      if (planTokenRef.current !== token) return;
      if (current.scripts.some((item) => ['generating', 'uncertain'].includes(item.renderStatus || '') || item.assets?.some((asset) => ['generating', 'uncertain'].includes(asset.status || '')))) { setError('已有提交结果待确认，请先查询原任务或核对生成记录，再更新方案'); return; }
      const blocked = salesPlanReason(current, chatRoute(current.selectedChatModel).model);
      if (blocked) { setError(blocked); return; }
      const images = eligibleSalesImages(current.imageCatalog, current.colorSelection, current.variantMetadata);
      const revision = salesPlanInputRevision(current);
      const route = { ...chatRoute(current.selectedChatModel), signal: controller.signal };
      const checkpointRevision = salesContentRevision({ revision, model: route.model, protocol: route.textProtocol });
      const existingCheckpoint = current.planCheckpoint?.revision === checkpointRevision
        ? current.planCheckpoint
        : current.analysis ? { analysis: current.analysis } : undefined;
      const plan = await buildSalesPlan({
        checkpoint: existingCheckpoint,
        onCheckpoint: (checkpoint) => { if (!controller.signal.aborted) commit((previous) => ({ ...previous, planCheckpoint: { ...checkpoint, revision: checkpointRevision } })); },
        productName: current.productName,
        brand: current.brand,
        category: current.category,
        sellingPoints: current.sellingPoints, productProps: current.props,
        imageCatalog: images,
        selectedColor: current.colorSelection.colorLabel,
        aspectRatio: current.aspectRatio,
        fashionRefs: current.fashionRefs,
        targetDuration: current.targetDuration,
        videoMode: current.videoMode,
        route,
        onPhase: (phase) => { if (planTokenRef.current === token) setPlanPhase(phase); },
      }, { analyzeProductMedia, generateSalesScripts, selectSalesImages });
      if (controller.signal.aborted || planTokenRef.current !== token || salesPlanInputRevision(stateRef.current) !== revision) return;
      const script = reuseSalesPlanAssets({ ...plan.script, id: crypto.randomUUID(), planRevision: revision }, current.scripts[current.selectedScriptIndex]);
      const syncedPoints = !current.analysis && plan.analysis?.sellingPoints?.length
        ? plan.analysis.sellingPoints.map((item) => item.trim()).filter(Boolean).join('；')
        : current.sellingPoints;
      const finalRevision = salesPlanInputRevision({ ...current, sellingPoints: syncedPoints });
      const finalScript = { ...script, planRevision: finalRevision };
      commit((previous) => ({ ...previous, sellingPoints: syncedPoints, scripts: [finalScript, ...previous.scripts.map((item) => ({ ...item, renderResultUrl: item.renderResultUrl || (item.id === current.scripts[current.selectedScriptIndex]?.id ? current.composedResultUrl || undefined : undefined) }))], selectedScriptIndex: 0, analysis: plan.analysis, planCheckpoint: undefined, composedResultUrl: null }));
    } catch (err) {
      if (planTokenRef.current !== token || controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : '生成方案失败');
    } finally {
      if (planTokenRef.current === token) {
        busyRef.current.planning = false;
        setIsPlanning(false);
        setPlanPhase(null);
      }
    }
  }, [commit, runProductCollect]);

  const runRender = useCallback(async (options?: { resumeOnly?: boolean }) => {
    if (busyRef.current.rendering) return;
    if (!options?.resumeOnly && !salesJobAllowed(busyRef.current, 'render')) return;
    const current = stateRef.current;
    const script = current.scripts[current.selectedScriptIndex];
    if (!script?.shots.length) { setError('请先生成创作方案'); return; }
    const previous = renderAbortRef.current;
    const controller = new AbortController();
    renderAbortRef.current = controller;
    previous?.abort();
    busyRef.current.rendering = true;
    setIsRendering(true);
    setError(null);
    try {
      if (!options?.resumeOnly && script.renderStatus === 'done' && !await confirmAction({
        title: '重新生成整段视频？', confirmText: '确认重新生成',
        description: '已有完成的成片。重新生成会创建新的计费任务；原始成片仍保留在服务端生成记录中。',
      })) return;
      if (controller.signal.aborted) return;
      await executeSalesRender({
        resumeOnly: Boolean(options?.resumeOnly),
        signal: controller.signal,
        script,
        current,
        getState: () => stateRef.current,
        replaceScript,
        commitScript: (recipe, extra) => commit((prev) => applyRenderedScript(prev, script.id, recipe, extra)),
        patchShot,
        onPhase: setRenderPhase,
        onPromptPhase: () => setPlanPhase('prompt'),
        onResult: (url) => commit((previous) => previous.scripts[previous.selectedScriptIndex]?.id === script.id ? { ...previous, composedResultUrl: url } : previous),
        persistScript: (recipe, extra) => {
          const next = applyRenderedScript(stateRef.current, script.id, recipe, extra);
          writeSalesStudioDraft(next);
          stateRef.current = next;
          setState(next);
        },
      }, { generateFrame: generateSalesReferenceFrame, generateVideo: generateSalesShotVideo, lookupSubmission: lookupSalesVideoSubmission, compose: composeSalesVideo });
    } catch (err) {
      if (renderAbortRef.current !== controller) return;
      if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
        setError('已停止继续提交。已经提交的视频仍可能在生成，刷新后会继续查询。');
      } else {
        setError(err instanceof Error ? err.message : '视频生成失败');
      }
    } finally {
      if (renderAbortRef.current === controller) {
        busyRef.current.rendering = false;
        setIsRendering(false);
        setPlanPhase(null);
        setRenderPhase(null);
      }
    }
  }, [commit, patchShot, replaceScript]);

  useEffect(() => {
    if (resumeStartedRef.current) return;
    const current = stateRef.current;
    const script = current.scripts[current.selectedScriptIndex];
    const shots = script?.shots || [];
    const openRender = script?.renderStatus === 'generating' || script?.renderStatus === 'uncertain';
    const singleResume = openRender && Boolean(script?.renderTaskId || script?.renderSubmissionKey);
    const shotResume = script?.deliveryMode !== 'single' && shots.some((shot) => shot.taskId && shot.status === 'generating' && !shot.assetUrl);
    if (!singleResume && !shotResume) return;
    resumeStartedRef.current = true;
    void runRender({ resumeOnly: true });
  }, [runRender]);

  const stopRender = useCallback(() => { renderAbortRef.current?.abort(); }, []);

  const prepareVideoRetry = useCallback(async () => {
    if (!salesJobAllowed(busyRef.current, 'render')) return false;
    const current = stateRef.current;
    const script = current.scripts[current.selectedScriptIndex];
    if (!script || script.renderStatus !== 'uncertain' || script.renderTaskId) return false;
    if (!await confirmAction({ title: '已向渠道核实没有创建任务？', confirmText: '已核实，准备新草稿', description: '只有渠道已明确确认原请求未创建任务时才继续；否则可能重复计费。本操作保留原记录和提示词，只准备新草稿，仍需另行点击生成视频。' })) return false;
    if (stateRef.current !== current || !salesJobAllowed(busyRef.current, 'render')) return false;
    const retry = createSalesVideoRetry(script, crypto.randomUUID());
    commit((previous) => ({ ...previous, scripts: [retry, ...previous.scripts], selectedScriptIndex: 0, composedResultUrl: null }));
    setError(null);
    return true;
  }, [commit]);

  const bindVideoTask = useCallback(async (taskId: string) => {
    if (!salesJobAllowed(busyRef.current, 'render')) return '当前有任务进行中，请稍后再试';
    const script = stateRef.current.scripts[stateRef.current.selectedScriptIndex];
    const key = script?.renderSubmissionKey;
    if (!script || !key || script.renderStatus !== 'uncertain' || script.renderTaskId) return '当前记录无需绑定任务 ID';
    try {
      const bound = await bindSalesVideoTask(key, taskId.trim());
      commit((previous) => ({ ...previous, scripts: previous.scripts.map((item) => item.id === script.id ? { ...item, renderStatus: 'generating', renderTaskId: bound, renderError: undefined } : item) }));
      setError(null);
      void runRender({ resumeOnly: true });
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : '任务 ID 绑定失败';
    }
  }, [commit, runRender]);

  const resetProject = useCallback(async () => {
    const allowed = () => salesJobAllowed(busyRef.current, 'collect') && hasSalesProductContent(stateRef.current);
    if (resetPendingRef.current || !allowed()) return false;
    resetPendingRef.current = true;
    try {
      const confirmed = await confirmAction({
        title: '清空当前商品？', confirmText: '清空并更换商品',
        description: '将清空商品资料、商品图片、人物／人脸／场景参考、关联方案和当前成片引用，且无法撤销。保留生成设置、采集缓存、原始文件及服务端生成记录；不会取消服务商已提交的任务。',
      });
      if (!confirmed || !allowed()) return false;
      planTokenRef.current += 1;
      commit(clearSalesProduct);
      setPlanPhase(null);
      setRenderPhase(null);
      setError(null);
      return true;
    } finally {
      resetPendingRef.current = false;
    }
  }, [commit]);

  const clearError = useCallback(() => setError(null), []);

  return {
    state, updateState, ...stages,
    videoError: salesSingleVideoError(state, state.scripts[state.selectedScriptIndex]),
    videoSubmitError: salesSingleVideoError(state, state.scripts[state.selectedScriptIndex], true),
    isCollecting, isUploading, isPlanning, planPhase, isRendering, renderPhase, error,
    runProductCollect, addProductImages, markImageUnavailable, editShot, editFullPrompt,
    runPlan, runRender, stopRender, resetProject, prepareVideoRetry, bindVideoTask,
    clearError,
    stopWork: () => { planAbortRef.current?.abort(); uploadAbortRef.current?.abort(); collectAbortRef.current?.abort(); stages.stopAssets(); renderAbortRef.current?.abort(); },
  };
}
