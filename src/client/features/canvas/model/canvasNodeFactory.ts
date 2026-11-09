import { apiFetch, proxyMediaUrl, readClientStorageConfig, storageConfigHeaders } from '@client/shared/api/apiClient';
import { getGatewayClientBaseUrl } from '@client/shared/api/gatewayClient';
import { extractImageDimensionsFromFile, extractVideoMetadataFromFile } from '@client/shared/media/mediaHelper';
import type { MultiAngleParams } from '@client/shared/modals/multi-angle/CanvasMultiAngleModal';
import { getVideoModelById } from '@shared/domain/media/video';
import {
  modalityPickerSelections,
  readEffectiveModalityModels,
  readStoredApiProviders,
  selectableModalityModels,
  type ModalityPickerSelection,
  type ModalityStorageKind,
} from '@shared/domain/models/modalityStorage';
import {
  getEnabledImageModelsFromSettings,
  getEnabledMultimodalModelsFromSettings,
  getEnabledVideoModelsFromSettings,
  hasWorkflowModelConfiguration,
  readWorkflowModelsFromStorage,
} from '@shared/domain/models/workflowModels';
import { DEFAULT_MULTIMODAL_MODEL_ID } from '@shared/domain/models/modelCatalog';
import type {
  CanvasLocalTool,
  CanvasNode,
  CanvasPriorityTool,
  CanvasQuickNodeType,
  CanvasSpecializedSettings,
} from './types';

export type MainLightDirection = 'left' | 'top' | 'right' | 'front' | 'bottom' | 'back';

export interface LightingParams {
  viewMode: 'perspective' | 'front';
  smartMode: boolean;
  brightness: number; // 0 - 100
  color: string; // 'original' | hex
  mainLight: MainLightDirection;
  rimLight: boolean;
  lightCoords: { x: number; y: number }; // normalized 0 - 100
  model?: string;
  quality?: string;
  aspectRatio?: string;
}

// 分视图的光源预设坐标 (透视视角 vs 正面视角)
export const LIGHT_DIRECTION_COORDS_BY_VIEW: Record<'perspective' | 'front', Record<MainLightDirection, { x: number; y: number }>> = {
  perspective: {
    left: { x: 14, y: 50 },
    top: { x: 50, y: 15 },
    right: { x: 86, y: 50 },
    front: { x: 22, y: 70 }, // 透视视角下偏左前侧
    bottom: { x: 50, y: 86 },
    back: { x: 74, y: 32 },
  },
  front: {
    left: { x: 14, y: 50 },
    top: { x: 50, y: 14 },
    right: { x: 86, y: 50 },
    front: { x: 50, y: 64 }, // 正面视角下落在卡片正中下部（如截图所示）
    bottom: { x: 50, y: 86 },
    back: { x: 50, y: 38 },
  },
};

export const DEFAULT_LIGHTING_PARAMS: LightingParams = {
  viewMode: 'perspective',
  smartMode: false,
  brightness: 50,
  color: 'original',
  mainLight: 'front',
  rimLight: false,
  lightCoords: { x: 22, y: 70 }, // 默认透视视角的前方位置
};

// 兼容向后导出的单层预设坐标（使用透视模式）
export const LIGHT_DIRECTION_COORDS = LIGHT_DIRECTION_COORDS_BY_VIEW.perspective;

// 常用推荐光色预设
export const PRESET_LIGHT_COLORS = [
  { name: '原色白光', value: 'original', color: '#ffffff' },
  { name: '暖阳暖光', value: '#ffd199', color: '#ffd199' },
  { name: '黄昏晚霞', value: '#ff884d', color: '#ff884d' },
  { name: '冷调月光', value: '#99d6ff', color: '#99d6ff' },
  { name: '赛博霓虹', value: '#d966ff', color: '#d966ff' },
  { name: '清新青翠', value: '#70e0a5', color: '#70e0a5' },
];

/** One geometry source for the preview, title, connection anchors and canvas bounds (桥豆麻衣酱 sfe 1:1 尺寸: 图片 250x250, 视频 444x250). */
export function drawingGeometry(node: CanvasNode) {
  const video = node.generationKind === 'video';
  const fallback = video ? 16 / 9 : 1;
  const [width, height] = (node.drawing?.aspect || '').split(':').map(Number);
  const selectedRatio = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? width / height : fallback;
  const hasResult = Boolean(node.imageUrl || node.videoUrl);
  const resultRatio = node.resultWidth && node.resultHeight ? node.resultWidth / node.resultHeight : 0;
  // Existing results retain their actual dimensions when next-generation settings change.
  if (!hasResult && node.studioSubType === 'motion-control') return { width: 250, height: 250 };
  if (
    !hasResult &&
    (node.drawing?.portraitTexture?.isActive ||
      node.title === '人像质感调节' ||
      node.specialized?.operation?.startsWith('skill:'))
  ) {
    return { width: 540, height: 304 };
  }
  const ratio = hasResult && Number.isFinite(resultRatio) && resultRatio > 0 ? resultRatio : selectedRatio;
  if (!hasResult && Math.abs(ratio - 1) < 0.01) {
    return { width: 250, height: 250 };
  }
  if (!hasResult && Math.abs(ratio - 16 / 9) < 0.02) {
    return { width: 444, height: 250 };
  }
  if (!hasResult && Math.abs(ratio - 9 / 16) < 0.02) {
    return { width: 250, height: 444 };
  }
  const longestSide = video ? 444 : 250;
  return ratio >= 1
    ? { width: longestSide, height: Math.round(longestSide / ratio) }
    : { width: Math.round(longestSide * ratio), height: longestSide };
}

export interface CanvasGenerationModel {
  id: string;
  name: string;
  modelId?: string;
  provider?: string;
  supportedAspectRatios?: string[];
  supportedResolutions?: string[];
  supportedDurations?: number[];
}

/** 读取与「设置 -> 多模态/绘画/视频/语音」严格 1:1 对应的可选模型列表。 */
export function loadCanvasModalitySelections(kind: ModalityStorageKind): ModalityPickerSelection[] {
  const synced = modalityPickerSelections(kind);
  if (synced) return synced;
  if (typeof readEffectiveModalityModels === 'function' && typeof selectableModalityModels === 'function') {
    const read = readEffectiveModalityModels(kind);
    const providers = typeof readStoredApiProviders === 'function' ? readStoredApiProviders() : [];
    const counts = new Map<string, number>();
    for (const item of read.models) {
      const modelId = item.modelId.trim();
      counts.set(modelId, (counts.get(modelId) || 0) + 1);
    }
    return selectableModalityModels(read.models, providers).map((item) => {
      const modelId = item.modelId.trim();
      const duplicated = (counts.get(modelId) || 0) > 1;
      const channel = item.channelId ? providers.find((provider) => provider.id === item.channelId)?.name || '' : '';
      const storedName = item.name?.trim() || modelId;
      const name = duplicated && channel && !storedName.includes(`· ${channel}`)
        ? `${storedName} · ${channel}`
        : storedName;
      return {
        id: duplicated ? item.id : modelId,
        modelId,
        entryId: item.id,
        name,
        ...(channel ? { provider: channel } : {}),
      };
    });
  }
  return [];
}

/** 读取与「设置 -> 多模态」1:1 对应的文本/多模态模型列表。 */
export function loadCanvasChatModels(): CanvasGenerationModel[] {
  const synced = modalityPickerSelections('chat');
  const effective = synced ?? (!hasWorkflowModelConfiguration() ? loadCanvasModalitySelections('chat') : null);
  if (effective && effective.length > 0) {
    return effective.map((item) => ({
      id: item.id,
      name: item.name,
      modelId: item.modelId,
      provider: item.provider,
    }));
  }
  return getEnabledMultimodalModelsFromSettings(readWorkflowModelsFromStorage(), 'assistant')
    .filter((item) => typeof item.id === 'string' && item.id)
    .map((item) => ({
      id: String(item.id),
      name: typeof item.name === 'string' && item.name ? item.name : String(item.id),
      modelId: String(item.id),
      provider: item.provider,
    }));
}

/** 解析当前多模态节点实际使用的模型（优先当前节点 -> 上游文本节点继承 -> 默认旗舰多模态模型 -> 列表首项）。 */
export function resolveCanvasChatModel(
  models: CanvasGenerationModel[],
  preferred?: string,
  fallbackUpstream?: string,
): CanvasGenerationModel | undefined {
  const candidates = [preferred, fallbackUpstream, DEFAULT_MULTIMODAL_MODEL_ID].filter(
    (v): v is string => Boolean(v && v.trim()),
  );
  for (const target of candidates) {
    const match = models.find((item) => item.id === target || item.modelId === target);
    if (match) return match;
  }
  return models[0];
}

/** Preserve configured channel IDs so the picker and dispatch resolve one route. */
export function loadCanvasGenerationModels(video = false): CanvasGenerationModel[] {
  const kind: ModalityStorageKind = video ? 'video' : 'image';
  const synced = modalityPickerSelections(kind);
  const effective = synced ?? (!hasWorkflowModelConfiguration() ? loadCanvasModalitySelections(kind) : null);
  if (effective && effective.length > 0)
    return effective.map((item) => {
      const profile = video ? getVideoModelById(item.modelId, getGatewayClientBaseUrl(item.id)) : undefined;
      return {
        id: item.id,
        name: item.name,
        modelId: item.modelId,
        provider: item.provider,
        supportedAspectRatios: profile?.supportedAspectRatios,
        supportedResolutions: profile?.supportedResolutions,
        supportedDurations: profile?.supportedDurations,
      };
    });
  return (video ? getEnabledVideoModelsFromSettings : getEnabledImageModelsFromSettings)(readWorkflowModelsFromStorage())
    .filter((item) => typeof item.id === 'string' && item.id)
    .map((item) => ({
      id: String(item.id),
      name: typeof item.name === 'string' ? item.name : String(item.id),
      modelId: String(item.id),
      supportedAspectRatios: 'supportedAspectRatios' in item ? item.supportedAspectRatios : undefined,
      supportedResolutions: 'supportedResolutions' in item ? item.supportedResolutions : undefined,
      supportedDurations: 'supportedDurations' in item ? item.supportedDurations : undefined,
    }));
}

// The upload endpoint allows a 32 MiB request including multipart headers and metadata.
export const canvasMediaUploadLimitMb = { image: 30, video: 31, audio: 31 };

export function canvasMediaKind(file: File): 'video' | 'audio' | 'image' | undefined {
  if (/^(video|audio|image)\//.test(file.type)) {
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';
    return 'image';
  }
  if (/\.(mp4|webm|mov|mkv|avi|flv|m4v)$/i.test(file.name)) return 'video';
  if (/\.(mp3|wav|m4a|aac|ogg|flac|opus)$/i.test(file.name)) return 'audio';
  if (/\.(png|jpe?g|webp|gif|avif|bmp|svg)$/i.test(file.name)) return 'image';
}

function cardSize(isVideo: boolean, width: number, height: number) {
  const ratio = width > 0 && height > 0 ? width / height : 1;
  if (isVideo) {
    const cardWidth = ratio >= 1 ? 360 : 280;
    return { width: cardWidth, height: Math.round(cardWidth / ratio) };
  }
  return { width: 300, height: Math.round(300 / ratio) };
}

export async function persistCanvasMedia(file: File, viewCenterX: number, viewCenterY: number): Promise<Omit<CanvasNode, 'id' | 'createdAt'>> {
  const kind = canvasMediaKind(file);
  if (!kind) throw new Error('请选择图片、视频或音频文件');
  const isVideo = kind === 'video';
  const isAudio = kind === 'audio';
  const limit = canvasMediaUploadLimitMb[kind];
  if (file.size > limit * 1024 * 1024) {
    throw new Error(`单个素材上限为 ${limit} MB，请裁切或压缩后再上传`);
  }

  let resultWidth: number | undefined;
  let resultHeight: number | undefined;
  let thumbnailUrl: string | undefined;
  if (isVideo) {
    const meta = await extractVideoMetadataFromFile(file);
    resultWidth = meta.width;
    resultHeight = meta.height;
    thumbnailUrl = meta.thumbnailUrl;
  } else if (!isAudio) {
    const meta = await extractImageDimensionsFromFile(file);
    resultWidth = meta.width;
    resultHeight = meta.height;
  }

  const form = new FormData();
  form.append('file', file);
  form.append('category', isVideo ? 'generated/videos' : 'assets');
  form.append('customConfig', JSON.stringify(readClientStorageConfig()));
  const res = await apiFetch('/api/assets/storage/upload', { method: 'POST', headers: storageConfigHeaders(), body: form });
  const data = await res.json();
  if (!res.ok || !data.success || !data.url || /^(data:|blob:)/.test(data.url)) throw new Error(data.error || '媒体保存失败');
  const display =
    resultWidth && resultHeight
      ? cardSize(isVideo, resultWidth, resultHeight)
      : { width: 300, height: isVideo ? 480 : 400 };
  return {
    missingMedia: false,
    type: isAudio ? ('audio' as const) : isVideo ? ('video' as const) : ('image' as const),
    title: file.name.replace(/\.[^/.]+$/, '') || '本地素材',
    ...(isAudio ? { audioUrl: data.url } : isVideo ? { videoUrl: data.url, imageUrl: thumbnailUrl } : { imageUrl: data.url }),
    x: Math.round(viewCenterX - display.width / 2),
    y: Math.round(viewCenterY - display.height / 2),
    width: display.width,
    height: display.height,
    resultWidth,
    resultHeight,
  };
}

export async function mediaData(url: string, kind: 'image' | 'video' | 'audio', signal: AbortSignal) {
  const response = await fetch(proxyMediaUrl(url, { asVideo: kind === 'video', asAudio: kind === 'audio' }), { signal });
  if (!response.ok) throw new Error('无法读取已连接的参考图');
  const blob = await response.blob();
  const supported = {
    image: ['image/png', 'image/jpeg', 'image/webp'],
    video: ['video/mp4', 'video/webm', 'video/quicktime'],
    audio: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
  };
  if (blob.size > 6 * 1024 * 1024 || !supported[kind].includes(blob.type)) {
    throw new Error('参考素材格式不支持或超过 6 MB');
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取参考图失败'));
    reader.readAsDataURL(blob);
  });
}

export function calculateDisplayResolution(node: CanvasNode) {
  if (node.type === 'drawing') {
    if ((node.imageUrl || node.videoUrl) && node.resultWidth && node.resultHeight) {
      return `${node.resultWidth} × ${node.resultHeight}`;
    }
    if (node.status === 'generating' && node.generationSize) {
      return node.generationSize.replace(/[x*]/, ' × ');
    }
    return (node.drawing?.aspect || (node.generationKind === 'video' ? '16:9' : '1:1')).replace(':', ' : ');
  }
  if (node.resultWidth && node.resultHeight) return `${node.resultWidth} × ${node.resultHeight}`;
  return '';
}

const LIGHT_DIR_MAP: Record<string, string> = {
  left: '左侧',
  top: '顶部',
  right: '右侧',
  front: '前方',
  bottom: '底部',
  back: '后方',
};

const ANGLE_PRESET_MAP: Record<string, string> = {
  custom: '自定义',
  fisheye: '鱼眼视角',
  tilted: '倾斜视角',
  'front-high': '正面俯拍',
  'front-low': '正面仰拍',
  'pano-high': '全景俯拍',
  back: '背面视角',
};

function derivedPlacement(source: CanvasNode, options: { model?: string; quality?: string; aspectRatio?: string }) {
  const quality =
    options.quality === '1K' || options.quality === 'low'
      ? 'low'
      : options.quality === '4K' || options.quality === 'high'
        ? 'high'
        : 'medium';
  return {
    type: 'drawing' as const,
    generationKind: 'image' as const,
    drawing: {
      model: options.model || '',
      quality,
      aspect: options.aspectRatio || 'smart',
      count: 1,
      references: source.imageUrl ? [source.imageUrl] : [],
    },
    x: source.x + source.width + 48,
    y: source.y,
    width: source.width,
    height: source.height,
    referenceImageUrl: source.imageUrl,
  };
}

export function buildLightingDerivedNode(
  source: CanvasNode,
  params: LightingParams,
  options?: { model?: string; quality?: string; aspectRatio?: string },
) {
  const selectedModel = options?.model || params.model;
  const dirName = LIGHT_DIR_MAP[params.mainLight] || params.mainLight;
  const lightDesc = `主光:${dirName}, 光源位置:(${params.lightCoords.x}%, ${params.lightCoords.y}%), 亮度:${params.brightness}%, 光色:${params.color === 'original' ? '白光' : params.color}, 轮廓光:${params.rimLight ? '开启' : '关闭'}, 智能光照:${params.smartMode ? '开启' : '关闭'}`;
  return {
    ...derivedPlacement(source, { ...params, ...options }),
    title: `${source.title || (source.type === 'video' ? '视频素材' : '图片素材')} (打光)`,
    content: `以 @图片1 为参考，保持主体身份、形状、材质与构图，重新生成指定光照的图片。${lightDesc}。光源坐标以${params.viewMode === 'front' ? '正面' : '透视'}视图为准，真实呈现光影和反射。`,
    model: selectedModel,
  };
}

export function buildMultiAngleDerivedNode(
  source: CanvasNode,
  params: MultiAngleParams,
  options?: { model?: string; quality?: string; aspectRatio?: string },
) {
  const selectedModel = options?.model || params.model;
  const angleLabel = ANGLE_PRESET_MAP[params.preset] || '多角度';
  const angleDesc = `视角:${angleLabel}, 水平环绕:${params.azimuth}°, 垂直俯仰:${params.elevation}°, 景别:${params.shotScale}${params.promptEnabled && params.prompt ? `, 补充要求:${params.prompt}` : ''}`;
  return {
    ...derivedPlacement(source, { ...params, ...options }),
    title: `${source.title || (source.type === 'video' ? '视频素材' : '图片素材')} (${angleLabel})`,
    content: `以 @图片1 为参考，保持主体身份、形状与材质，生成同一主体的新镜头角度。${angleDesc}。0° 水平角为正面，180° 为背面；正俯仰为俯视，负俯仰为仰视。`,
    model: selectedModel,
  };
}

export const CANVAS_LOCAL_TOOLS = {
  'video-input': { title: '视频抽帧', width: 360, height: 400 },
  'shot-breakdown': { title: '逐帧拉片', width: 400, height: 560 },
  'image-tile': { title: '图片平铺', width: 360, height: 280 },
  'table-editor-node': { title: '表格编辑', width: 480, height: 340 },
} satisfies Record<CanvasLocalTool, { title: string; width: number; height: number }>;

export function isCanvasLocalTool(type: string): type is CanvasLocalTool {
  return Object.hasOwn(CANVAS_LOCAL_TOOLS, type);
}

export const CANVAS_PRIORITY_TOOLS = {
  'rh-app': { title: 'RH 应用', width: 340, height: 420 },
  'rh-comfy': { title: 'RH ComfyUI', width: 340, height: 420 },
  'gen-3d': { title: '3D', width: 375, height: 250 },
  'director-3d': { title: '3D导演台', width: 260, height: 260 },
  'global-perspective': { title: '全局视角', width: 440, height: 400 },
  'jimeng-super-resolution': { title: '智能超清', width: 250, height: 250 },
  'motion-control': { title: '动作迁移', width: 250, height: 250 },
  'script-parse': { title: '脚本解析', width: 380, height: 280 },
  'video-analyze': { title: '视频拆解', width: 400, height: 500 },
} satisfies Record<CanvasPriorityTool, { title: string; width: number; height: number }>;

export function isCanvasPriorityTool(type: string): type is CanvasPriorityTool {
  return Object.hasOwn(CANVAS_PRIORITY_TOOLS, type);
}

export function copyCanvasSpecialized(settings?: CanvasSpecializedSettings, ids?: ReadonlyMap<string, string>) {
  if (!settings) return undefined;
  return {
    ...settings,
    operation: undefined,
    taskId: undefined,
    taskStatus: settings.taskStatus === 'done' ? settings.taskStatus : undefined,
    fields: settings.fields?.map((field) => ({
      ...field,
      sourceId: field.sourceId ? ids?.get(field.sourceId) || field.sourceId : undefined,
    })),
  };
}

export function buildQuickCanvasNode(
  kind: CanvasQuickNodeType,
  position: { x: number; y: number },
  options?: {
    id?: string;
    referenceNodeIds?: string[];
    sourceImageUrl?: string;
    sourceVideoUrl?: string;
  },
): Omit<CanvasNode, 'id' | 'createdAt'> & { id: string; createdAt: number } {
  const id = options?.id || crypto.randomUUID();
  const now = Date.now();
  const refs = options?.referenceNodeIds?.length ? options.referenceNodeIds : undefined;

  let type: CanvasNode['type'] = 'drawing';
  let studioSubType: CanvasNode['studioSubType'] = undefined;
  let generationKind: CanvasNode['generationKind'] = undefined;
  let dimensions = { width: 250, height: 250 };
  let title = '新建节点';
  let content: string | undefined = undefined;
  let textPrompt: string | undefined = undefined;
  let drawing: CanvasNode['drawing'] = undefined;
  let specialized: CanvasNode['specialized'];
  let storyboardShots: CanvasNode['storyboardShots'] = undefined;

  switch (kind) {
    case 'rh-app':
    case 'rh-comfy':
    case 'gen-3d':
    case 'director-3d':
    case 'smart-build':
    case 'script-parse':
    case 'global-perspective':
    case 'jimeng-super-resolution':
    case 'motion-control':
    case 'video-analyze':
      studioSubType = kind === 'smart-build' ? 'director-3d' : kind;
      type = kind === 'video-analyze' || kind === 'script-parse' ? 'prompt' : kind === 'motion-control' ? 'drawing' : 'note';
      if (kind === 'motion-control') {
        generationKind = 'video';
        drawing = {
          model: '',
          quality: '720P',
          aspect: '1:1',
          count: 1,
          references: [],
          refMode: 'motion_control',
          audio: true,
          optimizePrompt: false,
        };
      }
      ({ title, ...dimensions } = CANVAS_PRIORITY_TOOLS[studioSubType]);
      if (kind === 'smart-build') {
        title = '智能搭建';
        specialized = { smartBuild: true };
      }
      break;
    case 'video-input':
    case 'shot-breakdown':
    case 'image-tile':
    case 'table-editor-node':
      type = 'note';
      studioSubType = kind;
      ({ title, ...dimensions } = CANVAS_LOCAL_TOOLS[kind]);
      break;
    case 'file':
      type = 'file';
      dimensions = { width: 250, height: 250 };
      title = '上传参考素材';
      break;
    case 'prompt':
      type = 'prompt';
      dimensions = { width: 250, height: 250 };
      title = '文本';
      break;
    case 'video-prompt-optimizer':
      type = 'prompt';
      studioSubType = 'video-prompt-optimizer';
      dimensions = { width: 300, height: 260 };
      title = '提示词 Skill';
      textPrompt = '';
      drawing = {
        model: 'wan3.0-video',
        quality: '720P',
        aspect: '16:9',
        count: 1,
        duration: 5,
        refMode: 'omni',
        audio: true,
        references: [],
      };
      break;
    case 'image-generation':
      type = 'drawing';
      generationKind = 'image';
      dimensions = { width: 250, height: 250 };
      title = '图片生成';
      drawing = {
        model: '',
        quality: 'medium',
        aspect: '1:1',
        count: 1,
        references: [],
      };
      break;
    case 'video-generation':
      type = 'drawing';
      generationKind = 'video';
      dimensions = { width: 444, height: 250 };
      title = '视频生成';
      drawing = {
        model: '',
        quality: '768P',
        aspect: '16:9',
        count: 1,
        duration: 5,
        references: [],
        optimizePrompt: false,
      };
      break;
    case 'audio':
      type = 'audio';
      dimensions = { width: 444, height: 250 };
      title = '音频';
      break;
    case 'storyboard-node':
      type = 'prompt';
      studioSubType = 'storyboard-node';
      dimensions = { width: 600, height: 500 };
      title = '分镜视表';
      content = '';
      storyboardShots = [];
      break;
    case 'storyboard-chart-node':
      type = 'prompt';
      studioSubType = 'storyboard-chart-node';
      dimensions = { width: 540, height: 480 };
      title = '分镜图表';
      break;
    case 'video-timeline':
      type = 'drawing';
      studioSubType = 'video-timeline';
      generationKind = 'video';
      dimensions = { width: 700, height: 220 };
      title = '视频多轨剪辑';
      break;
    case 'doodle-canvas':
      type = 'drawing';
      studioSubType = 'doodle-canvas';
      generationKind = 'image';
      dimensions = { width: 700, height: 300 };
      title = '涂鸦手绘板';
      break;
    case 'compare':
      type = 'compare';
      dimensions = { width: 320, height: 240 };
      title = '对比';
      break;
    case 'preview':
      type = 'preview';
      dimensions = { width: 400, height: 420 };
      title = '导演监视器';
      break;
    case 'save':
      type = 'save';
      dimensions = { width: 320, height: 380 };
      title = '批量导出保存';
      break;
  }

  return {
    id,
    type,
    studioSubType,
    specialized,
    generationKind,
    title,
    content,
    textPrompt,
    drawing,
    storyboardShots,
    referenceNodeIds: refs,
    referenceImageUrl: options?.sourceImageUrl,
    x: Math.round(position.x - dimensions.width / 2),
    y: Math.round(position.y - dimensions.height / 2),
    width: dimensions.width,
    height: dimensions.height,
    createdAt: now,
  };
}
