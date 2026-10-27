import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { resolveModalityModelRoute } from '@shared/domain/models/modalityStorage';
import { eligibleSalesImages, omitSalesPriceClauses, omitSalesPriceProps, salesActualReferences, type VideoSalesScript } from '@shared/domain/sales';
import { salesAssetsGenerated } from '@shared/domain/sales/workflow';
import { confirmAction } from '@client/shared/utils/confirmAction';
import { defaultSalesImageBatchClient } from '../api/salesImageBatch';
import { generateSalesReferenceFrame } from '../api/salesMediaApi';
import { analyzeProductMedia, finalizeSalesPrompts } from '../api/videoSalesApi';
import { invalidateSalesState, salesAnalysisInputRevision } from '../model/salesStageRules';
import { prepareSalesCreativeAssets } from '../model/prepareSalesAssets';
import { canResubmitRejectedAsset, recoverSalesAssetReceipts, salesAssetSourceRevision, updateSalesCreativeAsset } from '../model/salesAssetHelpers';
import { assertSalesPlanCurrent, salesFinalInputRevision, salesSingleVideoError } from '../model/salesStageRules';
import { salesJobAllowed } from '../model/salesWorkspace';
import { writeSalesStudioDraft, type VideoSalesStudioState } from '../model/salesStudioDraft';

type Commit = (recipe: (previous: VideoSalesStudioState) => VideoSalesStudioState) => void;
type Busy = { collecting: boolean; planning: boolean; rendering: boolean; uploading: boolean };

export function useSalesCreativeStages(input: {
  stateRef: MutableRefObject<VideoSalesStudioState>;
  busyRef: MutableRefObject<Busy>;
  commit: Commit;
  setError: (error: string | null) => void;
}) {
  const { stateRef, busyRef, commit, setError } = input;
  const [isPreparingAssets, setIsPreparingAssets] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isQueryingAssets, setIsQueryingAssets] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const editAssetPrompt = useCallback((id: string, prompt: string) => {
    if (!salesJobAllowed(busyRef.current, 'plan')) return;
    const asset = stateRef.current.scripts[stateRef.current.selectedScriptIndex]?.assets?.find((item) => item.id === id);
    if (asset && ['generating', 'uncertain'].includes(asset.status || '') && !canResubmitRejectedAsset(asset)) { setError('请先查询或核实原图片任务，再修改提示词'); return; }
    if (asset?.prompt === prompt) return;
    commit((state) => ({ ...state, scripts: state.scripts.map((script, index) => index !== state.selectedScriptIndex ? script : updateSalesCreativeAsset(script, id, { prompt })) }));
  }, [busyRef, commit, setError, stateRef]);

  const runAssets = useCallback(async (regenerateId?: string, queryOnly = false) => {
    if (!salesJobAllowed(busyRef.current, 'plan')) return;
    const current = stateRef.current;
    const script = current.scripts[current.selectedScriptIndex];
    if (!script) { setError('请先生成创作方案'); return; }
    const asset = script.assets?.find((item) => item.id === regenerateId);
    if (!queryOnly && asset?.status === 'uncertain' && !asset.taskId && !canResubmitRejectedAsset(asset)) { setError('该图片提交结果未确认，请先核对生成记录，不能自动重投'); return; }
    busyRef.current.planning = true;
    setIsPreparingAssets(true);
    setIsQueryingAssets(queryOnly);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const commitScript = (recipe: (previous: VideoSalesScript) => VideoSalesScript) => commit((state) => ({
      ...state, scripts: state.scripts.map((item) => item.id === script.id && item.planRevision === script.planRevision ? recipe(item) : item),
    }));
    try {
      await recoverSalesAssetReceipts({ script: queryOnly && regenerateId ? { ...script, assets: script.assets?.filter((item) => item.id === regenerateId) } : script, isAborted: () => controller.signal.aborted,
        updateAsset: (id, patch) => commitScript((previous) => updateSalesCreativeAsset(previous, id, patch)),
      }, generateSalesReferenceFrame, defaultSalesImageBatchClient.lookup);
      if (queryOnly) return;
      if (current.category !== 'fashion') throw new Error('历史方案仅支持查询原图片任务；请选择服饰专属规则后更新脚本');
      const images = assertSalesPlanCurrent(current, script);
      if (asset?.url && !['generating', 'uncertain'].includes(asset.status || '') && !(await confirmAction({ title: '重新生成素材？', description: '本次将调用绘图模型，可能计费；依赖这张图片的素材也可能需要更新。', confirmText: '重新生成' }))) return;
      const image = resolveModalityModelRoute('image', current.selectedImageModel);
      // Existing receipts are queried rather than submitted again, even when a retry button was used.
      const force = asset?.taskId && ['generating', 'uncertain'].includes(asset.status || '') ? undefined : regenerateId;
      commitScript((previous) => ({ ...previous, finalizedRevision: undefined, assetValidation: 'pending' }));
      await prepareSalesCreativeAssets({
        script, images, imageModel: image.modelId || '', aspectRatio: current.aspectRatio,
        beforeSubmit: () => writeSalesStudioDraft(stateRef.current),
        selectedColor: current.colorSelection.colorLabel,
        regenerateId: force, isAborted: () => controller.signal.aborted,
        getScript: () => stateRef.current.scripts.find((item) => item.id === script.id) || script,
        updateAsset: (id, patch) => commitScript((previous) => updateSalesCreativeAsset(previous, id, patch)),
      }, defaultSalesImageBatchClient);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '素材准备失败');
    } finally {
      busyRef.current.planning = false;
      setIsPreparingAssets(false);
      setIsQueryingAssets(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [busyRef, commit, setError, stateRef]);

  const confirmAssets = useCallback(() => {
    if (!salesJobAllowed(busyRef.current, 'plan')) return false;
    const current = stateRef.current;
    const script = current.scripts[current.selectedScriptIndex];
    try {
      if (!script) throw new Error('请先生成创作方案');
      const images = assertSalesPlanCurrent(current, script);
      if (!salesAssetsGenerated(script)) throw new Error('请先生成所需素材，再确认图片');
      for (const asset of script.assets || []) {
        if (asset.url && asset.sourceRevision && asset.sourceRevision !== salesAssetSourceRevision(asset, images, script.assets || [], current.colorSelection.colorLabel, current.aspectRatio)) throw new Error(`${asset.label}的提示词或参考图片已变化，请重新生成此素材再确认`);
      }
      commit((state) => ({ ...state, scripts: state.scripts.map((item) => item.id !== script.id ? item : {
        ...item, assetValidation: 'passed', finalizedRevision: undefined,
        assets: item.assets?.map((asset) => asset.status === 'done' && asset.url ? { ...asset, validation: 'passed', validationSource: 'manual', validationReason: '人工已确认' } : asset),
      }) }));
      setError(null);
      return true;
    } catch (error) { setError(error instanceof Error ? error.message : '素材确认失败'); return false; }
  }, [busyRef, commit, setError, stateRef]);

  const runFinalize = useCallback(async () => {
    if (!salesJobAllowed(busyRef.current, 'plan')) return;
    const current = stateRef.current;
    const script = current.scripts[current.selectedScriptIndex];
    const capabilityError = salesSingleVideoError(current, script);
    if (capabilityError || !script) { setError(capabilityError); return; }
    busyRef.current.planning = true;
    setIsFinalizing(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const images = assertSalesPlanCurrent(current, script);
      const chat = resolveModalityModelRoute('chat', current.selectedChatModel);
      const video = resolveModalityModelRoute('video', current.selectedVideoModel);
      const revision = salesFinalInputRevision(current, script);
      const result = await finalizeSalesPrompts({
        workflowVersion: 3, operation: 'finalize', shots: script.shots, assets: script.assets!, imageCatalog: images,
        actualReferences: salesActualReferences(script, images), eligibleImageIndexes: images.map((item) => item.index),
        selectedColor: current.colorSelection.colorLabel,
        category: current.category, targetDuration: current.targetDuration, aspectRatio: current.aspectRatio,
        productAnalysis: current.analysis ? JSON.stringify(current.analysis) : undefined,
        productDescription: JSON.stringify({ originalProductProperties: omitSalesPriceProps(current.props), creativeSellingPoints: omitSalesPriceClauses(current.sellingPoints) }),
        videoModel: video.modelId, videoRefMode: current.videoRefMode, videoResolution: current.videoResolution,
        model: chat.modelId, textProtocol: chat.textProtocol, customBaseUrl: chat.baseUrl, customApiKey: chat.apiKey, signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (!result.fullPrompt?.trim() || result.prompts.length !== script.shots.length
        || new Set(result.prompts.map((item) => item.shotId)).size !== script.shots.length
        || script.shots.some((shot) => !result.prompts.some((item) => item.shotId === shot.shotId && item.prompt?.trim()))) throw new Error('完整视频提示词不完整');
      commit((state) => ({ ...state, scripts: state.scripts.map((item) => item.id === script.id && salesFinalInputRevision(state, item) === revision ? {
        ...item, fullPrompt: result.fullPrompt!.trim(), finalizedRevision: revision, finalStaleReason: undefined,
        shots: item.shots.map((shot) => ({ ...shot, finalPrompt: result.prompts.find((prompt) => prompt.shotId === shot.shotId)!.prompt, promptStale: false })),
      } : item) }));
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '视频提示词合成失败');
    } finally {
      busyRef.current.planning = false;
      setIsFinalizing(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [busyRef, commit, setError, stateRef]);

  const runProductAnalyze = useCallback(async () => {
    if (!salesJobAllowed(busyRef.current, 'plan')) return false;
    const current = stateRef.current;
    if (current.category !== 'fashion') { setError('当前仅接入服饰、鞋、包技能，请先选择服饰专属规则'); return false; }
    if (!current.productName.trim()) { setError('请先采集或填写商品名称'); return false; }
    const images = eligibleSalesImages(current.imageCatalog, current.colorSelection, current.variantMetadata);
    if (current.analysis && current.analysisRevision === salesAnalysisInputRevision(current)) return true;
    if (!images.length) { setError('请先选择至少一张用于生成的商品图'); return false; }
    const chat = resolveModalityModelRoute('chat', current.selectedChatModel);
    if (!chat.modelId) { setError('请先在下方创作设置中选择卖点与脚本模型'); return false; }
    busyRef.current.planning = true;
    setIsAnalyzing(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const activeVariant = current.variantMetadata?.variants.find((v) => v.id === (current.colorSelection.variantId || current.variantMetadata?.selectedVariantId));
      const selectedColor = current.colorSelection.colorLabel || activeVariant?.color || activeVariant?.label || '';
      const productDescription = JSON.stringify({
        suppliedSellingPoints: omitSalesPriceClauses(current.sellingPoints),
        originalProductProperties: omitSalesPriceProps(current.props || {}),
      });
      const analysis = await analyzeProductMedia({
        workflowVersion: 3,
        eligibleImageIndexes: images.map((img) => img.index),
        imageCatalog: images,
        productName: current.productName,
        brand: current.brand,
        productDescription,
        category: current.category,
        selectedColor,
        aspectRatio: current.aspectRatio || '9:16',
        model: chat.modelId,
        textProtocol: chat.textProtocol,
        customBaseUrl: chat.baseUrl,
        customApiKey: chat.apiKey,
        signal: controller.signal,
      });
      if (controller.signal.aborted || salesAnalysisInputRevision(stateRef.current) !== salesAnalysisInputRevision(current)) return false;
      const refinedPoints = (analysis.sellingPoints || []).map((item) => item.trim()).filter(Boolean).join('；');
      commit((prev) => {
        const next = invalidateSalesState(prev, refinedPoints ? { sellingPoints: refinedPoints } : {});
        return { ...next, analysis, analysisRevision: salesAnalysisInputRevision(next) };
      });
      return true;
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'AI 提炼商品卖点失败');
      return false;
    } finally {
      busyRef.current.planning = false;
      setIsAnalyzing(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [busyRef, commit, setError, stateRef]);

  return { isPreparingAssets, isQueryingAssets, isFinalizing, isAnalyzing, runAssets, runFinalize, runProductAnalyze, confirmAssets, editAssetPrompt, stopAssets: () => abortRef.current?.abort() };
}
