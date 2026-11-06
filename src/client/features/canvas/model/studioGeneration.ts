import { assertStudioReferenceNumbers, normalizeStudioReferenceNumbers } from './studioReferenceNumbers';
import { registerRefMediaKind } from '@client/shared/media/refMediaRegistry';
import { useAppStore } from '@client/store';
import { availableBatchModels, buildGenerationPromptBatch } from '@client/shared/agent/buildGenerationPromptBatch';
import { currentBatchSettings } from '@client/shared/agent/dispatchGenerationBatch';

import { getEnabledMultimodalModelsFromSettings, hasWorkflowModelConfiguration, readWorkflowModelsFromStorage } from '@shared/domain/models/workflowModels';
import { modalityPickerSelections, readEffectiveModalityModels } from '@shared/domain/models/modalityStorage';

import { getGatewayClientBaseUrl } from '@client/shared/api/gatewayClient';
import { getVideoModelById, resolveVideoResolution } from '@shared/domain/media/video';
import { resolveVideoMode, videoDurationOptions, videoRatioLocked, videoResolutionOptions } from '@shared/domain/media/videoCapabilities';
import { listApprovedModels } from '@shared/domain/models/modelCatalog';
import { sortStudioModels } from './studioModelSorting';

export function studioChannels() {
  const state = useAppStore.getState();
  const fallback = !hasWorkflowModelConfiguration();
  const chatSettings = getEnabledMultimodalModelsFromSettings(readWorkflowModelsFromStorage(), 'assistant');
  const chat = modalityPickerSelections('chat') ?? ((chatSettings.length || !fallback
    ? chatSettings : listApprovedModels('multimodal')).map(m => ({id:m.id,name:m.name,modelId:m.id})));
  const chats = sortStudioModels(chat).map(m => ({id:'beike:chat:'+m.id, name:m.name || m.id, kind:'chat' as const, route:m.id, modelId:m.modelId, preferred:m.id === state.assistantModel}));
  const media = (['image', 'video'] as const).flatMap(kind => {
    const configured = availableBatchModels(kind);
    const options = configured.length || !fallback || modalityPickerSelections(kind) ? configured
      : listApprovedModels(kind).map(m => ({id:m.id,modelId:m.id,name:m.name}));
    return sortStudioModels(options).map(model => ({id:`beike:${kind}:${model.id}`,name:model.name,kind,route:model.id,
      modelId:model.modelId,preferred:model.id === (kind === 'image' ? state.quickModel : state.quickVideoModel)}));
  });
  const voiceOptions = modalityPickerSelections('voice') ?? readEffectiveModalityModels('voice').models.map(m => ({...m,id:m.modelId}));
  const voices = sortStudioModels(voiceOptions.map(m => ({id:'beike:voice:'+m.id, route:m.id,
    modelId:m.modelId, name:m.name || m.id, kind:'voice' as const, preferred:false})));
  return [...media, ...chats, ...voices];
}

export interface StudioRequest {
  taskId: string;
  model: string;
  prompt: string;
  refs: Array<string | {type:'image' | 'video'; url:string}>;
  imageQuality?: string;
  ratio?: string;
  duration?: number;
  resolution?: string;
  optimizePrompt?: boolean;
}

export function prepareStudioGeneration(request: StudioRequest) {
  const store = useAppStore.getState();
  if (!store.generationHistoryReady) throw new Error('生成历史仍在恢复，请稍后重试');
  const channel = studioChannels().find(model => model.id === request.model);
  if (!channel || (channel.kind !== 'image' && channel.kind !== 'video')) throw new Error('请在贝壳云图的模型设置中启用所选模型');
  const prompt = request.prompt.trim();
  if (!prompt) throw new Error('请先填写提示词或连接文字节点');
  if ([...store.generationTasks, ...store.sessions.flatMap(s => s.tasks)].some(task => task.id === request.taskId)) return;

  const media = request.refs.map((ref, index) => {
    const {type, url} = typeof ref === 'string' ? {type:'image' as const, url:ref} : ref;
    if (!/^(https?:\/\/|\/storage\/)/i.test(url) && !url.startsWith('data:' + type + '/')) throw new Error('参考素材需要重新导入');
    registerRefMediaKind(url, type);
    return {id:String(index), name:`参考${type === 'video' ? '视频' : '图'} ${index + 1}`, type, url};
  });
  assertStudioReferenceNumbers(prompt, media);
  const settings = currentBatchSettings();
  let aspect = /^\d+:\d+$/.test(request.ratio ?? '') ? request.ratio : undefined;
  let duration = request.duration;
  let appliedVideoSettings;
  if (channel.kind === 'image') {
    settings.imageModel = channel.route;
    const quality = request.imageQuality;
    if (/gpt-image/i.test(channel.modelId) && (quality === 'low' || quality === 'medium' || quality === 'high')) {
      settings.imageQuality = settings.imageQualityTier = quality;
    }
  } else {
    settings.videoModel = channel.route;
    const model = channel.modelId;
    const baseUrl = getGatewayClientBaseUrl(channel.route);
    const profile = getVideoModelById(model, baseUrl);
    if (profile) {
      const videoCount = media.filter(item => item.type === 'video').length;
      const mode = resolveVideoMode(model, undefined, media.length - videoCount, videoCount, baseUrl);
      settings.videoRefMode = mode;
      settings.videoResolution = resolveVideoResolution(request.resolution || settings.videoResolution, videoResolutionOptions(model, mode, baseUrl));
      const requestedDuration = duration ?? settings.videoDuration;
      const options = videoDurationOptions(model, settings.videoResolution, mode, baseUrl);
      if (!options.length) throw new Error('当前视频线路没有可用时长，请重新选择模型或参数');
      duration = options.reduce((best, value) => Math.abs(value - requestedDuration) < Math.abs(best - requestedDuration) ? value : best);
      const requestedAspect = aspect || settings.videoAspect;
      aspect = videoRatioLocked(model, mode, baseUrl) ? 'adaptive' : profile.supportedAspectRatios.includes(requestedAspect) ? requestedAspect : profile.supportedAspectRatios[0];
      appliedVideoSettings = { resolution:settings.videoResolution, duration:`${duration}s`, ratio:aspect };
    }
  }
  const entry = {
    id: request.taskId, title: prompt.slice(0, 40), prompt: normalizeStudioReferenceNumbers(prompt, media), mediaType: channel.kind,
    referenceIndexes: media.map((_, index) => index),
    aspect, duration,
  };
  const [task] = buildGenerationPromptBatch([entry], media, settings, false); // 渠道已与当前的宿主目录校验。
  return { task: { ...task, referenceVideoUrls:media.filter(item=>item.type === 'video').map(item=>item.url), id: request.taskId }, settings: appliedVideoSettings };
}

export function submitStudioGeneration(request: StudioRequest) {
  const prepared = prepareStudioGeneration(request);
  if (prepared) useAppStore.getState().addGenerationTask(prepared.task, false);
  return prepared?.settings;
}
