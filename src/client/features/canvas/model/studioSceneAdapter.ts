import { CANVAS_LOCAL_TOOLS, CANVAS_PRIORITY_TOOLS, isCanvasLocalTool, isCanvasPriorityTool } from './canvasNodeFactory';
import { studioEdgeSources, studioNodeKind, studioNodeMedia } from './studioConnections';
import { syncEdgesWithNodeReferences } from './canvasGraph';
import type { CanvasEdge, CanvasNode, CanvasProject, CanvasStudioGroup, NodeRunHistory, StudioScene } from './types';

type StudioNode = StudioScene['nodes'][number];

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const asText = (value: unknown): string => (typeof value === 'string' ? value : '');

const asNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const stripStudioPrefix = (model: string): string =>
  model.replace(/^beike:(?:image|video|chat|voice):/, '');

function mapStudioVersionsToRuns(settings: Record<string, unknown>): {
  runs?: NodeRunHistory[];
  activeRunIndex?: number;
} {
  const rawVersions = settings.generationVersions;
  if (!Array.isArray(rawVersions) || !rawVersions.length) return {};
  const runs: NodeRunHistory[] = rawVersions.map((item, idx) => {
    const ver = asRecord(item);
    const recipe = asRecord(ver.recipe);
    const recipeSettings = asRecord(recipe.settings);
    const mediaType = asText(ver.mediaType);
    const url = asText(ver.originalUrl) || asText(ver.content);
    return {
      id: asText(ver.id) || `run-${idx}`,
      taskId: asText(ver.id) || undefined,
      imageUrl: mediaType === 'video' ? undefined : url || undefined,
      videoUrl: mediaType === 'video' ? url || undefined : undefined,
      prompt: asText(recipe.prompt) || undefined,
      model: stripStudioPrefix(asText(recipeSettings.model)) || undefined,
      status: 'success',
      createdAt: asNumber(ver.createdAt, Date.now()),
    };
  });
  const activeIdx = asNumber(settings.activeGenerationVersionIndex, runs.length - 1);
  return { runs, activeRunIndex: Math.max(0, Math.min(runs.length - 1, activeIdx)) };
}

// Retired tools are loaded as ordinary nodes without discarding their saved output.
export function normalizeRetiredImageTool(node: StudioNode): StudioNode {
  if (node.type !== 'inpaint-crop' && node.type !== 'inpaint-stitch') return node;
  const imageUrl = asText(node.imageUrl) || studioNodeMedia(node).url;
  const settings = { ...asRecord(node.settings) };
  const content = asText(node.prompt) || asText(settings.text) || asText(settings.beikeToolContent);
  delete settings.beikeNativeTool;
  delete settings.beikeToolContent;
  if (imageUrl) return { ...node, type: 'input-image', content: imageUrl, imageUrl, prompt: content, settings };
  return { ...node, type: 'text-node', content, settings: { ...settings, text: content } };
}

export function studioNodeToCanvasNode(saved: StudioNode, scene: StudioScene, now = Date.now()): CanvasNode {
  const node = normalizeRetiredImageTool(saved);
  const settings = asRecord(node.settings);
  const media = studioNodeMedia(node);
  const mediaKind = studioNodeKind(node);
  const isGenerating = Boolean(node.isGenerating || settings.isGenerating || settings.textNodeIsAnalyzing);
  const errorText = asText(node.errorMsg) || asText(settings.error) || asText(settings.beikeTextRunError);
  const status: CanvasNode['status'] = isGenerating
    ? 'generating'
    : errorText
      ? 'error'
      : media.url || asText(settings.text) || asText(node.content)
        ? 'success'
        : 'idle';

  const referenceNodeIds = [
    ...new Set(scene.connections.filter((edge) => edge.to === node.id).flatMap((edge) => studioEdgeSources(edge, scene))),
  ];
  const groupEntry = scene.groups.find(
    (g) => g && typeof g === 'object' && Array.isArray((g as { nodeIds?: unknown[] }).nodeIds) && (g as { nodeIds: unknown[] }).nodeIds.includes(node.id),
  ) as { id?: string } | undefined;

  const base: CanvasNode = {
    id: node.id,
    studioRaw: structuredClone(node),
    type: 'note',
    title: asText(node.nodeName) || asText(node.title) || undefined,
    x: asNumber(node.x, 80),
    y: asNumber(node.y, 100),
    width: asNumber(node.width, 340),
    height: asNumber(node.height, 300),
    status,
    progress: asNumber(settings.progress, 0) || undefined,
    taskId: asText(node.beikeCanvasTaskId) || asText(node.beikeTaskId) || asText(node.beikeLastTaskId) || undefined,
    generationIntent: node.beikeCanvasTaskRecord as CanvasNode['generationIntent'],
    layerLocked: settings.beikeLayerLocked === true || undefined,
    layerHidden: settings.beikeLayerHidden === true || undefined,
    isFoldLeader: settings.beikeFoldLeader === true || undefined,
    foldedInGroupId: asText(settings.beikeFoldedInGroupId) || undefined,
    foldedCount: asNumber(settings.beikeFoldedCount, 0) || undefined,
    promptOperationId: asText(node.beikePromptOperationId) || undefined,
    promptRecoveryRequired: Boolean(node.beikePromptRecoveryRequired) || undefined,
    textOperationId: asText(node.beikeTextOperationId) || undefined,
    textRecoveryRequired: Boolean(node.beikeTextRecoveryRequired) || undefined,
    speechOperationId: asText(node.beikeSpeechOperationId) || undefined,
    speechRecoveryRequired: Boolean(node.beikeSpeechRecoveryRequired) || undefined,
    missingMedia: Boolean(node.missingMedia) || undefined,
    groupId: groupEntry?.id,
    referenceNodeIds: referenceNodeIds.length ? referenceNodeIds : undefined,
    createdAt: asNumber(node.createdAt, now),
    ...mapStudioVersionsToRuns(settings),
    ...(Array.isArray(settings.beikeCanvasRuns) ? {
      runs: settings.beikeCanvasRuns as NodeRunHistory[],
      activeRunIndex: typeof settings.beikeCanvasRunIndex === 'number' ? settings.beikeCanvasRunIndex : undefined,
    } : {}),
  };

  if (isCanvasPriorityTool(node.type)) {
    const tool = CANVAS_PRIORITY_TOOLS[node.type];
    return {
      ...base,
      type: node.type === 'video-analyze' || node.type === 'script-parse' ? 'prompt' : node.type === 'motion-control' ? 'drawing' : 'note',
      ...(node.type === 'motion-control' ? {generationKind:'video' as const, drawing:{ model:stripStudioPrefix(asText(settings.model)), quality:asText(settings.resolution) || '720P', aspect:'1:1', count:1, references:Array.isArray(settings.beikeMotionReferences) ? settings.beikeMotionReferences.filter((value): value is string => typeof value === 'string') : [], refMode:'motion_control' as const, audio:settings.beikeVideoAudio !== false, optimizePrompt:false }} : {}),
      title: base.title || tool.title,
      width: asNumber(node.width, tool.width),
      height: asNumber(node.height, tool.height),
      studioSubType: node.type,
      specialized: {
        ...asRecord(settings.beikeSpecialized),
        ...(settings.smartBuild === true ? {smartBuild: true} : {}),
      },
      content: asText(settings.text) || (node.type === 'motion-control' ? asText(node.prompt) : node.type === 'video-analyze' || node.type === 'script-parse' ? asText(node.content) : undefined),
      textPrompt: asText(node.prompt) || undefined,
      textModel: stripStudioPrefix(asText(settings.textNodeChatModel)) || undefined,
      modelUrl: asText(settings.beikeModelUrl) || undefined,
      imageUrl: asText(node.imageUrl) || undefined,
      videoUrl: asText(node.videoUrl) || undefined,
      audioUrl: asText(settings.audioUrl) || undefined,
    };
  }

  if (isCanvasLocalTool(node.type)) {
    const tool = CANVAS_LOCAL_TOOLS[node.type];
    return {
      ...base,
      title: base.title || tool.title,
      width: asNumber(node.width, tool.width),
      height: asNumber(node.height, tool.height),
      studioSubType: node.type,
      content: asText(settings.beikeToolContent) || undefined,
      imageUrl: asText(node.imageUrl) || undefined,
      videoUrl: node.type === 'video-input' ? asText(node.videoUrl) || (!settings.beikeNativeTool ? media.url : '') || undefined : undefined,
    };
  }

  if (node.type === 'text-node' || node.type === 'custom-agent') {
    const bodyText = asText(settings.textNodeDisplayText) || asText(settings.text) || asText(node.content);
    const subType = node.type === 'text-node' && settings.beikePromptCompiler ? 'video-prompt-optimizer' : undefined;
    const draft = asText(settings.textNodeDraftPrompt);
    const instruction = asText(node.prompt);
    const separateDraft = subType === 'video-prompt-optimizer' && settings.beikeScriptOnly === true;
    const promptInstruction = separateDraft ? (draft === instruction ? '' : draft) : draft || instruction;
    return {
      ...base,
      type: settings.beikeCanvasType === 'note' || settings.beikeCanvasType === 'frame' || settings.beikeCanvasType === 'group'
        ? settings.beikeCanvasType : 'prompt',
      studioSubType: subType,
      content: errorText && status === 'error' ? errorText : bodyText,
      textPrompt: promptInstruction || undefined,
      textModel: stripStudioPrefix(asText(settings.textNodeChatModel) || asText(settings.model)) || undefined,
      textHtml: asText(settings.beikeTextHtml) || undefined,
      textBackground: asText(settings.textNodeBackgroundColor) || undefined,
      textAutoHeight: settings.textNodeAutoHeight === true,
      textWebSearch: settings.textNodeWebSearchEnabled === true,
      textBase64Image: settings.textNodeForceBase64Image === true,
      textApiFormat: ['openai-compatible', 'gemini-official'].includes(asText(settings.textNodeGeminiApiFormat))
        ? settings.textNodeGeminiApiFormat as CanvasNode['textApiFormat'] : undefined,
      textTier: ['Pro', 'Flash'].includes(asText(settings.textNodeGeminiTier))
        ? settings.textNodeGeminiTier as CanvasNode['textTier'] : undefined,
      textReasoningEffort: ['auto','low','medium','high','xhigh','max'].includes(asText(settings.textNodeReasoningEffort))
        ? settings.textNodeReasoningEffort as CanvasNode['textReasoningEffort'] : undefined,
      ...(subType === 'video-prompt-optimizer' && settings.beikeCompilerDrawing && typeof settings.beikeCompilerDrawing === 'object'
        ? { drawing: settings.beikeCompilerDrawing as CanvasNode['drawing'] }
        : {}),
      ...(node.beikePromptOptimization && typeof node.beikePromptOptimization === 'object'
        ? { promptOptimization: node.beikePromptOptimization as CanvasNode['promptOptimization'] }
        : {}),
    };
  }

  if (node.type === 'storyboard-node' || node.type === 'storyboard-chart-node' || node.type === 'video-timeline' || node.type === 'doodle-canvas') {
    return {
      ...base,
      type: node.type === 'storyboard-node' || node.type === 'storyboard-chart-node' ? 'prompt' : 'drawing',
      studioSubType: node.type,
      generationKind: node.type === 'video-timeline' ? 'video' : 'image',
      content: asText(node.prompt) || asText(settings.text),
      imageUrl: mediaKind !== 'video' ? media.url || undefined : undefined,
      videoUrl: mediaKind === 'video' ? media.url || undefined : undefined,
      timelineSnap: typeof settings.timelineSnap === 'boolean' ? settings.timelineSnap : undefined,
      timelineClips: Array.isArray(settings.timelineClips) ? (settings.timelineClips as CanvasNode['timelineClips']) : node.type === 'video-timeline' ? legacyTimelineClips(settings) : undefined,
      doodleStrokes: Array.isArray(settings.doodleStrokes) ? (settings.doodleStrokes as CanvasNode['doodleStrokes']) : undefined,
      storyboardChart: node.type === 'storyboard-chart-node' ? {
        columns: Math.max(2, Math.min(5, Math.round(Number(settings.beikeChartColumns) || 3))),
        rowHeight: Math.max(72, Math.min(160, Math.round(Number(settings.beikeChartRowHeight) || 96))),
      } : undefined,
      storyboardShots: Array.isArray(settings.storyboardShots) ? (settings.storyboardShots as CanvasNode['storyboardShots']) : undefined,
    };
  }

  if (node.type === 'gen-image' || node.type === 'gen-video') {
    const isVideo = node.type === 'gen-video';
    const parsedDuration = parseInt(asText(settings.duration) || '5s', 10);
    const duration = Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : 5;
    const rawModel = stripStudioPrefix(asText(settings.model));
    const quality = isVideo ? asText(settings.resolution) || '768P' : asText(settings.gptImageQuality) || 'medium';
    const aspect = asText(settings.ratio) || (isVideo ? '16:9' : '1:1');
    return {
      ...base,
      type: 'drawing',
      generationKind: isVideo ? 'video' : 'image',
      content: status === 'error' && errorText ? errorText : asText(node.prompt),
      model: rawModel || undefined,
      aspectRatio: aspect,
      imageUrl: !isVideo ? media.url || undefined : undefined,
      videoUrl: isVideo ? media.url || undefined : undefined,
      drawing: {
        model: rawModel,
        quality,
        aspect,
        count: asNumber(settings.batchCount, 1),
        ...asRecord(settings.beikeDrawingExtras),
        references: Array.isArray(settings.beikeDrawingReferences) ? settings.beikeDrawingReferences : [],
        duration: isVideo ? duration : undefined,
        refMode: isVideo ? asText(settings.beikeVideoMode) || undefined : undefined,
        optimizePrompt: settings.beikeOptimizePrompt !== false,
        audio: typeof settings.beikeVideoAudio === 'boolean' ? settings.beikeVideoAudio : undefined,
      },
    };
  }

  if (node.type === 'gen-speech' || node.type === 'gen-music') {
    return {
      ...base,
      type: 'audio',
      content: asText(node.prompt) || asText(settings.text),
      audioUrl: media.url || undefined,
      specialized: asRecord(settings.beikeSpecialized),
      model: stripStudioPrefix(asText(settings.model)) || undefined,
    };
  }

  if (node.type === 'input-image' || node.type === 'video-input') {
    if (!media.url) return { ...base, type: 'file' };
    const mediaUpload = (node.type === 'input-image' || settings.beikeMediaUpload === true) || undefined;
    if (mediaKind === 'video' || node.type === 'video-input') return { ...base, type: 'video', videoUrl: media.url, mediaUpload };
    if (mediaKind === 'audio') return { ...base, type: 'audio', audioUrl: media.url, mediaUpload };
    return { ...base, type: 'image', imageUrl: media.url, mediaUpload };
  }

  if (node.type === 'preview') {
    const isVideo = node.previewType === 'video' || mediaKind === 'video';
    return {
      ...base,
      type: 'preview',
      imageUrl: !isVideo ? media.url || undefined : undefined,
      videoUrl: isVideo ? media.url || undefined : undefined,
    };
  }

  if (node.type === 'local-save' || node.type === 'save') return { ...base, type: 'save' };

  if (node.type === 'image-compare') {
    return {
      ...base,
      type: 'compare',
      compareBeforeUrl: asText(settings.beforeUrl) || undefined,
      compareAfterUrl: asText(settings.afterUrl) || undefined,
    };
  }

  return {
    ...base,
    type: media.url ? (mediaKind === 'video' ? 'video' : 'image') : 'note',
    content: asText(node.prompt) || asText(settings.text) || asText(node.type),
    imageUrl: mediaKind !== 'video' ? media.url || undefined : undefined,
    videoUrl: mediaKind === 'video' ? media.url || undefined : undefined,
  };
}

export function canvasNodeToStudioNode(node: CanvasNode, previous?: StudioNode): StudioNode {
  const raw: StudioNode = previous
    ? structuredClone(normalizeRetiredImageTool(previous))
    : node.studioRaw
      ? structuredClone(normalizeRetiredImageTool(node.studioRaw))
      : { id: node.id, type: 'text-node' };

  const settings: Record<string, unknown> = { ...asRecord(raw.settings) };
  Object.assign(raw, {
    id: node.id,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    isGenerating: node.status === 'generating',
    createdAt: node.createdAt,
    missingMedia: node.missingMedia,
  });
  if (!previous && node.studioRaw && node.studioRaw.id !== node.id) {
    for (const key of ['beikeTaskId', 'beikeLastTaskId', 'beikeTaskRecord', 'beikeTaskStopped', 'beikePromptOperationId',
      'beikePromptRecoveryRequired', 'beikeSpeechOperationId', 'beikeSpeechRecoveryRequired']) delete raw[key];
  }
  settings.beikeCanvasType = node.type;
  settings.beikeLayerLocked = node.layerLocked;
  settings.beikeLayerHidden = node.layerHidden;
  settings.beikeFoldLeader = node.isFoldLeader;
  settings.beikeFoldedInGroupId = node.foldedInGroupId;
  settings.beikeFoldedCount = node.foldedCount;
  if (node.title !== undefined) raw.nodeName = node.title;
  settings.isGenerating = node.status === 'generating';
  if (node.status === 'error' && node.content) {
    raw.errorMsg = node.content;
    settings.error = node.content;
  } else if (node.status !== 'error') {
    raw.errorMsg = undefined;
    delete settings.error;
  }

  if (node.studioSubType && isCanvasPriorityTool(node.studioSubType)) {
    raw.type = node.studioSubType;
    settings.beikeSpecialized = node.specialized;
    raw.beikeTextOperationId = node.textOperationId;
    raw.beikeTextRecoveryRequired = node.textRecoveryRequired;
    settings.smartBuild = node.specialized?.smartBuild;
    settings.beikeModelUrl = node.modelUrl;
    settings.text = node.content;
    settings.textNodeChatModel = node.textModel;
    settings.audioUrl = node.audioUrl;
    raw.prompt = node.textPrompt;
    if (node.studioSubType === 'motion-control') {
      raw.prompt = node.content;
      raw.beikeTaskId = node.taskId;
      settings.model = node.drawing?.model;
      settings.resolution = node.drawing?.quality;
      settings.beikeVideoMode = 'motion_control';
      settings.beikeVideoAudio = node.drawing?.audio;
      settings.beikeMotionReferences = node.drawing?.references;
    }
    raw.imageUrl = node.imageUrl;
    raw.videoUrl = node.videoUrl;
  } else if (node.studioSubType && isCanvasLocalTool(node.studioSubType)) {
    raw.type = node.studioSubType;
    settings.beikeNativeTool = true;
    if (node.studioSubType === 'table-editor-node' && node.content !== undefined) settings.text = node.content;
    if (node.content !== undefined) settings.beikeToolContent = node.content;
    if (node.imageUrl) raw.imageUrl = node.imageUrl;
    if (node.videoUrl) raw.videoUrl = node.videoUrl;
  } else if (node.studioSubType && ['storyboard-node', 'storyboard-chart-node', 'video-timeline', 'doodle-canvas'].includes(node.studioSubType)) {
    raw.type = node.studioSubType;
    if (node.content !== undefined) raw.prompt = node.content;
    if (node.imageUrl) { raw.content = node.imageUrl; raw.imageUrl = node.imageUrl; }
    if (node.videoUrl) { raw.content = node.videoUrl; raw.videoUrl = node.videoUrl; }
    if (node.timelineSnap !== undefined) settings.timelineSnap = node.timelineSnap;
    if (node.timelineClips) settings.timelineClips = node.timelineClips;
    if (node.doodleStrokes) settings.doodleStrokes = node.doodleStrokes;
    if (node.storyboardShots) settings.storyboardShots = node.storyboardShots;
    if (node.storyboardChart) {
      settings.beikeChartColumns = node.storyboardChart.columns;
      settings.beikeChartRowHeight = node.storyboardChart.rowHeight;
    }
  } else if (['prompt', 'note', 'frame', 'group'].includes(node.type)) {
    if (raw.type === 'custom-agent' || (!previous && !node.studioRaw)) {
      raw.type = 'text-node';
    }
    if (node.studioSubType === 'video-prompt-optimizer') {
      settings.beikePromptCompiler = true;
      settings.beikeScriptOnly ??= false;
      settings.textNodeComposerOpen = true;
      if (node.drawing) settings.beikeCompilerDrawing = node.drawing;
      if (node.promptOptimization) raw.beikePromptOptimization = node.promptOptimization;
    }
    if (node.status !== 'error') {
      const body = node.content ?? '';
      raw.content = body;
      settings.text = body;
      if (settings.beikeTextResultRequired) settings.textNodeDisplayText = body;
    }
    if (settings.beikePromptCompiler && settings.beikeScriptOnly === true) {
      // The template owns the segment selector. The canvas textarea only stores extra directions.
      if (node.textPrompt !== undefined) settings.textNodeDraftPrompt = node.textPrompt;
      else if (settings.textNodeDraftPrompt === raw.prompt) delete settings.textNodeDraftPrompt;
    } else if (node.textPrompt !== undefined) {
      raw.prompt = node.textPrompt;
      settings.textNodeDraftPrompt = node.textPrompt;
    }
    if (node.textModel) {
      settings.textNodeChatModel = settings.beikePromptCompiler
        ? `beike:chat:${stripStudioPrefix(node.textModel)}`
        : node.textModel;
    }
    settings.beikeTextHtml = node.textHtml;
    settings.textNodeBackgroundColor = node.textBackground;
    settings.textNodeAutoHeight = node.textAutoHeight;
    settings.textNodeWebSearchEnabled = node.textWebSearch;
    settings.textNodeForceBase64Image = node.textBase64Image;
    settings.textNodeGeminiApiFormat = node.textApiFormat;
    settings.textNodeGeminiTier = node.textTier;
    settings.textNodeReasoningEffort = node.textReasoningEffort;
    raw.beikeTextOperationId = node.textOperationId;
    raw.beikeTextRecoveryRequired = node.textRecoveryRequired;
  } else if (node.type === 'drawing') {
    const isVideo = node.generationKind === 'video';
    raw.type = isVideo ? 'gen-video' : 'gen-image';
    raw.beikeCanvasTaskRecord = node.generationIntent;
    raw.beikeCanvasTaskId = node.taskId !== (raw.beikeTaskId || raw.beikeLastTaskId) ? node.taskId : undefined;
    if (!raw.beikeTaskId && !raw.beikeLastTaskId || Array.isArray(settings.beikeCanvasRuns)) {
      settings.beikeCanvasRuns = node.runs;
      settings.beikeCanvasRunIndex = node.activeRunIndex;
    }
    if (node.status !== 'error' && node.content !== undefined) raw.prompt = node.content;
    if (node.drawing) {
      const { generationQuality, backgroundMode, customWidth, customHeight, base64Output, contextIrEnabled, portraitTexture, cinemaConfig } = node.drawing;
      settings.beikeDrawingExtras = { generationQuality, backgroundMode, customWidth, customHeight, base64Output, contextIrEnabled, portraitTexture, cinemaConfig };
      settings.beikeDrawingReferences = node.drawing.references;
      if (node.drawing.model) settings.model = node.drawing.model;
      if (node.drawing.aspect) settings.ratio = node.drawing.aspect;
      if (node.drawing.count) settings.batchCount = node.drawing.count;
      if (isVideo) {
        if (node.drawing.quality) settings.resolution = node.drawing.quality;
        if (node.drawing.duration) settings.duration = `${node.drawing.duration}s`;
        if (node.drawing.refMode) settings.beikeVideoMode = node.drawing.refMode;
        if (typeof node.drawing.audio === 'boolean') settings.beikeVideoAudio = node.drawing.audio;
        if (typeof node.drawing.optimizePrompt === 'boolean') settings.beikeOptimizePrompt = node.drawing.optimizePrompt;
      } else if (node.drawing.quality) {
        settings.gptImageQuality = node.drawing.quality;
      }
    }
    const mediaUrl = isVideo ? node.videoUrl : node.imageUrl;
    if (!mediaUrl && raw.beikeCanvasTaskId) {
      raw.content = undefined;
      raw.imageUrl = undefined;
      raw.videoUrl = undefined;
    }
    if (mediaUrl) {
      raw.content = mediaUrl;
      raw.previewType = isVideo ? 'video' : 'image';
      if (isVideo) raw.videoUrl = mediaUrl;
      else raw.imageUrl = mediaUrl;
    }
  } else if (node.mediaUpload && (node.type === 'image' || node.type === 'video' || node.type === 'audio')) {
    raw.type = 'input-image';
    raw.content = node.type === 'audio' ? node.audioUrl : node.type === 'video' ? node.videoUrl : node.imageUrl;
    raw.imageUrl = node.type === 'image' ? node.imageUrl : undefined;
    raw.videoUrl = node.type === 'video' ? node.videoUrl : undefined;
    raw.previewType = node.type === 'audio' ? undefined : node.type;
    settings.audioUrl = node.type === 'audio' ? node.audioUrl : undefined;
    settings.mediaType = node.type;
    settings.beikeMediaUpload = true;
  } else if (node.type === 'file' || node.type === 'image' || node.type === 'video') {
    if (!previous && !node.studioRaw) raw.type = 'input-image';
    if (raw.type === 'input-image' || raw.type === 'video-input') {
      const url = node.videoUrl || node.imageUrl || node.audioUrl || '';
      if (url) raw.content = url;
      if (node.videoUrl) {
        raw.videoUrl = node.videoUrl;
        settings.mediaType = 'video';
      } else if (node.imageUrl) {
        raw.imageUrl = node.imageUrl;
        settings.mediaType = 'image';
      }
    }
  } else if (node.type === 'audio') {
    if (!previous && !node.studioRaw) raw.type = 'gen-speech';
    settings.beikeSpecialized = node.specialized;
    if (node.model) settings.model = node.model;
    if (node.audioUrl) {
      raw.content = node.audioUrl;
      settings.audioUrl = node.audioUrl;
    }
    if (node.content && node.content !== node.audioUrl) raw.prompt = node.content;
    raw.beikeSpeechOperationId = node.speechOperationId;
    raw.beikeSpeechRecoveryRequired = node.speechRecoveryRequired;
  } else if (node.type === 'preview') {
    raw.type = 'preview';
    const url = node.videoUrl || node.imageUrl || '';
    if (url) {
      raw.content = url;
      raw.previewType = node.videoUrl ? 'video' : 'image';
    }
  } else if (node.type === 'save') {
    if (!previous && !node.studioRaw) raw.type = 'local-save';
  } else if (node.type === 'compare') {
    raw.type = 'image-compare';
    if (node.compareBeforeUrl) settings.beforeUrl = node.compareBeforeUrl;
    if (node.compareAfterUrl) settings.afterUrl = node.compareAfterUrl;
  }

  raw.settings = settings;
  return raw;
}

export function studioSceneToCanvasGraph(scene: StudioScene, now = Date.now()): {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: { x: number; y: number; zoom: number };
} {
  const nodes = scene.nodes.map((node) => studioNodeToCanvasNode(node, scene, now));
  const rawEdges: CanvasEdge[] = scene.connections.map((conn) => ({
    id: conn.id,
    sourceNodeId: conn.from,
    targetNodeId: conn.to,
  }));
  const edges = syncEdgesWithNodeReferences(nodes, rawEdges);
  const view = scene.view || { x: 0, y: 0, zoom: 1 };
  const zoom = Number.isFinite(view.zoom) ? Math.max(0.1, Math.min(2.5, view.zoom)) : 1;
  return {
    nodes,
    edges,
    viewport: { x: Number.isFinite(view.x) ? view.x : 0, y: Number.isFinite(view.y) ? view.y : 0, zoom },
  };
}

export function syncCanvasGraphToStudioScene(project: CanvasProject): StudioScene {
  const baseScene: StudioScene = project.studioScene || {
    nodes: [],
    connections: [],
    groups: [],
    textBoxes: [],
    strokes: [],
    view: project.viewport || { x: 0, y: 0, zoom: 1 },
  };
  const previousMap = new Map(baseScene.nodes.map((n) => [n.id, n]));
  const nodes = project.nodes.map((node) => canvasNodeToStudioNode(node, previousMap.get(node.id)));
  const prevConnMap = new Map(baseScene.connections.map((c) => [`${c.from}->${c.to}`, c]));
  const connections: StudioScene['connections'] = [];
  const seenPairs = new Set<string>();

  for (const node of project.nodes) {
    for (const refId of node.referenceNodeIds || []) {
      const key = `${refId}->${node.id}`;
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      const existing = prevConnMap.get(key);
      connections.push(existing ? { ...existing, from: refId, to: node.id } : { id: `${project.id}-${refId}-${node.id}`, from: refId, to: node.id });
    }
  }
  for (const edge of project.edges || []) {
    const key = `${edge.sourceNodeId}->${edge.targetNodeId}`;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    const existing = prevConnMap.get(key);
    connections.push(existing ? { ...existing, from: edge.sourceNodeId, to: edge.targetNodeId } : { id: edge.id, from: edge.sourceNodeId, to: edge.targetNodeId });
  }

  const groupMembers = new Map<string, string[]>();
  for (const node of project.nodes) {
    if (!node.groupId) continue;
    const members = groupMembers.get(node.groupId) ?? [];
    members.push(node.id);
    groupMembers.set(node.groupId, members);
  }
  const oldGroups = new Map((baseScene.groups as CanvasStudioGroup[]).filter(group => group?.id).map(group => [group.id, group]));
  const groups = [...groupMembers].map(([id, nodeIds]) => ({ ...oldGroups.get(id), id, nodeIds }));
  return { ...baseScene, nodes, connections, groups, view: project.viewport || baseScene.view };
}


function legacyTimelineClips(settings: Record<string, unknown>): CanvasNode['timelineClips'] {
  if (!Array.isArray(settings.videoTimelineSources) || !Array.isArray(settings.videoTimelineClips)) return undefined;
  const sources = new Map(settings.videoTimelineSources.flatMap(source => {
    if (!source || typeof source.id !== 'string' || typeof source.url !== 'string' || !Number.isFinite(source.duration)) return [];
    return [[source.id, { url: String(source.url), duration: Number(source.duration), title: typeof source.fileName === 'string' ? source.fileName : undefined }] as const];
  }));
  return settings.videoTimelineClips.flatMap(clip => {
    const source = clip && sources.get(clip.sourceId);
    if (!source || typeof clip.id !== 'string' || !Number.isFinite(clip.sourceStart) || !Number.isFinite(clip.sourceEnd)) return [];
    return [{ ...source, id: clip.id, trimStart: clip.sourceStart, trimEnd: clip.sourceEnd }];
  });
}
