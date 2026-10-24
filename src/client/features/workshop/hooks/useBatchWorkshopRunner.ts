import { workshopAnalysisBlockReason } from '../model/analysis/workshopAnalysisPreflight';
import { useWorkshopAnalysis } from './useWorkshopAnalysis';
import { useFreshWorkshopEntry } from './useFreshWorkshopEntry';
import { deriveWorkshopPipelineStatus } from '../model/workspace/workshopPipelineStatus';
import { useLiveItems } from './useLiveItems';
import { useWorkshopTaskRecovery } from './useWorkshopTaskRecovery';
import { recheckWorkshopTask } from '../model/generation/recheckWorkshopTask';
import { useState, useRef, useEffect, useCallback } from 'react';
import { PreviousGroupSignature } from '@shared/domain/prompts/vision';
import { applyInvalidationToItems } from '../model/workspace/applyInvalidation';
import { createRunControl } from '../model/workspace/runControl';
import { useBatchExport } from './useBatchExport';
import { useBatchReview } from './useBatchReview';
import { useWorkspaceSnapshotSync } from './useWorkspaceSnapshotSync';
import { useWorkshopShotCount } from './useWorkshopShotCount';
import { 
  BatchProductItem, 
  GenerationStrategy,
} from '../model/batchTypes';
import type { VisionAnalyzeDeps } from '../model/analysis/batchVisionAnalyze';
import { useAppStore } from '@client/store';

// 🚀 模块化外抽能力
import { usePersistentNumber, usePersistentEnum } from '@client/shared/hooks/usePersistentState';
import { useBatchPreviewGallery, useBatchToast } from './useBatchPreviewGallery';
import { useBatchWorkshopResources } from './useBatchWorkshopResources';
import { useBatchWorkshopImports } from './useBatchWorkshopImports';
import { useBatchCopywriting } from './useBatchCopywriting';
import { useWorkshopAssetLocks } from './useWorkshopAssetLocks';
import { useBatchCollection } from './useBatchCollection';
import { useBatchImageSelection } from './useBatchImageSelection';
import { useBatchRunControl } from './useBatchRunControl';
import {
  type TaskExecutionConfig,
} from '../model/generation/batchTaskExecution';
import { useWorkshopGeneration } from './useWorkshopGeneration';
import { useLiveWorkshopWorkspace } from './useLiveWorkshopWorkspace';
import type { WorkshopSnapshot } from '@shared/contracts/workshopWorkspace';

export function useBatchWorkshopRunner() {
  const [currentStage, setCurrentStage] = useState<number>(1);

  // 阶段 1: 批量采编与清洗状态
  const [batchInputText, setBatchInputText] = useState('');
  const { items, itemsRef, setItems } = useLiveItems();

  // 配方库（工坊技能与全局 store 同步，支持资产中心「载入配方」）
  const selectedArchId = useAppStore((s) => s.selectedArchId);
  const setSelectedArchId = useAppStore((s) => s.setSelectedArchId);
  const originalAnchorFaceImageUrl = useAppStore((s) => (
    s.workshopMode === 'storyboard_generate' && s.originalIsAnchorFaceConfirmed
      ? s.originalAnchorFaceImageUrl
      : undefined
  ));

  const {
    recipes, availableVisionModels, selectedVisionModel, setSelectedVisionModel,
    availableImageModels, selectedImageGenModel, setSelectedImageGenModel,
  } = useBatchWorkshopResources(setSelectedArchId);

  // 人像与参数配置
  const [personaMode, setPersonaMode] = useState<'asset_driven' | 'none'>('asset_driven');
  const [planRevision, setPlanRevision] = useState(0);
  const [storyboardRevision, setStoryboardRevision] = useState(0);
  const [pipelineRuns, setPipelineRuns] = useState<WorkshopSnapshot['pipeline']['runs']>([]);
  const [selectedQuality, setSelectedQuality] = useState<'high' | 'medium' | 'low'>('high');
  const [selectedAspect, setSelectedAspect] = useState<'3:4' | '1:1' | '9:16' | '16:9'>('3:4');
  const [gridOutputSize, setGridOutputSize] = useState<string | undefined>();

  // 优先恢复工坊设置；首次使用时沿用首页分镜预设。
  const [selectedShotCount, setSelectedShotCount] = useWorkshopShotCount();


  // 持久化状态收敛
  const [analyzeConcurrency, setAnalyzeConcurrency] = usePersistentNumber('workshop_analyze_concurrency', {
    fallback: 2,
    min: 1,
    max: 6,
  });

  const [imageGenConcurrency, setImageGenConcurrency] = usePersistentNumber('workshop_batch_concurrency', {
    fallback: 4,
    min: 1,
    max: 50,
  });

  const [generationStrategy, setGenerationStrategy] = usePersistentEnum<GenerationStrategy>('workshop_generation_strategy', {
    fallback: 'single_shot',
    isValid: (v): v is GenerationStrategy => v === 'grid_first' || v === 'single_shot',
  });
  // 文案自动生成是批次配置：关闭后仍可在交付页手动写作或按需生成。
  const [autoGenerateCopywriting, setAutoGenerateCopywriting] = useState(true);
  const [activeImgFilter, setActiveImgFilter] = useState<'all' | 'main' | 'sku' | 'detail'>('all');
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const analyzeConfigRevisionRef = useRef(0);
  const handleAppliedBinding = useCallback(() => {
    analyzeConfigRevisionRef.current += 1;
    setItems((previous) => applyInvalidationToItems(previous, { type: 'locked_assets' }));
    setStoryboardRevision((revision) => revision + 1);
  }, [setItems]);
  const assetLocks = useWorkshopAssetLocks(workspaceReady, handleAppliedBinding);
  const {
    useAssetLibrary, setUseAssetLibrary, lockedPersonaId, setLockedPersonaId, lockedSceneId, setLockedSceneId,
    lockedOutfitId, setLockedOutfitId, lockedActionId, setLockedActionId, lockedFullPromptId, setLockedFullPromptId,
    promptGroupFolderId, setPromptGroupFolderId,
    availablePersonas, availableScenes, availableOutfits, availableActions, availableFullPrompts, availableProductCategories,
  } = assetLocks;

  // 批量生图与进度
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [exportingSingleItemId, setExportingSingleItemId] = useState<string | null>(null);

  // 预览画廊与 Toast
  const {
    previewImageUrl,
    previewGallery,
    openGalleryPreview,
    closeGalleryPreview,
    setGalleryIndex,
    handleSetPreviewImageUrl,
  } = useBatchPreviewGallery();

  const { toastMsg, showToast } = useBatchToast();


  const activeBatchIdRef = useRef('draft');
  const batchGroupSignaturesRef = useRef<PreviousGroupSignature[]>([]);
  const batchActionIdsRef = useRef<string[]>([]);
  const batchSceneIdsRef = useRef<string[]>([]);

  useBatchWorkshopImports({ workspaceReady, setCurrentStage, setItems, showToast });

  const successfulItems = items.filter((i) => i.status === 'success' && i.selected);

  const { isCollecting, collectProgress, collectInFlight, handleRemoveItem, handleParseInput, startBatchCollect } = useBatchCollection({
    items, itemsRef, setItems, batchInputText, setBatchInputText, showToast, onCollected: () => setCurrentStage(stage => stage === 1 ? 2 : stage),
  });

  const { toggleProductImageSelection, batchSetProductImages } = useBatchImageSelection(setItems);

  const invalidateWorkshopConfig = (type: 'architecture' | 'shot_count' | 'locked_assets') => {
    analyzeConfigRevisionRef.current += 1;
    setItems((prev) => applyInvalidationToItems(prev, { type }));
    setStoryboardRevision((revision) => revision + 1);
  };
  const changeSelectedArchId = (id: string) => {
    if (id === selectedArchId) return;
    setSelectedArchId(id);
    invalidateWorkshopConfig('architecture');
  };
  useEffect(() => {
    const applied = () => {
      analyzeConfigRevisionRef.current += 1;
      setItems(previous => applyInvalidationToItems(previous, { type: 'architecture' }));
      setStoryboardRevision(revision => revision + 1);
    };
    window.addEventListener('workshop-skill-applied', applied);
    return () => window.removeEventListener('workshop-skill-applied', applied);
  }, [setItems]);
  const changeSelectedShotCount = (count: number) => {
    if (count === selectedShotCount) return;
    setSelectedShotCount(count);
    invalidateWorkshopConfig('shot_count');
  };
  const changeLockedAsset = (apply: (value: string) => void, current: string) => (value: string) => {
    if (value === current) return;
    apply(value);
    invalidateWorkshopConfig('locked_assets');
  };

  const {
    runControlRef, isAutoPilotRunning, startAutoPilotPipeline,
    pauseRun, resumeRun, cancelRun, acknowledgeRecovery, completeCurrentBatch,
  } = useBatchRunControl({
    successfulItems, getItems: () => itemsRef.current, setItems,
    startBatchVisionAnalyze: (...args) => startBatchVisionAnalyze(...args),
    setCurrentStage, showToast,
    isBusy: () => isGeneratingBatch || isAnalyzingAll || isCollecting || isAutoPilotRunning
      || itemsRef.current.some(item => item.isAnalyzing || item.isCopywritingGenerating || item.tasks.some(task => task.status === 'IN_PROGRESS')),
    archiveCurrentBatch: () => workspace.archiveCurrentBatch(true),
  });

  // 视觉分析
  const visionAnalyzeDeps: VisionAnalyzeDeps = {
    assetLoadState: assetLocks.assetLoadState, assetLoadError: assetLocks.assetLoadError, availableFullPrompts,
    promptGroupFolderId, availableProductCategories,
    recipes,
    selectedArchId,
    items,
    availablePersonas,
    availableScenes,
    availableOutfits,
    selectedShotCount,
    lockedPersonaId,
    lockedSceneId,
    lockedOutfitId,
    lockedActionId,
    lockedFullPromptId,
    personaMode,
    selectedVisionModel,
    availableVisionModels: availableVisionModels.map((m) => ({ id: m.id })),
    useAssetLibrary,
    setItems,
    getItems: () => itemsRef.current,
    getConfigRevision: () => analyzeConfigRevisionRef.current,
    batchGroupSignaturesRef,
    batchActionIdsRef,
    batchSceneIdsRef,
    batchId: activeBatchIdRef.current,
  };

  const { isAnalyzingAll, analyzeProgress, analysisInFlight, analyzeSingleProduct, startBatchVisionAnalyze } = useWorkshopAnalysis({
    deps: visionAnalyzeDeps, itemsRef, setItems, recipes, selectedArchId, showToast,
    analyzeConcurrency, runControlRef,
  });

  // 任务执行配置
  const taskExecutionConfig: TaskExecutionConfig = {
    selectedQuality,
    selectedAspect,
    gridOutputSize,
    selectedImageGenModel,
    selectedShotCount,
    lockedSceneId,
    availableScenes,
    anchorFaceUrl: originalAnchorFaceImageUrl,
    isAborted: () => runControlRef.current.status === 'cancelled',
    isPaused: () => runControlRef.current.status === 'paused',
  };

  const { generateCopywritingForProduct, updateItemCopywriting, generateAllCopywriting } = useBatchCopywriting({
    getItems: () => itemsRef.current, setItems, selectedVisionModel, showToast, analyzeConcurrency,
  });

  const {
    isGeneratingBatch, totalTaskCount, completedTaskCount, successTaskCount, failTaskCount,
    startBatchGeneration, retryFailedImageTasks, retrySingleShotTask,
  } = useWorkshopGeneration({
    config: taskExecutionConfig,
    generationStrategy,
    imageGenConcurrency,
    itemsRef,
    setItems,
    runControlRef,
    batchId: activeBatchIdRef.current,
    storyboardRevision,
    showToast,
    setCurrentStage,
    autoGenerateCopywriting,
    generateAllCopywriting,
    successfulItems,
    createCheckpoint: () => workspace.createCheckpoint(),
  });

  const delivery = useBatchExport(itemsRef, showToast, setIsExportingZip, setExportingSingleItemId);

  const { reviewTask, reviewBatch, isReviewingOutputs } = useBatchReview(itemsRef, setItems, retrySingleShotTask, showToast, () => workspace.flush());

  const applyWorkspaceSnapshot = useCallback((value: WorkshopSnapshot) => {
    setCurrentStage(value.currentStage);
    setBatchInputText(value.batchInputText);
    setItems(value.items as BatchProductItem[]);
    setSelectedVisionModel(value.settings.selectedVisionModel);
    setSelectedImageGenModel(value.settings.selectedImageGenModel);
    setSelectedArchId(value.settings.selectedArchId);
    setPersonaMode(value.settings.personaMode || 'asset_driven');
    runControlRef.current = createRunControl();
    setPlanRevision(value.pipeline?.planRevision || 0);
    setStoryboardRevision(value.pipeline?.storyboardRevision || 0);
    setSelectedQuality(value.settings.selectedQuality);
    setSelectedAspect(value.settings.selectedAspect);
    setGridOutputSize(value.settings.gridOutputSize);
    setSelectedShotCount(value.settings.selectedShotCount);
    setUseAssetLibrary(value.settings.useAssetLibrary);
    setLockedPersonaId(value.settings.lockedPersonaId || 'auto');
    setLockedSceneId(value.settings.lockedSceneId || 'auto');
    setLockedOutfitId(value.settings.lockedOutfitId || 'auto');
    setLockedActionId(value.settings.lockedActionId || 'auto');
    setLockedFullPromptId(value.settings.lockedFullPromptId || 'auto');
    setPromptGroupFolderId(value.settings.promptGroupFolderId || 'auto');
    setGenerationStrategy(value.settings.generationStrategy);
    setAutoGenerateCopywriting(value.settings.autoGenerateCopywriting);
    batchGroupSignaturesRef.current = value.pipeline?.diversityContext?.groupSignatures || [];
    batchActionIdsRef.current = value.pipeline?.diversityContext?.actionIds || [];
    batchSceneIdsRef.current = value.pipeline?.diversityContext?.sceneIds || [];
    setPipelineRuns(value.pipeline?.runs || []);
  }, [runControlRef, setItems, setSelectedVisionModel, setSelectedImageGenModel, setSelectedArchId, setSelectedShotCount, setUseAssetLibrary, setLockedPersonaId, setLockedSceneId, setLockedOutfitId, setLockedActionId, setLockedFullPromptId, setPromptGroupFolderId, setGenerationStrategy]);

  const effectivePipelineStatus = deriveWorkshopPipelineStatus(items, {
    collecting: isCollecting, analyzing: isAnalyzingAll, generating: isGeneratingBatch,
    control: runControlRef.current.status,
  });
  const workspace = useLiveWorkshopWorkspace({
    currentStage, batchInputText, items,
    selectedVisionModel, selectedImageGenModel, selectedArchId,
    selectedQuality, selectedAspect, gridOutputSize, selectedShotCount,
    useAssetLibrary, lockedPersonaId, lockedSceneId, lockedOutfitId, lockedActionId, lockedFullPromptId,
    promptGroupFolderId,
    generationStrategy, autoGenerateCopywriting,
    personaMode, pipelineStatus: effectivePipelineStatus, planRevision, storyboardRevision,
    pipelineRuns,
    diversityContext: {
      groupSignatures: batchGroupSignaturesRef.current,
      actionIds: batchActionIdsRef.current,
      sceneIds: batchSceneIdsRef.current,
    },
  }, applyWorkspaceSnapshot, () => itemsRef.current);
  activeBatchIdRef.current = workspace.activeBatch?.id || 'draft';

  useWorkshopTaskRecovery(workspace.ready, activeBatchIdRef.current, itemsRef, setItems, {
    selectedAspect, selectedQuality, selectedImageGenModel, gridOutputSize,
  });

  useEffect(() => {
    setWorkspaceReady(workspace.ready);
  }, [workspace.ready]);

  useWorkspaceSnapshotSync(workspace.ready, currentStage, setCurrentStage, itemsRef);

  const whenIdle = async (action: () => Promise<void>) => {
    if (collectInFlight.current || analysisInFlight.current || isGeneratingBatch || isAutoPilotRunning || isReviewingOutputs || itemsRef.current.some(item => item.isAnalyzing || item.isCopywritingGenerating || item.tasks.some(task => task.status === 'IN_PROGRESS'))) {
      throw new Error('仍有任务执行中，请等待结束后再切换批次');
    }
    await action();
  };

  const enteringFreshBatch = useFreshWorkshopEntry(workspace.ready, () => whenIdle(workspace.startFreshEntry), showToast);

  return {
    assetLoadState: assetLocks.assetLoadState, assetLoadError: assetLocks.assetLoadError, reloadAssets: assetLocks.reloadAssets,
    analysisIssue: successfulItems.map(item => workshopAnalysisBlockReason(visionAnalyzeDeps, item)).find(Boolean) || null,
    currentStage,
    setCurrentStage,
    batchInputText,
    setBatchInputText,
    items,
    setItems,
    isCollecting,
    collectProgress,
    successfulItems,
    handleRemoveItem,
    handleParseInput,
    startBatchCollect,
    recipes,
    selectedArchId,
    setSelectedArchId: changeSelectedArchId,
    availableVisionModels,
    selectedVisionModel,
    setSelectedVisionModel,
    availableImageModels,
    selectedImageGenModel,
    setSelectedImageGenModel,
    personaMode,
    setPersonaMode: (value: 'asset_driven' | 'none') => { if (value !== personaMode) { setPersonaMode(value); invalidateWorkshopConfig('locked_assets'); } },
    pipelineStatus: effectivePipelineStatus,
    useAssetLibrary,
    setUseAssetLibrary: (value: boolean) => { if (value !== useAssetLibrary) { setUseAssetLibrary(value); invalidateWorkshopConfig('locked_assets'); } },
    lockedPersonaId,
    setLockedPersonaId: changeLockedAsset(setLockedPersonaId, lockedPersonaId),
    lockedSceneId,
    setLockedSceneId: changeLockedAsset(setLockedSceneId, lockedSceneId),
    lockedOutfitId,
    setLockedOutfitId: changeLockedAsset(setLockedOutfitId, lockedOutfitId),
    lockedActionId,
    setLockedActionId: changeLockedAsset(setLockedActionId, lockedActionId),
    lockedFullPromptId,
    setLockedFullPromptId: changeLockedAsset(setLockedFullPromptId, lockedFullPromptId),
    promptGroupFolderId,
    setPromptGroupFolderId: changeLockedAsset(setPromptGroupFolderId, promptGroupFolderId),
    availablePersonas,
    availableScenes,
    availableOutfits,
    availableActions,
    availableFullPrompts,
    availableProductCategories,
    selectedQuality,
    setSelectedQuality,
    selectedAspect,
    setSelectedAspect,
    gridOutputSize,
    setGridOutputSize,
    selectedShotCount,
    setSelectedShotCount: changeSelectedShotCount,
    isAnalyzingAll,
    analyzeProgress,
    activeImgFilter,
    setActiveImgFilter,
    toggleProductImageSelection,
    batchSetProductImages,
    analyzeSingleProduct,
    startBatchVisionAnalyze,
    analyzeConcurrency,
    setAnalyzeConcurrency,
    isGeneratingBatch,
    totalTaskCount,
    completedTaskCount,
    successTaskCount,
    failTaskCount,
    startBatchGeneration,
    retryFailedImageTasks,
    retrySingleShotTask,
    recheckTask: (itemId: string, taskId: string) => recheckWorkshopTask(itemId, taskId, itemsRef.current, setItems, showToast, {
      selectedAspect, selectedQuality, selectedImageGenModel, gridOutputSize,
    }),
    generateCopywritingForProduct,
    updateItemCopywriting,
    generateAllCopywriting,
    isExportingZip,
    exportingSingleItemId,
    ...delivery,
    generationStrategy,
    setGenerationStrategy,
    autoGenerateCopywriting,
    setAutoGenerateCopywriting,
    imageGenConcurrency,
    setImageGenConcurrency,
    previewImageUrl,
    setPreviewImageUrl: handleSetPreviewImageUrl,
    previewGallery,
    openGalleryPreview,
    closeGalleryPreview,
    setGalleryIndex,
    isAutoPilotRunning,
    startAutoPilotPipeline,
    pauseRun,
    resumeRun,
    cancelRun,
    acknowledgeRecovery,
    completeCurrentBatch,
    reviewTask,
    reviewBatch,
    isReviewingOutputs,
    toastMsg,
    showToast,
    workspaceError: workspace.error,
    workspaceStatus: workspace.status,
    workspaceSaveActions: { retry: workspace.retrySave, download: workspace.downloadDraft },
    reloadWorkspace: async () => {
      try { await whenIdle(workspace.reload); }
      catch (error) { showToast(error instanceof Error ? error.message : '无法重新加载批次'); }
    },
    workspaceReady: workspace.ready && !enteringFreshBatch,
    activeBatch: workspace.activeBatch,
    historyBatches: workspace.historyBatches,
    refreshBatchHistory: workspace.refreshHistory,
    createNewBatch: () => whenIdle(() => workspace.createNewBatch()),
    duplicateBatch: (id: string) => whenIdle(() => workspace.duplicateBatch(id)),
    archiveCurrentBatch: () => whenIdle(() => workspace.archiveCurrentBatch()),
    clearHistory: workspace.clearHistory,
    deleteHistoryBatch: workspace.deleteHistoryBatch,
    renameBatch: workspace.renameBatch,
    readBatch: workspace.readBatch,
  };
}
