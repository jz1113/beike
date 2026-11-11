import { imageCapabilities, imageOutputTier } from '@shared/domain/media/imageCapabilities';
import { availableBatchModels, buildGenerationPromptBatch } from '@client/shared/agent/buildGenerationPromptBatch';
import { currentBatchSettings } from '@client/shared/agent/dispatchGenerationBatch';
import { apiFetch, storageConfigHeaders } from '@client/shared/api/apiClient';
import { getGatewayClientBaseUrl, getModelCredentials, getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { registerDepthSubmit } from '@client/shared/api/generation/depthGeneration';
import { fetchMediaBlob } from '@client/shared/media/downloadMedia';
import { registerRefMedia, registerRefMediaKind } from '@client/shared/media/refMediaRegistry';
import { useAppStore } from '@client/store';
import { getVideoModelById, resolveVideoResolution } from '@shared/domain/media/video';
import { resolveVideoMode, videoDurationOptions, videoModes, videoRatioOptions, videoResolutionOptions } from '@shared/domain/media/videoCapabilities';
import { isFalOmniVideoModel, isMetasoH3 } from '@shared/domain/media/videoChannels';
import { modalityPickerSelections, readEffectiveModalityModels } from '@shared/domain/models/modalityStorage';
import { canonicalModelId, compareModelDisplayOrder, listSelectableModels } from '@shared/domain/models/modelCatalog';
import { inferVendorId } from '@shared/domain/models/modelSorting';
import { getEnabledMultimodalModelsFromSettings, hasWorkflowModelConfiguration, readWorkflowModelsFromStorage } from '@shared/domain/models/workflowModels';
import { requestCanvasText, type CanvasTextContext } from './canvasTextRequest';

function versionParts(modelId: string): number[] {
  const id = canonicalModelId(modelId).toLowerCase()
    .replace(/[-_](?:20\d{6}|\d{6})(?=[-_]|$)/g, '')
    .replace(/\d+(?:ms|s)(?=[-_]|$)/g, '');
  // Accept both Seedance 2-5 and 2.5; dates and durations are not generations.
  return id.match(/\d+(?:[._-]\d{1,2}(?!\d))*/)?.[0].split(/[._-]/).map(Number) ?? [];
}

export function sortStudioModels<T extends { modelId: string }>(
  models: readonly T[], kind?: 'voice',
): T[] {
  if (kind !== 'voice') return models.toSorted((a, b) => compareModelDisplayOrder(a.modelId, b.modelId));
  const vendors = new Map<string, Array<{ model: T; version: number[] }>>();
  for (const model of models) {
    const vendor = inferVendorId(model.modelId);
    const group = vendors.get(vendor) ?? [];
    group.push({ model, version: versionParts(model.modelId) });
    vendors.set(vendor, group);
  }
  return [...vendors.values()].flatMap(group => group.sort((a, b) => {
    for (let index = 0; index < Math.max(a.version.length, b.version.length); index++) {
      const difference = (b.version[index] ?? 0) - (a.version[index] ?? 0);
      if (difference) return difference;
    }
    return 0;
  }).map(item => item.model));
}

/** 画布引用标记按混合列表编号；生成接口按媒体类型分别编号。 */
const referenceTokens = /@(图片|视频|音频|img)?(\d+)/gi;
const explicitKind = (label:string|undefined) => label?.toLowerCase()==='img' || label==='图片' ? 'image'
  : label==='视频' ? 'video' : label==='音频' ? 'audio' : undefined;

export function assertStudioReferenceNumbers(prompt:string, refs:ReadonlyArray<{type:'image'|'video'|'audio'}>):void {
  for(const match of prompt.matchAll(referenceTokens)) {
    const ref=refs[Number(match[2])-1],kind=explicitKind(match[1]);
    if(!ref || kind && ref.type!==kind)
      throw new Error(`提示词引用 ${match[0]} 的素材已移除或类型不匹配，请重新引用后提交`);
  }
}

export function normalizeStudioReferenceNumbers(prompt:string, refs:ReadonlyArray<{type:'image'|'video'|'audio'}>):string {
  return prompt.replace(referenceTokens, (token, label:string|undefined, number:string) => {
    const position=Number(number)-1,ref=refs[position],kind=explicitKind(label);
    if (!ref || kind && ref.type!==kind) return token;
    const index=refs.slice(0,position+1).filter(item=>item.type===ref.type).length;
    return `@${ref.type==='image'?'图片':ref.type==='video'?'视频':'音频'}${index}`;
  });
}

/** Connected text is embedded with the same numbered source header as the editor. */
export function assertStudioTextReferences(prompt:string):void {
  const headers=[...prompt.matchAll(/【@文本(\d+)(?: · [^】]*)?】/g)];
  const available=new Set(headers.filter((match,index)=>
    prompt.slice(match.index!+match[0].length,headers[index+1]?.index).trim()).map(match=>Number(match[1])));
  for(const match of prompt.matchAll(/@文本(\d+)/g)) {
    if(!available.has(Number(match[1])))throw new Error(`提示词引用 ${match[0]} 的文本未连接或内容为空，请重新引用后提交`);
  }
}

export function studioChannels() {
  const state = useAppStore.getState();
  const fallback = !hasWorkflowModelConfiguration();
  const chatSettings = getEnabledMultimodalModelsFromSettings(readWorkflowModelsFromStorage(), 'assistant');
  const chat = modalityPickerSelections('chat') ?? ((chatSettings.length || !fallback
    ? chatSettings : listSelectableModels('multimodal')).map(m => ({id:m.id,name:m.name,modelId:m.id})));
  const chats = sortStudioModels(chat).map(m => ({id:'beike:chat:'+m.id, name:m.name || m.id, kind:'chat' as const, route:m.id, modelId:m.modelId, preferred:m.id === state.assistantModel}));
  const media = (['image', 'video'] as const).flatMap(kind => {
    const configured = availableBatchModels(kind);
    const options = configured.length || !fallback || modalityPickerSelections(kind) ? configured
      : listSelectableModels(kind).filter(m => m.adapter !== 'fal-omni').map(m => ({id:m.id,modelId:m.id,name:m.name}));
    const ordered = sortStudioModels(options);
    return ordered.map(model => ({id:`beike:${kind}:${model.id}`,name:model.name,kind,route:model.id,
      modelId:model.modelId,metasoH3:kind==='video' && isMetasoH3(model.modelId,getGatewayClientBaseUrl(model.id)),preferred:model.id === (kind === 'image' ? state.quickModel : state.quickVideoModel)}));
  });
  const voiceOptions = modalityPickerSelections('voice') ?? readEffectiveModalityModels('voice').models.map(m => ({...m,id:m.modelId}));
  const voices = sortStudioModels(voiceOptions.map(m => ({id:'beike:voice:'+m.id, route:m.id,
    modelId:m.modelId, name:m.name || m.id, kind:'voice' as const, preferred:false})), 'voice');
  return [...media, ...chats, ...voices];
}

export function supportsCoverStyleReference(modelId: string) {
  return (imageCapabilities(modelId).maxReferenceImages ?? 2) >= 2;
}

export interface StudioRequest {
  taskId: string;
  canvasInputKey?: string;
  operation?: string;
  model: string;
  prompt: string;
  refs: Array<string | {type:'image' | 'video' | 'audio'; url:string}>;
  requiresCoverStyleReference?: boolean;
  imageQuality?: string;
  imageSize?: string;
  ratio?: string;
  duration?: number;
  resolution?: string;
  videoMode?: string;
  optimizePrompt?: boolean;
  scriptOnly?: boolean;
  videoWorkflow?: 'w3-copy';
  audio?: boolean;
}

export function prepareStudioGeneration(request: StudioRequest) {
  const store = useAppStore.getState();
  if (!store.generationHistoryReady) throw new Error('生成历史仍在恢复，请稍后重试');
  const channel = studioChannels().find(model => model.id === request.model);
  if (!channel || (channel.kind !== 'image' && channel.kind !== 'video')) throw new Error('请在贝壳云图的模型设置中启用所选模型');
  if(request.videoWorkflow==='w3-copy' && channel.kind!=='video')throw new Error('分镜复刻需要选择视频模型');
  if(request.scriptOnly && (channel.kind!=='video'||request.videoMode!=='omni'||!request.refs.length||request.refs.some(r=>typeof r!=='string'&&r.type!=='image')||typeof request.audio!=='boolean'||!Number.isInteger(request.duration)||!request.duration||request.duration<=0))throw new Error('全能参考复刻需要视频模型、全能模式、目标参考图以及明确的片段时长和声音参数');
  const storyboardFirstFrame=request.videoWorkflow==='w3-copy' && (!request.videoMode || request.videoMode==='first_frame') && isMetasoH3(channel.modelId,getGatewayClientBaseUrl(channel.route));
  if(storyboardFirstFrame) {
    if(request.refs.some(ref=>typeof ref!=='string' && ref.type==='video'))throw new Error('分镜复刻不提交原视频，请只连接分镜脚本和目标关键帧');
    if(!request.refs.length)throw new Error('请先生成并连接本片段的目标关键帧');
    if(typeof request.duration!=='number' || !Number.isInteger(request.duration) || request.duration<4 || request.duration>15)throw new Error('分镜片段时长必须为 4–15 秒的整数');
    if(typeof request.audio!=='boolean')throw new Error('请在分镜中确定静音或生成声音');
  }
  if (request.requiresCoverStyleReference &&
      (channel.kind !== 'image' || !supportsCoverStyleReference(channel.modelId))) {
    throw new Error('所选模型不支持同时使用商品图和版式图，请更换图片模型');
  }
  const prompt = request.prompt.trim();
  if (!prompt) throw new Error('请先填写提示词或连接文字节点');
  if ([...store.generationTasks, ...store.sessions.flatMap(s => s.tasks)].some(task => task.id === request.taskId)) return;

  const media = request.refs.map((ref, index) => {
    const {type, url} = typeof ref === 'string' ? {type:'image' as const, url:ref} : ref;
    if (!/^(https?:\/\/|\/storage\/)/i.test(url) && !url.startsWith('data:' + type + '/')) throw new Error('参考素材需要重新导入');
    if(type!=='audio')registerRefMediaKind(url, type);
    return {id:String(index), name:`参考${type === 'video' ? '视频' : type === 'audio' ? '音频' : '图'} ${index + 1}`, type, url};
  });
  // The cover compiler has already bound both references. Keep its formatted
  // prompt out of generic cleanup, which can rewrite literal text in titles.
  const taskBuilderPrompt = request.requiresCoverStyleReference ? '商品图 @图片1，版式样张 @图片2' : prompt;
  assertStudioReferenceNumbers(taskBuilderPrompt,media);
  assertStudioTextReferences(taskBuilderPrompt);
  const providerPrompt = taskBuilderPrompt.replace(/@文本(\d+)/g,'文本$1');
  if(channel.kind==='image' && media.some(item=>item.type!=='image'))throw new Error('图片生成不支持视频引用或音频引用，请移除后重试');
  const visual = media.flatMap(item=>item.type==='audio'?[]:[{...item,type:item.type}]);
  const audios = media.filter(item=>item.type==='audio').map(item=>item.url);
  const settings = currentBatchSettings();
  if(typeof request.audio==='boolean') settings.videoGenerateAudio=request.audio;
  let aspect = /^\d+:\d+$/.test(request.ratio ?? '') ? request.ratio : undefined;
  let duration = request.duration;
  let appliedVideoSettings;
  if (channel.kind === 'image') {
    settings.imageModel = channel.route;
    if (request.ratio === 'smart' || request.ratio === 'auto') aspect = request.ratio;
    const quality = request.imageQuality;
    const credentials = getModelCredentials(channel.route);
    const caps = imageCapabilities(channel.modelId, credentials.protocol, credentials.baseUrl);
    if (!request.resolution && !caps.sendsQuality && (quality === 'low' || quality === 'medium' || quality === 'high')) {
      settings.imageQuality = quality;
    }
    if (request.resolution === '512px' || request.resolution === '1K' || request.resolution === '2K' || request.resolution === '4K') {
      if (!caps.resolutions.includes(request.resolution)) throw new Error('所选图片模型不支持当前分辨率，请重新选择');
      settings.imageQuality = imageOutputTier(request.resolution);
    }
    if (quality && caps.qualities?.some(value => value === quality)) {
      settings.imageQualityTier = quality as NonNullable<typeof settings.imageQualityTier>;
    }
  } else {
    settings.videoModel = channel.route;
    const model = channel.modelId;
    if (isFalOmniVideoModel(model) && request.audio === undefined) settings.videoGenerateAudio = undefined;
    const baseUrl = getGatewayClientBaseUrl(channel.route);
    const profile = getVideoModelById(model, baseUrl);
    if(audios.length&&!profile)throw new Error('当前视频模型未接入参考音频');
    if(request.scriptOnly&&!profile)throw new Error('所选模型缺少已验证的全能参考能力，视频尚未提交');
    if (profile) {
      const videos = visual.filter(item => item.type === 'video').map(item=>item.url);
      const images = visual.filter(item => item.type === 'image').map(item=>item.url);
      const mode = resolveVideoMode(model, request.videoMode==='auto'?(audios.length?'omni':undefined):request.videoMode || (request.videoWorkflow==='w3-copy'?'first_frame':audios.length?'omni':undefined), images.length, videos.length, baseUrl);
      if(request.scriptOnly && (mode!=='omni'||!videoModes(model,baseUrl).some(option=>option.id==='omni')))throw new Error('当前模型或线路不支持全能参考模式，请切换模型，视频尚未提交');
      settings.videoRefMode = mode;
      const selectedResolution = request.resolution?.toUpperCase();
      const requestedResolution = (storyboardFirstFrame || (isMetasoH3(model, baseUrl) && selectedResolution === '720P')) ? '768P' : selectedResolution;
      settings.videoResolution = resolveVideoResolution(requestedResolution || settings.videoResolution, videoResolutionOptions(model, mode, baseUrl));
      if (requestedResolution && requestedResolution !== settings.videoResolution) {
        throw new Error('当前视频模型或生成方式不支持所选清晰度，请重新选择');
      }
      const requestedDuration = duration ?? settings.videoDuration;
      const options = videoDurationOptions(model, settings.videoResolution, mode, baseUrl);
      if (!options.length) throw new Error('当前视频线路没有可用时长，请重新选择模型或参数');
      if(request.scriptOnly&&!options.includes(requestedDuration))throw new Error('所选模型不支持当前分镜时长，请按可用时长重新拆分，视频尚未提交');
      if (request.duration !== undefined && !options.includes(request.duration)) throw new Error('当前视频模型或生成方式不支持所选时长，请重新选择');
      duration = options.reduce((best, value) => Math.abs(value - requestedDuration) < Math.abs(best - requestedDuration) ? value : best);
      const requestedAspect = /^(Auto|adaptive)$/i.test(request.ratio || '') ? 'adaptive' : aspect || settings.videoAspect;
      const ratios = videoRatioOptions(model, mode, baseUrl);
      aspect = ratios.includes(requestedAspect) ? requestedAspect : ratios[0];
      appliedVideoSettings = { resolution:settings.videoResolution, duration:`${duration}s`, ratio:aspect, beikeResolvedVideoMode:mode };
    }
  }
  const entry = {
    id: request.taskId, title: (request.requiresCoverStyleReference ? prompt : providerPrompt).slice(0, 40),
    prompt: normalizeStudioReferenceNumbers(providerPrompt, media), mediaType: channel.kind,
    referenceIndexes: visual.map((_, index) => index), referenceAudioUrls:audios,
    aspect, duration, imageSize: request.imageSize, imageResolution: request.resolution === '512px' ? '512px' as const : undefined,
  };
  const [task] = buildGenerationPromptBatch([entry], visual, settings, false); // 渠道已与当前的宿主目录校验。
  if (request.requiresCoverStyleReference && (task.referenceImages?.length !== 2 ||
      task.referenceImages.some((url, index) => url !== media[index]?.url))) {
    throw new Error('商品图或版式图未按顺序进入生图请求，图片未提交');
  }
  if (request.requiresCoverStyleReference) task.prompt = prompt;
  if(request.scriptOnly&&task.videoDuration!==request.duration)throw new Error('最终提交时长与分镜不一致，视频尚未提交');
  if(request.scriptOnly&&task.generateAudio!==request.audio)throw new Error('当前模型无法落实分镜声音参数，请切换模型或声音模式，视频尚未提交');
  const videoUrls=new Set(media.filter(item=>item.type==='video').map(item=>item.url));
  return {task:{ ...task, referenceVideoUrls:(task.referenceImages || []).filter(url=>videoUrls.has(url)), id: request.taskId },settings:appliedVideoSettings};
}

/** Uses the durable generation queue, including its existing submission recovery. */
export async function submitStudioDepth(request:StudioRequest, projectId:string, signal?:AbortSignal) {
  signal?.throwIfAborted();
  const store=useAppStore.getState();
  if(!store.generationHistoryReady) throw new Error('生成历史尚未恢复，请稍后重试');
  if(store.generationTasks.some(task=>task.id===request.taskId)) return;
  const refs=request.refs.filter((ref):ref is {type:'video';url:string}=>typeof ref!=='string' && ref.type==='video');
  if(refs.length!==1 || request.refs.length!==1) throw new Error('深度转换需要且只接受一条参考视频');
  const environment=await apiFetch('/api/system/depth-env',{signal});
  const env=await environment.json();
  signal?.throwIfAborted();
  if(!environment.ok || !env.depthModelReady) throw new Error(env.message || '本机深度模型尚未就绪，请先在设置中完成环境检查');
  const url=refs[0].url;
  if(!/^(https?:\/\/|\/storage\/|data:video\/)/i.test(url)) throw new Error('参考视频地址不可用');
  const blob=await fetchMediaBlob(url);
  if(!blob.size || (blob.type && !blob.type.startsWith('video/'))) throw new Error('参考素材不是有效的视频文件');
  signal?.throwIfAborted();
  const current=useAppStore.getState();
  if(!current.generationHistoryReady)throw new Error('生成历史尚未恢复，请稍后重试');
  if(current.generationTasks.some(task=>task.id===request.taskId))return;
  const file=new File([blob],'reference.mp4',{type:blob.type || 'video/mp4'});
  const resolution = request.resolution === '480p' || request.resolution === '720p' ? request.resolution : undefined;
  const quality = resolution === '720p' ? 'high' : 'standard';
  registerDepthSubmit(request.taskId,{file,style:'mocap',quality,mode:'depth-video'});
  registerRefMedia(url,file);
  current.addGenerationTask({id:request.taskId,canvasProjectId:projectId,title:'画布深度视频转换',prompt:'深度动作捕捉',mediaType:'depth-video',depthStyle:'mocap',model:'video-depth-anything',size:resolution || '-',quality,referenceImageUrl:url,referenceImages:[url],useReferenceImage:true,status:'IN_PROGRESS',progress:'5%',createdAt:Date.now()},false);
}

/** Public http(s) video on another host must be uploaded before a native chat request. */
export function isExternalStudioChatVideo(source: string, hostOrigin: string): boolean {
  try {
    const url = new URL(source);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!['http:', 'https:'].includes(url.protocol) || url.origin === hostOrigin) return false;
    if (host === 'localhost' || host.endsWith('.localhost') || host === '::1' || /^127\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Native text protocols require inline video, including when the source is public. */
export function studioChatVideoInline(model:string):boolean {
  const channel=studioChannels().find(ch=>ch.kind==='chat' && ch.id===model);
  if(!channel)return false;
  return getMultimodalClientOverrides(channel.route).textProtocol==='gemini';
}

/** Upload local video through the host, which owns object-storage credentials. */
export async function prepareStudioChatVideo(blob: Blob): Promise<string> {
  if (!blob.size || !blob.type.startsWith('video/')) throw new Error('参考视频已失效，请重新添加素材');
  const form = new FormData();
  form.append('file', new File([blob], 'reference.mp4', { type: blob.type }));
  const response = await apiFetch('/api/generate/upload-ref', {method:'POST', headers:storageConfigHeaders(), body:form});
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || typeof data.url !== 'string' || !/^https?:\/\//i.test(data.url)) {
    throw new Error(typeof data.error === 'string' ? data.error : '参考视频上传失败，请检查对象存储配置');
  }
  return data.url;
}

/** 由宿主提交，画布只能选择模型和消息，不能指定上游地址或凭据。 */
export async function canvasChatRequest(payload: Record<string, unknown>, signal: AbortSignal, context: CanvasTextContext) {
  const requestContext = {...context};
  const data = await requestCanvasText(() => {
    const channel = studioChannels().find(ch => ch.kind === 'chat' && ch.id === payload.model);
    if (!channel) throw new Error('所选文本模型已不可用，请重新选择贝壳云图模型');
    const {messages, tools, tool_choice, temperature, max_tokens, response_format, reasoning_effort} = payload;
    const overrides=getMultimodalClientOverrides(channel.route);
    const textProtocol=payload.textProtocol==='gemini'&&channel.modelId.startsWith('gemini-')?'gemini':overrides.textProtocol;
    requestContext.usageModel=channel.route;
    return {model:channel.modelId,
      messages, tools, tool_choice, temperature, max_tokens, response_format, reasoning_effort, beikeStoryboardAnalysis:payload.beikeStoryboardAnalysis===true, ...overrides, textProtocol};
  }, requestContext, signal);
  if (!payload.stream) return Response.json(data);
  const choices = (data.choices as Array<{message: {tool_calls?: Array<Record<string,unknown>>};finish_reason:string}>).map((choice: {message: {tool_calls?: Array<Record<string,unknown>>};finish_reason:string}, index:number) => ({
    index, finish_reason:choice.finish_reason, delta:{...choice.message, ...(choice.message.tool_calls ? {
      tool_calls:choice.message.tool_calls.map((call,i) => ({...call,index:i}))} : {})},
  }));
  return new Response('data: '+JSON.stringify({...data,choices})+'\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
}
