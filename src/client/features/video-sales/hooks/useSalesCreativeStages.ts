import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { resolveModalityModelRoute } from '@shared/domain/models/modalityStorage';
import { salesActualReferences, type VideoSalesScript } from '@shared/domain/video-sales';
import { confirmAction } from '@client/shared/utils/confirmAction';
import { defaultSalesImageBatchClient } from '../api/salesImageBatch';
import { generateSalesReferenceFrame } from '../api/salesMediaApi';
import { finalizeSalesPrompts, validateSalesAssets } from '../api/videoSalesApi';
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
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const editAssetPrompt = useCallback((id: string, prompt: string) => {
    if (!salesJobAllowed(busyRef.current, 'plan')) return;
    commit((state) => ({ ...state, scripts: state.scripts.map((script, index) => index !== state.selectedScriptIndex ? script : {
      ...script, finalizedRevision: undefined, assetValidation: 'pending',
      assets: script.assets?.map((asset) => asset.id === id ? { ...asset, prompt, validation: 'pending' } : asset),
    }) }));
  }, [busyRef, commit]);

  const runAssets = useCallback(async (regenerateId?: string, queryOnly = false, validateOnly = false) => {
    if (!salesJobAllowed(busyRef.current, 'plan')) return;
    const current = stateRef.current;
    const script = current.scripts[current.selectedScriptIndex];
    if (!script) { setError('请先生成创作方案'); return; }
    const asset = script.assets?.find((item) => item.id === regenerateId);
    if (asset?.status === 'uncertain' && !asset.taskId && !canResubmitRejectedAsset(asset)) { setError('该图片提交结果未确认，请先核对生成记录，不能自动重投'); return; }
    busyRef.current.planning = true;
    setIsPreparingAssets(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const commitScript = (recipe: (previous: VideoSalesScript) => VideoSalesScript) => commit((state) => ({
      ...state, scripts: state.scripts.map((item) => item.id === script.id && item.planRevision === script.planRevision ? recipe(item) : item),
    }));
    try {
      await recoverSalesAssetReceipts({ script, isAborted: () => controller.signal.aborted,
        updateAsset: (id, patch) => commitScript((previous) => ({ ...previous, assetValidation: 'pending', finalizedRevision: undefined, assets: previous.assets?.map((item) => item.id === id ? { ...item, ...patch } : item) })),
      }, generateSalesReferenceFrame);
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
        regenerateId: force, validateOnly, isAborted: () => controller.signal.aborted,
        route: { model: route.modelId, textProtocol: route.textProtocol, customBaseUrl: route.baseUrl, customApiKey: route.apiKey, signal: controller.signal },
        getScript: () => stateRef.current.scripts.find((item) => item.id === script.id) || script,
        updateAsset: (id, patch) => commitScript((previous) => ({ ...previous, assets: previous.assets?.map((item) => item.id === id ? { ...item, ...patch } : item) })),
        setValidation: (status) => commitScript((previous) => ({ ...previous, assetValidation: status })),
      }, defaultSalesImageBatchClient, validateSalesAssets);
    } catch (err) {
      setError(err instanceof Error ? err.message : '素材准备失败');
    } finally {
      busyRef.current.planning = false;
      setIsPreparingAssets(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
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
      const revision = salesFinalInputRevision(current, script, video.modelId!);
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
      commit((state) => ({ ...state, scripts: state.scripts.map((item) => item.id === script.id && salesFinalInputRevision(state, item, video.modelId!) === revision ? {
        ...item, fullPrompt: result.fullPrompt!.trim(), finalizedRevision: revision,
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

  return { isPreparingAssets, isFinalizing, runAssets, runFinalize, editAssetPrompt, stopAssets: () => abortRef.current?.abort() };
}
