import { NativeStudioCommandsContext } from '../../hooks/useNativeStudioCommands';
import { hasVideoPromptRecovery, type VideoPromptContext } from '@client/shared/agent/videoPromptOperation';
import { mediaReferenceSlots } from '@client/shared/media/videoReferences';
import { videoInputError, resolveVideoMode, videoDurationOptions, videoModes } from '@shared/domain/media/videoCapabilities';
import { isVideoMediaUrl } from '@client/shared/media/mediaHelper';
import { CanvasDrawingPromptPanel } from './CanvasDrawingPromptPanel';
import { buildCinemaPrompt } from './CanvasCameraAndPrompts';
import AIGeneratingCard from '@client/shared/ui/AIGeneratingCard';
import { drawingGeometry, loadCanvasGenerationModels, persistCanvasMedia } from '../../model/canvasNodeFactory';
import { useContext, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Palette, PlusSquare, Trash2, WandSparkles, Video } from 'lucide-react';
import { useAppStore } from '@client/store';
import { saveCanvasProjects, useCanvasStore } from '../../store/useCanvasStore';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { getVideoModelById, resolveVideoResolution } from '@shared/domain/media/video';
import { upstreamModalityModelId } from '@shared/domain/models/modalityStorage';
import { getGatewayClientBaseUrl } from '@client/shared/api/gatewayClient';
import { buildPromptBarGenerationTasks } from '@client/shared/prompt-bar/promptBarSubmit';
import { calculateImageDimensions } from '@client/shared/prompt-bar/promptBarDisplay';
import { IMAGE_RATIO_ITEMS } from '@client/shared/prompt-bar/promptBarConstants';
import type { CanvasNode } from '../../model/types';
import { appendNodeRun, canReference, DEFAULT_PORTRAIT_TEXTURE, isTextSource, referenceReady, linkedPrompt } from '../../model/canvasGraph';
import { isCanvasGridSkillTitle } from '../stage/CanvasImageToolSubmenus';
import { recoverVideoPromptOptimization, optimizeVideoPrompt, type VideoPromptOptimization } from '@client/shared/agent/videoPromptOptimizer';
import { videoPromptSkill } from '@shared/domain/assistant/skills/videoPromptSkills';
import { VideoPromptReviewDialog, VideoPromptSkillBadge } from '../video/StudioStoryboardDialog';
import { useVideoPromptReview } from '../../hooks/useCanvasSelectionActions';
import { reusableVideoPromptDraft, reviewVideoPrompt, videoPromptBindingMatches, videoPromptReviewKey } from '../../model/studioPromptOperation';

export function CanvasDrawingNode({
  node, projectId, nodes, selected = false, highlighted = false, onPreview,
}: {
  node: CanvasNode; projectId: string; nodes: CanvasNode[];
  selected?: boolean; highlighted?: boolean; onPreview?: (url: string) => void;
}) {
  const editorAnchor = useRef<HTMLDivElement>(null);
  const updateNode = useCanvasStore((s) => s.updateNode);
  const initial = useAppStore.getState();
  const isVideo = node.generationKind === 'video';
  const config = node.drawing || {
    model: isVideo ? initial.quickVideoModel : initial.quickModel,
    quality: isVideo
      ? resolveVideoResolution(initial.quickVideoResolution, getVideoModelById(upstreamModalityModelId('video', initial.quickVideoModel), getGatewayClientBaseUrl(initial.quickVideoModel))?.supportedResolutions)
      : initial.quickQuality || 'medium',
    aspect: isVideo ? '16:9' : initial.quickAspectId || '1:1',
    count: 1, references: [],
  };
  const studioCommands = useContext(NativeStudioCommandsContext);
  const motion = node.studioSubType === 'motion-control';
  const [allModels, setModels] = useState(() => loadCanvasGenerationModels(isVideo));
  const [error, setError] = useState('');
  const [failedImageUrl, setFailedImageUrl] = useState<string>();
  const imageLoadFailed = Boolean(node.imageUrl && failedImageUrl === node.imageUrl);
  const lock = useRef(false);
  const optimizationRequest = useRef<AbortController | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const { requestReview, review } = useVideoPromptReview();
  useEffect(() => () => optimizationRequest.current?.abort(), []);
  const uploadLock = useRef(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const refresh = () => setModels(loadCanvasGenerationModels(isVideo));
    window.addEventListener('models_updated', refresh);
    window.addEventListener('modality_models_updated', refresh);
    return () => { window.removeEventListener('models_updated', refresh); window.removeEventListener('modality_models_updated', refresh); };
  }, [isVideo]);

  const change = (patch: Partial<typeof config>) => {
    const linkedUrls = nodes.filter((item) => node.referenceNodeIds?.includes(item.id)).map((item) => (isVideo ? item.videoUrl || item.imageUrl : item.imageUrl));
    const nextConfig = { ...config, ...patch };
    const nextAspect = nextConfig.aspect || (isVideo ? '16:9' : '1:1');
    const size = drawingGeometry({ ...node, drawing: { ...nextConfig, aspect: nextAspect } });
    updateNode(projectId, node.id, {
      ...(patch.aspect && !node.imageUrl && !node.videoUrl ? { width: Math.round(size.width), height: Math.round(size.height) } : {}),
      drawing: { ...nextConfig, ...(patch.references ? { references: patch.references.filter((url) => !linkedUrls.includes(url)) } : {}) },
      ...(patch.references
        ? {
            referenceNodeIds: (node.referenceNodeIds || []).filter((id) => {
              const target = nodes.find((item) => item.id === id);
              const url = target?.[isVideo && target?.videoUrl ? 'videoUrl' : 'imageUrl'];
              return !url || patch.references!.includes(url);
            }),
          }
        : {}),
    });
  };

  const models = motion ? allModels.filter(({id}) => videoModes(upstreamModalityModelId('video', id), getGatewayClientBaseUrl(id)).some(mode => mode.id === 'motion_control')) : allModels;
  const busy = node.status === 'generating' || optimizing || reviewing;
  const matchedModel = models.find((m) => m.id === config.model || m.modelId === config.model);
  const selectedModel = (motion && !matchedModel ? '' : matchedModel?.id || (!models.length ? config.model : '')) || models[0]?.id || '';
  const videoModel = upstreamModalityModelId('video', selectedModel);
  const videoBaseUrl = getGatewayClientBaseUrl(selectedModel);

  useEffect(() => {
    if (!isVideo || !selectedModel) return;
    const supported = getVideoModelById(videoModel, videoBaseUrl)?.supportedResolutions ?? (models.find((item) => item.id === selectedModel)?.supportedResolutions as string[] | undefined);
    const quality = resolveVideoResolution(config.quality, supported);
    if (quality !== config.quality) change({ quality });
  }, [isVideo, selectedModel, config.quality, models, videoModel, videoBaseUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const linkedNodes = (node.referenceNodeIds || []).map((id) => nodes.find((item) => item.id === id)).filter((item): item is CanvasNode => Boolean(item));
  const linkedTextNodes = linkedNodes.filter(isTextSource);
  const optimizerNodes = linkedNodes.filter((item) => item.studioSubType === 'video-prompt-optimizer');
  const optimizerMediaUrls = optimizerNodes.flatMap((optNode) => {
    const optUpstream = (optNode.referenceNodeIds || [])
      .map((id) => nodes.find((item) => item.id === id))
      .filter((item): item is CanvasNode => Boolean(item));
    return [
      ...(optNode.drawing?.references || []),
      ...optUpstream
        .filter((item) => canReference(item) || (isVideo && item.videoUrl && !item.missingMedia))
        .map((item) => (isVideo ? item.videoUrl || item.imageUrl! : item.imageUrl!)),
    ];
  });
  const refs = [
    ...new Set([
      ...config.references,
      ...linkedNodes.filter((item) => canReference(item) || (isVideo && item.videoUrl && !item.missingMedia)).map((item) => (isVideo ? item.videoUrl || item.imageUrl! : item.imageUrl!)),
      ...optimizerMediaUrls,
    ]),
  ];
  const audioRefs = [...new Set([...linkedNodes, ...optimizerNodes.flatMap(optimizer =>
    (optimizer.referenceNodeIds || []).flatMap(id => nodes.filter(item => item.id === id))
  )].flatMap(item => item.audioUrl && !item.missingMedia ? [item.audioUrl] : []))];
  const referenceNames = mediaReferenceSlots(refs).map((item) => item.name);
  const videoMode = motion ? 'motion_control' : resolveVideoMode(videoModel, config.refMode, refs.filter((url) => !isVideoMediaUrl(url)).length, refs.filter(isVideoMediaUrl).length);
  const preparationSignature = JSON.stringify({ model: selectedModel, videoModel, videoMode, config, prompt: linkedPrompt(node, nodes), refs, audioRefs });
  useEffect(() => { optimizationRequest.current?.abort(); }, [preparationSignature]);

  const durations = videoDurationOptions(videoModel, config.quality, videoMode, videoBaseUrl);
  const requestedDuration = config.duration || 5;
  const duration = durations.includes(requestedDuration)
    ? requestedDuration
    : durations.reduce((best, value) => (Math.abs(value - requestedDuration) < Math.abs(best - requestedDuration) ? value : best), durations[0] || 5);
  const workflowSettings = node.studioRaw?.settings as Record<string, unknown> | undefined;
  const specialExecution = Boolean(workflowSettings && (workflowSettings.beikeOperation || workflowSettings.beikeCompilerSource || workflowSettings.beikeVideoWorkflow));
  const videoValidation = isVideo && !specialExecution
    ? videoInputError({ model: videoModel, baseUrl: videoBaseUrl, refMode: videoMode, images: refs.filter((url) => !isVideoMediaUrl(url)), videos: refs.filter(isVideoMediaUrl), audios: audioRefs, audio: config.audio, duration, resolution: config.quality, aspectRatio: config.aspect })
    : null;

  const uploadReferences = async (files: File[]) => {
    if (uploadLock.current || !files.length) return;
    uploadLock.current = true; setUploading(true); setError('');
    const failures: string[] = [];
    try {
      for (const file of files) {
        try {
          if (!(isVideo && (file.type.startsWith('video/') || isVideoMediaUrl(file.name))) && !file.type.startsWith('image/') && !/\.(png|jpe?g|webp|gif|avif)$/i.test(file.name)) {
            throw new Error('请选择图片文件');
          }
          const media = await persistCanvasMedia(file, 0, 0);
          const mediaUrl = isVideo ? media.videoUrl || media.imageUrl : media.imageUrl;
          if (!mediaUrl) throw new Error('请选择图片或视频文件');
          const current = useCanvasStore.getState().projects.find((project) => project.id === projectId)?.nodes.find((item) => item.id === node.id);
          if (!current) break;
          const drawing = current.drawing || config;
          updateNode(projectId, node.id, { drawing: { ...drawing, references: [...new Set([...drawing.references, mediaUrl])] } });
        } catch (cause) {
          failures.push(`${file.name}：${cause instanceof Error ? cause.message : '上传失败，请重试'}`);
        }
      }
      if (failures.length) setError(failures.join('；'));
    } finally {
      uploadLock.current = false; setUploading(false);
    }
  };

  const handleReorderMediaRef = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= refs.length || toIndex >= refs.length) return;
    const nextRefs = [...refs];
    const [movedUrl] = nextRefs.splice(fromIndex, 1);
    nextRefs.splice(toIndex, 0, movedUrl);
    const mediaNodeIds = (node.referenceNodeIds || []).filter((id) => {
      const n = nodes.find((item) => item.id === id);
      return n && !isTextSource(n);
    });
    const textNodeIds = (node.referenceNodeIds || []).filter((id) => {
      const n = nodes.find((item) => item.id === id);
      return n && isTextSource(n);
    });
    if (mediaNodeIds.length > 1 && fromIndex < mediaNodeIds.length && toIndex < mediaNodeIds.length) {
      const reorderedIds = [...mediaNodeIds];
      const [movedId] = reorderedIds.splice(fromIndex, 1);
      reorderedIds.splice(toIndex, 0, movedId);
      updateNode(projectId, node.id, { referenceNodeIds: [...reorderedIds, ...textNodeIds] });
    } else {
      change({ references: nextRefs });
    }
  };

  const handleMoveMediaRef = (index: number, direction: -1 | 1) => {
    handleReorderMediaRef(index, index + direction);
  };

  const promptContext = (): VideoPromptContext => {
    const current = useCanvasStore.getState().projects.find((p) => p.id === projectId)?.nodes.find((n) => n.id === node.id);
    if (!current) throw new Error('原节点已不存在');
    return {
      projectId, nodeId: node.id, stage: 'video', runId: crypto.randomUUID(),
      previousOperationId: current.promptOperationId, recoveryOnly: current.promptRecoveryRequired,
      onOperation: async (id) => { updateNode(projectId, node.id, { promptOperationId: id, promptRecoveryRequired: true }); await saveCanvasProjects(); },
      onResolved: async () => { updateNode(projectId, node.id, { promptRecoveryRequired: false }); await saveCanvasProjects(); },
    };
  };

  const recovering = isVideo && hasVideoPromptRecovery({ projectId, nodeId: node.id, stage: 'video', recoveryOnly: node.promptRecoveryRequired });

  const generate = async () => {
    if (node.layerLocked || lock.current || busy) return;
    const project = useCanvasStore.getState().projects.find(item => item.id === projectId);
    const studioNode = project?.studioScene?.nodes.find(item => item.id === node.id);
    const workflow = studioNode?.settings as Record<string, unknown> | undefined;
    if (workflow && (workflow.beikeVideoWorkflow || workflow.beikeStoryboardKeyframe || workflow.beikeOmniReferenceImage ||
        workflow.beikeReferencePreparationRole || workflow.beikeCompilerSource || workflow.beikeOperation || workflow.beikeRequiredInputs)) {
      if (!studioCommands) { setError('画布运行器尚未就绪，请重新打开画布'); return; }
      lock.current = true;
      setError('');
      try {
        if (!await studioCommands.run(node.id)) {
          const result = studioCommands.read().nodes.find(item => item.id === node.id);
          if (result?.errorMsg) setError(String(result.errorMsg));
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '生成提交失败');
      } finally { lock.current = false; }
      return;
    }
    if (recovering) {
      if (lock.current || busy) return;
      lock.current = true; setOptimizing(true); setError('');
      const controller = new AbortController();
      optimizationRequest.current = controller;
      try {
        const value = await recoverVideoPromptOptimization(promptContext(), controller.signal);
        if (value) {
          updateNode(projectId, node.id, { promptOptimization: value, promptRecoveryRequired: false });
          try { await saveCanvasProjects(); } catch (err) { updateNode(projectId, node.id, { promptRecoveryRequired: true }); throw err; }
          setError('原优化稿已恢复，请核对后再次生成；输入已修改时会重新优化。');
        }
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '原优化结果待核对');
      } finally {
        lock.current = false; optimizationRequest.current = null; setOptimizing(false);
      }
      return;
    }

    if (linkedNodes.some((item) => !referenceReady(item))) { setError('上游提示词为空或参考图尚未就绪，请补全内容或断开连接。'); return; }
    if (lock.current || busy || useCanvasStore.getState().projects.find((project) => project.id === projectId)?.nodes.find((item) => item.id === node.id)?.status === 'generating') return;
    if (!models.some((model) => model.id === selectedModel)) { setError('请先配置并选择生成模型'); return; }
    if (isVideo && videoValidation) { setError(videoValidation); return; }

    const ratio = IMAGE_RATIO_ITEMS.find((item) => item.id === config.aspect) || IMAGE_RATIO_ITEMS[0];
    const isPortraitTexture = !isVideo && Boolean(config.portraitTexture?.isActive || node.title === '人像质感调节');
    const pt = { ...DEFAULT_PORTRAIT_TEXTURE, ...(config.portraitTexture || {}) };
    const portraitPromptPrefix = isPortraitTexture
      ? `人像质感调节（人景融合：${pt.subject_scene_fusion}，光影融合：${pt.lighting_fusion}，皮肤：${pt.skin_texture}，纹理：${pt.surface_texture}，锐度：${pt.sharpness}）`
      : '';
    const baseLinkedPrompt = linkedPrompt(node, nodes);
    const cinemaSuffix = !isVideo ? buildCinemaPrompt(config.cinemaConfig) : '';
    const rawEffectivePrompt = isPortraitTexture
      ? [portraitPromptPrefix, baseLinkedPrompt].filter(Boolean).join('，')
      : baseLinkedPrompt || (motion ? '将参考视频中的动作迁移到角色图，保持角色外观一致。' : '');
    const effectivePrompt = [rawEffectivePrompt, cinemaSuffix].filter(Boolean).join(', ');
    const result = buildPromptBarGenerationTasks({
      quickGenMode: isVideo ? 'video' : 'image', quickPrompt: effectivePrompt,
      quickRefImages: refs, activeSubjects: [], allSubjects: [],
      quickModel: selectedModel, quickQuality: config.quality, quickCount: config.count,
      sizeStr: calculateImageDimensions({ quickModel: selectedModel, quickAspectId: config.aspect, quickQuality: config.quality, baseRatio: ratio }).sizeStr,
      currentView: 'canvas', hasImageModels: models.some((model) => model.id === selectedModel),
      quickVideoRefMode: videoMode, quickVideoFirstFrame: refs[0] || null, quickVideoLastFrame: refs[1] || null, quickVideoMultiFrames: refs, quickVideoAudioRefs: audioRefs,
      quickVideoCount: config.count, quickVideoModel: selectedModel, quickVideoAspectId: config.aspect, quickVideoResolution: config.quality,
      quickVideoDuration: duration, quickVideoGenerateAudio: config.audio, quickVideoContextIrEnabled: config.contextIrEnabled ?? true,
      quickDepthStyle: 'mocap', quickDepthQuality: 'standard',
    });
    if (!result.ok) { setError(result.error); return; }
    lock.current = true; setError('');
    const addedNodes: string[] = [];
    let previous: CanvasNode | undefined;
    const store = useCanvasStore.getState();
    try {
      let optimization: VideoPromptOptimization | undefined;
      if (isVideo && config.optimizePrompt === true && optimizerNodes.length === 0) {
        const before = useCanvasStore.getState().projects.find((project) => project.id === projectId);
        const originalNode = before?.nodes.find((item) => item.id === node.id);
        const inputSignature = (item: CanvasNode | undefined) => JSON.stringify({ drawing: item?.drawing, content: item?.content, refs: item?.referenceNodeIds });
        const linked = before?.nodes.filter((item) => node.referenceNodeIds?.includes(item.id));
        const controller = new AbortController();
        optimizationRequest.current = controller;
        setOptimizing(true);
        const input = {
          model: videoModel, prompt: result.tasks[0].prompt, mode: videoMode, duration,
          aspect: config.aspect, resolution: config.quality, audio: result.tasks[0].generateAudio,
          images: refs.filter((url) => !isVideoMediaUrl(url)).length, videos: refs.filter(isVideoMediaUrl).length, audios: audioRefs.length,
        };
        const inputKey = videoPromptReviewKey(input, [...refs, ...audioRefs], selectedModel);
        const cached = originalNode?.promptOptimization;
        optimization = reusableVideoPromptDraft(cached, input, [...refs, ...audioRefs], selectedModel) ?? (await optimizeVideoPrompt(input, controller.signal, { ...promptContext(), inputKey }));
        if (optimization?.operationId && optimization.inputKey !== inputKey) {
          await promptContext().onResolved?.();
          throw new Error('原优化已完成，但输入已修改；原稿已保留，请核对后按当前输入重新优化');
        }
        if (optimization) optimization = { ...optimization, inputKey };
        controller.signal.throwIfAborted();
        const after = useCanvasStore.getState().projects.find((project) => project.id === projectId);
        if (inputSignature(after?.nodes.find((item) => item.id === node.id)) !== inputSignature(originalNode) || linked?.some((item) => after?.nodes.find((next) => next.id === item.id) !== item)) {
          throw new Error('节点或上游内容已修改，视频尚未提交，请重新生成');
        }
        if (optimization) {
          const expected = inputSignature(originalNode);
          setOptimizing(false); setReviewing(true);
          updateNode(projectId, node.id, { promptOptimization: optimization, promptRecoveryRequired: false });
          try { await saveCanvasProjects(); } catch (err) { updateNode(projectId, node.id, { promptRecoveryRequired: true }); throw err; }
          const approved = await reviewVideoPrompt(optimization, controller.signal, requestReview, (draft) => {
            if (controller.signal.aborted) return;
            optimization = { ...optimization!, draft };
            updateNode(projectId, node.id, { promptOptimization: optimization });
          });
          controller.signal.throwIfAborted();
          if (!approved) return;
          const latest = useCanvasStore.getState().projects.find((project) => project.id === projectId);
          const current = latest?.nodes.find((item) => item.id === node.id);
          if (upstreamModalityModelId('video', selectedModel) !== videoModel || !current || current.status === 'generating' || inputSignature(current) !== expected || linked?.some((item) => latest?.nodes.find((next) => next.id === item.id) !== item)) {
            throw new Error('节点或上游内容已修改，请重新检查提示词后生成');
          }
          optimization = approved;
          result.tasks.forEach((task) => { task.prompt = approved.submitted!; });
        }
      }
      previous = useCanvasStore.getState().projects.find(project => project.id === projectId)?.nodes.find(item => item.id === node.id);
      if (!previous || previous.layerLocked || previous.status === 'generating') return;
      let priorRunPatch: Partial<CanvasNode> = {};
      if (node.imageUrl || node.videoUrl) {
        const currentMediaUrl = isVideo ? node.videoUrl : node.imageUrl;
        const alreadyInRuns = (node.runs || []).some(
          (r) => (isVideo ? r.videoUrl : r.imageUrl) === currentMediaUrl,
        );
        if (!alreadyInRuns && currentMediaUrl) {
          priorRunPatch = appendNodeRun(node, {
            taskId: node.taskId,
            imageUrl: isVideo ? undefined : node.imageUrl,
            videoUrl: isVideo ? node.videoUrl : undefined,
            prompt: node.content,
            model: selectedModel,
            status: 'success',
          });
        }
        const priorId = crypto.randomUUID();
        addedNodes.push(priorId);
        store.addNode(projectId, {
          id: priorId, type: isVideo ? 'video' : 'image', title: `${node.title || (isVideo ? '视频' : '图片')} · 上一版`,
          imageUrl: node.imageUrl, videoUrl: node.videoUrl, content: node.content, referenceNodeIds: node.referenceNodeIds,
          x: node.x - 360, y: node.y, width: 280, height: drawingGeometry(node).height, status: 'success',
        });
      }
      updateNode(projectId, node.id, {
        ...priorRunPatch,
        promptOptimization: optimization, taskId: result.tasks[0].id, generationIntent: result.tasks[0], status: 'generating',
        imageUrl: undefined, videoUrl: undefined, resultWidth: undefined, resultHeight: undefined,
        generationSize: isVideo ? config.aspect : calculateImageDimensions({ quickModel: selectedModel, quickAspectId: config.aspect, quickQuality: config.quality, baseRatio: ratio }).sizeStr,
        progress: 0, drawing: { ...config, model: selectedModel },
      });
      result.tasks.slice(1).forEach((task, index) => {
        const id = crypto.randomUUID();
        addedNodes.push(id);
        store.addNode(projectId, {
          id, type: 'drawing', promptOptimization: optimization, generationKind: node.generationKind,
          drawing: { ...config, model: selectedModel }, taskId: task.id, generationIntent: task, title: `${isVideo ? '视频' : '绘图'} ${index + 2}`,
          content: node.content, referenceNodeIds: node.referenceNodeIds, status: 'generating',
          x: node.x + (index + 1) * (node.width + 32), y: node.y, width: node.width, height: node.height,
        });
      });
      await saveCanvasProjects();
      const current = useCanvasStore.getState().projects.find(project => project.id === projectId)?.nodes.find(item => item.id === node.id);
      if (current?.taskId !== result.tasks[0].id || current.status !== 'generating') {
        addedNodes.forEach(id => store.deleteNode(projectId, id));
        return;
      }
      useAppStore.getState().addBatchGenerationTasks(
        result.tasks.map((task) => ({ ...task, canvasProjectId: projectId })),
        result.sessionTitle, result.shouldCreateNewSession,
      );
    } catch (cause) {
      if (previous) {
        const current = useCanvasStore.getState().projects.find(project => project.id === projectId)?.nodes.find(item => item.id === node.id);
        if (current?.taskId === result.tasks[0].id) updateNode(projectId, node.id, previous);
        addedNodes.forEach(id => store.deleteNode(projectId, id));
      }
      if (optimizationRequest.current?.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : '提交失败');
    } finally {
      lock.current = false; optimizationRequest.current = null; setOptimizing(false); setReviewing(false);
    }
  };

  const generateRef = useRef(generate);
  generateRef.current = generate;
  useEffect(() => {
    const onTriggerGenerate = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeId?: string }>).detail;
      if (detail?.nodeId === node.id) {
        void generateRef.current();
      }
    };
    window.addEventListener('canvas:trigger-node-generate', onTriggerGenerate);
    return () => window.removeEventListener('canvas:trigger-node-generate', onTriggerGenerate);
  }, [node.id]);

  const [resultsExpanded, setResultsExpanded] = useState(false);
  const switchNodeRun = useCanvasStore((s) => s.switchNodeRun);
  const addNode = useCanvasStore((s) => s.addNode);

  const geometry = drawingGeometry(node);
  const promptSkill = !motion && config.optimizePrompt !== false ? videoPromptSkill(videoModel, videoMode) : undefined;
  const matchingOptimization = promptSkill && videoPromptBindingMatches(node.promptOptimization, { model: videoModel, mode: videoMode }, selectedModel) ? node.promptOptimization : undefined;
  const promptSkillName = promptSkill?.displayName || promptSkill?.name || '视频提示词技能';
  const promptSkillLabel = !promptSkill
    ? config.optimizePrompt === false ? '提示词技能：未启用' : '提示词技能：暂无匹配'
    : reviewing && matchingOptimization ? `待确认 · ${promptSkillName}`
    : optimizing ? `优化中 · ${promptSkillName}`
    : matchingOptimization ? `${matchingOptimization.submitted ? '已用' : '已优化'} · ${promptSkillName}` : `待用 · ${promptSkillName}`;
  const hasMedia = Boolean(node.imageUrl || node.videoUrl);
  const isPortraitTextureNode =
    !isVideo &&
    Boolean(
      config.portraitTexture?.isActive ||
        node.title === '人像质感调节' ||
        isCanvasGridSkillTitle(node.title) ||
        node.specialized?.operation?.startsWith('skill:'),
    );
  const validRuns = (node.runs || []).filter((item) => Boolean(isVideo ? item.videoUrl : item.imageUrl));
  const hasMultipleRuns = validRuns.length > 1;
  const activeRunIdx = node.activeRunIndex ?? 0;

  return (
    <div ref={editorAnchor} className="pointer-events-none relative text-slate-600 dark:text-slate-300" aria-label={motion ? '动作迁移节点' : isVideo ? '视频生成节点' : '绘图节点'}>
      {review && <VideoPromptReviewDialog key={review.id} review={review} />}
      {isVideo && !motion && review && (
        <div className="pointer-events-auto mb-1.5 flex items-center justify-between gap-1.5">
          <VideoPromptSkillBadge skillId={promptSkill?.id} model={videoModel} label={promptSkillLabel} />
        </div>
      )}

      <div className="relative mx-auto" style={{ width: geometry.width, height: geometry.height }}>
        {/* Multi-result stacked back cards (reference x3s / O7n) */}
        {hasMedia && hasMultipleRuns && !resultsExpanded && (
          <div data-compact-stack-backs="true" className="pointer-events-none absolute inset-0 z-0 overflow-visible">
            {validRuns.slice(1, 4).map((run, idx) => {
              const offset = idx + 1;
              const mediaUrl = isVideo ? run.videoUrl : run.imageUrl;
              return (
                <div
                  key={run.id}
                  style={{
                    transform: `translate3d(${offset * 10}px, 0px, 0px) rotate(${offset * 5}deg)`,
                    opacity: Math.max(0.25, 1 - offset * 0.22),
                    zIndex: 10 - offset,
                  }}
                  className="absolute inset-0 overflow-hidden rounded-2xl border border-slate-300/80 dark:border-white/15 bg-slate-900 shadow-lg transition-transform duration-200"
                >
                  {mediaUrl && !isVideo && (
                    <img
                      src={proxyMediaUrl(mediaUrl, { thumb: true, width: 320 })}
                      alt=""
                      className="h-full w-full object-cover opacity-80"
                      draggable={false}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Top-right multi-result fan expand/collapse button (reference Clo) */}
        {hasMedia && hasMultipleRuns && (
          <button
            type="button"
            data-compact-fan-toggle="true"
            title={resultsExpanded ? '收起全部结果' : `展开全部 ${validRuns.length} 张结果`}
            aria-label={resultsExpanded ? '收起全部结果' : `展开全部 ${validRuns.length} 张结果`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setResultsExpanded((v) => !v);
            }}
            className="pointer-events-auto absolute right-2 top-2 z-[55] flex h-7 items-center gap-0.5 rounded-full border border-white/15 bg-black/60 px-2.5 text-[11px] font-semibold text-white shadow-lg backdrop-blur-md transition hover:bg-black/80 cursor-pointer"
          >
            <span>{validRuns.length}</span>
            {resultsExpanded ? <ChevronUp className="h-3.5 w-3.5 opacity-90" /> : <ChevronDown className="h-3.5 w-3.5 opacity-90" />}
          </button>
        )}

        <div
          data-testid="drawing-preview"
          data-compact-gen-preview="true"
          data-drawing-image-unavailable={imageLoadFailed || undefined}
          style={{ width: geometry.width, height: geometry.height }}
          className={`pointer-events-auto relative z-10 mx-auto flex items-center justify-center overflow-hidden rounded-[18px] transition-[border-color,box-shadow] ${
            hasMedia
              ? highlighted ? 'ring-1 ring-[var(--canvas-node-selection)]' : 'ring-1 ring-slate-200/80 dark:ring-white/10'
              : isPortraitTextureNode
                ? selected || highlighted
                  ? 'border border-slate-400 dark:border-white/45 bg-slate-100 dark:bg-[#1f1f1f]'
                  : 'border border-slate-200/90 dark:border-white/[0.08] bg-slate-100 dark:bg-[#1f1f1f]'
                : selected || highlighted
                  ? 'border border-slate-400 dark:border-white/45 bg-white dark:bg-[#1f1f1f]'
                  : 'border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-[#1f1f1f]'
          }`}
        >
          {isVideo && node.videoUrl ? (
            <video
              src={proxyMediaUrl(node.videoUrl)} controls playsInline preload="metadata"
              draggable={false} onDoubleClick={() => onPreview?.(node.videoUrl!)}
              onLoadedMetadata={(event) => {
                const v = event.currentTarget;
                if (v.videoWidth && v.videoHeight && (node.resultWidth !== v.videoWidth || node.resultHeight !== v.videoHeight)) updateNode(projectId, node.id, { resultWidth: v.videoWidth, resultHeight: v.videoHeight });
              }}
              className="h-full w-full object-contain cursor-grab active:cursor-grabbing"
            />
          ) : imageLoadFailed ? (
            <div className="flex flex-col items-center gap-2 px-3 text-center text-xs text-zinc-600 dark:text-zinc-300">
              <p role="status">{busy ? '正在生成新图片…' : '结果图片无法加载'}</p>
              {!busy && (
                <button
                  type="button"
                  className="rounded-md border border-current px-2 py-1 hover:opacity-75"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    setFailedImageUrl(undefined);
                  }}
                >
                  重试加载图片
                </button>
              )}
            </div>
          ) : node.imageUrl ? (
            <button type="button" aria-label="预览绘图结果" onMouseDown={(e) => e.stopPropagation()} onClick={() => onPreview?.(node.imageUrl!)} className="h-full w-full cursor-pointer">
              <img
                key={node.imageUrl}
                src={proxyMediaUrl(node.imageUrl)} alt="绘图结果"
                onError={() => setFailedImageUrl(node.imageUrl)}
                onLoad={(event) => {
                  const img = event.currentTarget;
                  if (img.naturalWidth && img.naturalHeight && (node.resultWidth !== img.naturalWidth || node.resultHeight !== img.naturalHeight)) updateNode(projectId, node.id, { resultWidth: img.naturalWidth, resultHeight: img.naturalHeight });
                }}
                className="h-full w-full object-contain" draggable={false}
              />
            </button>
          ) : busy ? (
            <AIGeneratingCard embedded task={{ id: node.taskId, model: selectedModel, mediaType: isVideo ? 'video' : 'image', prompt: node.content }} progressNumber={node.progress} className="h-full w-full" />
          ) : isPortraitTextureNode ? (
            <div className="pointer-events-none flex flex-col items-center justify-center gap-2 text-center">
              <svg width="56" height="56" viewBox="0 0 64 64" fill="none" aria-hidden="true" className="text-slate-400/50 dark:text-white/22">
                <circle cx="42" cy="20" r="5" fill="currentColor" />
                <path
                  d="M10 46L25.5 25.5C26.7 23.9 29.1 23.9 30.3 25.5L41 39.5L46.2 33C47.4 31.5 49.7 31.5 50.9 33L56 46H10Z"
                  fill="currentColor"
                />
              </svg>
              {node.status === 'error' && <span className="text-xs text-rose-500 dark:text-rose-400">生成失败，请检查设置后重试</span>}
            </div>
          ) : !motion ? (
            <div className="pointer-events-none flex flex-col items-center justify-center gap-2.5 px-4 text-center">
              {isVideo ? (
                <Video aria-hidden="true" className="h-9 w-9 text-slate-400 dark:text-white/28 stroke-[1.7]" />
              ) : (
                <Palette aria-hidden="true" className="h-9 w-9 text-slate-400 dark:text-white/28 stroke-[1.7]" />
              )}
              <span className="sr-only">{isVideo ? '视频生成' : '图片生成'}</span>
              {node.status === 'error' && <span className="text-xs text-rose-500 dark:text-rose-400">生成失败，请检查设置后重试</span>}
            </div>
          ) : (
            <div className="pointer-events-none absolute inset-3 flex flex-col items-center justify-center gap-2.5 rounded-[10px] border border-dashed border-slate-300/80 dark:border-white/[0.12] bg-[#f5f5f7] dark:bg-[#202022] px-4 text-center">
              <WandSparkles aria-hidden="true" className="h-8 w-8 text-slate-400 dark:text-[#b6b6bf]/70 stroke-[1.5]" />
              <span className="text-lg font-medium tracking-wider text-[#686872] dark:text-[#b6b6bf]">动作迁移</span>
              <span className="text-xs opacity-70">连接角色图和动作参考视频</span>
              {node.status === 'error' && <span className="text-xs text-rose-500 dark:text-rose-400">生成失败，请检查设置后重试</span>}
            </div>
          )}
        </div>

        {/* Expanded multi-result fan cards (reference Elo / compact-result-fan-card) */}
        {hasMedia && hasMultipleRuns && resultsExpanded && (
          <div
            data-compact-fan-expanded="true"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="pointer-events-auto absolute left-full top-0 z-50 ml-4 flex items-start gap-3 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/95 dark:bg-[#1c1c20]/95 p-3 shadow-2xl backdrop-blur-xl"
          >
            {validRuns.map((run, idx) => {
              const mediaUrl = isVideo ? run.videoUrl : run.imageUrl;
              if (!mediaUrl) return null;
              const isMain = idx === activeRunIdx || mediaUrl === (isVideo ? node.videoUrl : node.imageUrl);
              return (
                <div
                  key={run.id}
                  style={{ '--fan-stagger': `${idx * 45}ms` } as React.CSSProperties}
                  className={`compact-result-fan-card group/fan relative h-36 w-36 shrink-0 overflow-hidden rounded-xl border bg-slate-900 shadow-md transition-all ${
                    isMain ? 'border-indigo-500 ring-2 ring-indigo-500/30' : 'border-slate-200/80 dark:border-white/10'
                  }`}
                >
                  {isVideo ? (
                    <video src={proxyMediaUrl(mediaUrl)} className="h-full w-full object-cover" muted playsInline />
                  ) : (
                    <img
                      src={proxyMediaUrl(mediaUrl, { thumb: true, width: 280 })}
                      alt={`版本 ${validRuns.length - idx}`}
                      className="h-full w-full object-cover"
                      draggable={false}
                    />
                  )}
                  <span className="absolute left-1.5 top-1.5 rounded-md bg-black/65 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white backdrop-blur-xs">
                    {isMain ? '当前主图' : `v${validRuns.length - idx}`}
                  </span>
                  <div className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-between gap-1 rounded-lg bg-black/75 p-1 opacity-0 transition-opacity group-hover/fan:opacity-100 backdrop-blur-xs">
                    <button
                      type="button"
                      title="设为主图"
                      aria-label="设为主图"
                      onClick={() => switchNodeRun(projectId, node.id, idx)}
                      className="flex flex-1 items-center justify-center gap-0.5 rounded px-1.5 py-1 text-[10px] font-medium text-white hover:bg-white/20 cursor-pointer"
                    >
                      <Check size={11} />
                      <span>主图</span>
                    </button>
                    <button
                      type="button"
                      title="另存为画布节点"
                      aria-label="另存为画布节点"
                      onClick={() => {
                        addNode(projectId, {
                          type: isVideo ? 'video' : 'image',
                          title: `${node.title || (isVideo ? '视频' : '图片')} · v${validRuns.length - idx}`,
                          imageUrl: isVideo ? undefined : mediaUrl,
                          videoUrl: isVideo ? mediaUrl : undefined,
                          content: run.prompt || node.content,
                          referenceNodeIds: node.referenceNodeIds,
                          x: node.x + geometry.width + 48,
                          y: node.y + idx * 40,
                          width: 280,
                          height: geometry.height,
                          status: 'success',
                        });
                      }}
                      className="flex items-center justify-center rounded p-1 text-white hover:bg-white/20 cursor-pointer"
                    >
                      <PlusSquare size={12} />
                    </button>
                    {!isMain && (
                      <button
                        type="button"
                        title="从节点移除显示"
                        aria-label="从节点移除显示"
                        onClick={() => {
                          const nextRuns = (node.runs || []).filter((item) => item.id !== run.id);
                          updateNode(projectId, node.id, { runs: nextRuns, activeRunIndex: 0 });
                        }}
                        className="flex items-center justify-center rounded p-1 text-rose-300 hover:bg-rose-500/30 cursor-pointer"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <CanvasDrawingPromptPanel
          editorAnchor={editorAnchor} node={node} projectId={projectId} nodes={nodes} isVideo={isVideo} config={config}
          models={models} selectedModel={selectedModel} videoModel={videoModel} videoMode={videoMode} duration={duration}
          busy={busy} uploading={uploading} recovering={recovering} reviewing={reviewing} optimizing={optimizing}
          error={error} videoValidation={videoValidation} refs={refs} referenceNames={referenceNames}
          linkedNodes={linkedNodes} linkedTextNodes={linkedTextNodes} matchingOptimization={matchingOptimization}
          onChangeConfig={change} onUploadFiles={(files) => void uploadReferences(files)}
          onMoveMediaRef={handleMoveMediaRef} onReorderMediaRef={handleReorderMediaRef}
          onCancelOptimize={() => optimizationRequest.current?.abort()}
          onGenerate={() => void generate()}
        />
      )}
    </div>
  );
}
