import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { resolveModalityModelRoute } from '@shared/domain/models/modalityStorage';
import { eligibleSalesImages, omitSalesPriceClauses, omitSalesPriceProps, salesActualReferences, type VideoSalesScript } from '@shared/domain/sales';
import { salesAssetsGenerated } from '@shared/domain/sales/workflow';
import { confirmAction } from '@client/shared/utils/confirmAction';
import { defaultSalesImageBatchClient } from '../api/salesImageBatch';
import { generateSalesReferenceFrame } from '../api/salesMediaApi';
import { analyzeProductMedia, finalizeSalesPrompts, validateSalesAssets } from '../api/videoSalesApi';
import { invalidateSalesState } from '../model/salesStageRules';
import { prepareSalesCreativeAssets } from '../model/prepareSalesAssets';
import { canResubmitRejectedAsset, recoverSalesAssetReceipts } from '../model/salesAssetHelpers';
import { assertSalesPlanCurrent, salesFinalInputRevision, salesSingleVideoError } from '../model/salesStageRules';
import { salesJobAllowed } from '../model/salesWorkspace';
import type { VideoSalesStudioState } from '../model/salesStudioDraft';

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
  const [isValidatingAssets, setIsValidatingAssets] = useState(false);
  const [isQueryingAssets, setIsQueryingAssets] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const editAssetPrompt = useCallback((id: string, prompt: string) => {
    if (!salesJobAllowed(busyRef.current, 'plan')) return;
    commit((state) => ({ ...state, scripts: state.scripts.map((script, index) => index !== state.selectedScriptIndex ? script : {
      ...script, finalizedRevision: undefined, assetValidation: 'pending',
      assets: script.assets?.map((asset) => asset.id === id ? { ...asset, prompt, validation: 'pending', validationSource: undefined } : asset),
    }) }));
  }, [busyRef, commit]);

  const runAssets = useCallback(async (regenerateId?: string, queryOnly = false, validateOnly = false) => {
    if (!salesJobAllowed(busyRef.current, 'plan')) return;
    const current = stateRef.current;
    const script = current.scripts[current.selectedScriptIndex];
    if (!script) { setError('请先生成创作方案'); return; }
    const asset = script.assets?.find((item) => item.id === regenerateId);
    if (!queryOnly && asset?.status === 'uncertain' && !asset.taskId && !canResubmitRejectedAsset(asset)) { setError('该图片提交结果未确认，请先核对生成记录，不能自动重投'); return; }
    busyRef.current.planning = true;
    setIsPreparingAssets(true);
    setIsValidatingAssets(validateOnly);
    setIsQueryingAssets(queryOnly);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const commitScript = (recipe: (previous: VideoSalesScript) => VideoSalesScript) => commit((state) => ({
      ...state, scripts: state.scripts.map((item) => item.id === script.id && item.planRevision === script.planRevision ? recipe(item) : item),
    }));
    try {
      await recoverSalesAssetReceipts({ script: queryOnly && regenerateId ? { ...script, assets: script.assets?.filter((item) => item.id === regenerateId) } : script, isAborted: () => controller.signal.aborted,
        updateAsset: (id, patch) => commitScript((previous) => ({ ...previous, assetValidation: 'pending', finalizedRevision: undefined, assets: previous.assets?.map((item) => item.id === id ? { ...item, ...patch } : item) })),
      }, generateSalesReferenceFrame, defaultSalesImageBatchClient.lookup);
      if (queryOnly) return;
      const images = assertSalesPlanCurrent(current, script);
      if (asset?.url && !['generating', 'uncertain'].includes(asset.status || '') && !(await confirmAction({ title: '重新生成素材？', description: '本次将调用绘图模型，可能计费；依赖这张图片的素材也可能需要更新。', confirmText: '重新生成' }))) return;
      const route = resolveModalityModelRoute('chat', current.selectedChatModel);
      const image = resolveModalityModelRoute('image', current.selectedImageModel);
      // Existing receipts are queried rather than submitted again, even when a retry button was used.
      const force = asset?.taskId && ['generating', 'uncertain'].includes(asset.status || '') ? undefined : regenerateId;
      commitScript((previous) => ({ ...previous, finalizedRevision: undefined, assetValidation: 'pending' }));
      await prepareSalesCreativeAssets({
        script, images, imageModel: image.modelId || '', aspectRatio: current.aspectRatio,
        selectedColor: current.colorSelection.colorLabel, productAnalysis: JSON.stringify(current.analysis || {}),
        regenerateId: force, validateOnly, autoValidate: false, isAborted: () => controller.signal.aborted,
        route: { model: route.modelId, textProtocol: route.textProtocol, customBaseUrl: route.baseUrl, customApiKey: route.apiKey, signal: controller.signal },
        getScript: () => stateRef.current.scripts.find((item) => item.id === script.id) || script,
        updateAsset: (id, patch) => commitScript((previous) => ({ ...previous, assets: previous.assets?.map((item) => item.id === id ? { ...item, ...patch } : item) })),
        setValidation: (status) => commitScript((previous) => ({ ...previous, assetValidation: status })),
      }, defaultSalesImageBatchClient, validateSalesAssets);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '素材准备失败');
    } finally {
      busyRef.current.planning = false;
      setIsPreparingAssets(false);
      setIsValidatingAssets(false);
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
      assertSalesPlanCurrent(current, script);
      if (!salesAssetsGenerated(script)) throw new Error('请先生成所需素材，再确认图片');
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
        workflowVersion: 3, operation: 'finalize', shots: script.shots, assets: script.assets, imageCatalog: images,
        actualReferences: salesActualReferences(script, images), eligibleImageIndexes: images.map((item) => item.index),
        selectedColor: current.colorSelection.colorLabel, productAnalysis: JSON.stringify(current.analysis || {}),
        category: current.category, targetDuration: current.targetDuration, aspectRatio: current.aspectRatio,
        videoModel: video.modelId, videoRefMode: current.videoRefMode, videoResolution: current.videoResolution,
        model: chat.modelId, textProtocol: chat.textProtocol, customBaseUrl: chat.baseUrl, customApiKey: chat.apiKey, signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (!result.fullPrompt?.trim() || result.prompts.length !== script.shots.length
        || new Set(result.prompts.map((item) => item.shotId)).size !== script.shots.length
        || script.shots.some((shot) => !result.prompts.some((item) => item.shotId === shot.shotId && item.prompt?.trim()))) throw new Error('视频提示词定稿不完整');
      commit((state) => ({ ...state, scripts: state.scripts.map((item) => item.id === script.id && salesFinalInputRevision(state, item) === revision ? {
        ...item, fullPrompt: result.fullPrompt!.trim(), finalizedRevision: revision, finalStaleReason: undefined,
        shots: item.shots.map((shot) => ({ ...shot, finalPrompt: result.prompts.find((prompt) => prompt.shotId === shot.shotId)!.prompt, promptStale: false })),
      } : item) }));
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '视频定稿失败');
    } finally {
      busyRef.current.planning = false;
      setIsFinalizing(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [busyRef, commit, setError, stateRef]);

  const runProductAnalyze = useCallback(async () => {
    if (!salesJobAllowed(busyRef.current, 'plan')) return false;
    const current = stateRef.current;
    if (!current.productName.trim()) { setError('请先采集或填写商品名称'); return false; }
    const selectedImages = eligibleSalesImages(current.imageCatalog, current.colorSelection, current.variantMetadata);
    const fallbackImages = current.imageCatalog.filter((img) => img.url.trim() && !img.unavailable).slice(0, 4);
    const images = selectedImages.length > 0 ? selectedImages : fallbackImages;
    if (!images.length) { setError('请先采集或上传至少一张商品图'); return false; }
    const chat = resolveModalityModelRoute('chat', current.selectedChatModel);
    if (!chat.modelId) { setError('请先在下方创作设置中选择多模态分析与口播模型'); return false; }
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
      if (controller.signal.aborted) return false;
      const refinedPoints = (analysis.sellingPoints || []).map((item) => item.trim()).filter(Boolean).join('；');
      commit((prev) => ({
        ...invalidateSalesState(prev, refinedPoints ? { sellingPoints: refinedPoints } : {}),
        analysis,
      }));
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

  return { isPreparingAssets, isValidatingAssets, isQueryingAssets, isFinalizing, isAnalyzing, runAssets, runFinalize, runProductAnalyze, confirmAssets, editAssetPrompt, stopAssets: () => abortRef.current?.abort() };
}
