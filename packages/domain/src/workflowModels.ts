/**
 * 工作流模型：设置页 custom_models 为各功能选择器的唯一真相源。
 * 仅用 IMAGE_GEN_MODELS / VIDEO_GEN_MODELS 补齐展示元数据，不自动注入未启用的内置模型。
 */

import { IMAGE_GEN_MODELS } from '@beike/domain/drawing';
import { VIDEO_GEN_MODELS } from '@beike/domain/video';
import {
  DEFAULT_MULTIMODAL_MODEL_ID,
  getApprovedModel,
  isApprovedModel,
} from '@beike/domain/modelCatalog';
import { domainStorage } from './runtime';

export type WorkflowCapability = {
  id: string;
  /** Upstream model ID stays bare; routeId distinguishes equal IDs on separate gateways. */
  routeId?: string;
  channel?: 'comfly' | 'openai' | 'lianchi';
  name?: string;
  shortName?: string;
  provider?: string;
  badge?: string;
  desc?: string;
  description?: string;
  isMultimodal?: boolean;
  isImage?: boolean;
  isVideo?: boolean;
  isVision?: boolean;
  isAssistant?: boolean;
  isDistill?: boolean;
  isThinking?: boolean;
  isCustom?: boolean;
};

export const OPENAI_MODEL_ROUTE_PREFIX = 'openai-responses:';

export function openAIModelRouteId(modelId: string): string {
  return `${OPENAI_MODEL_ROUTE_PREFIX}${modelId}`;
}

export function isOpenAIModelRouteId(routeId: string): boolean {
  return routeId.startsWith(OPENAI_MODEL_ROUTE_PREFIX);
}

export function upstreamModelId(routeId: string): string {
  return isOpenAIModelRouteId(routeId) ? routeId.slice(OPENAI_MODEL_ROUTE_PREFIX.length) : routeId;
}

export function workflowModelRouteId(model: Pick<WorkflowCapability, 'id' | 'routeId' | 'channel'>): string {
  return model.routeId || (model.channel === 'openai' ? openAIModelRouteId(model.id) : model.id);
}

export type InferredWorkflowCapabilities = {
  isImage: boolean;
  isVideo: boolean;
  isMultimodal: boolean;
  isVision: boolean;
  isAssistant: boolean;
  isThinking: boolean;
  isEmbedding: boolean;
  isAudio: boolean;
};

export function isKnownImageOnlyModel(id: string): boolean {
  return getApprovedModel(id)?.capability === 'image';
}

export function isKnownVideoOnlyModel(id: string): boolean {
  return getApprovedModel(id)?.capability === 'video';
}

/** 根据模型 ID 推断能力标签（网关拉取 / 接入 / 修复 localStorage 共用） */
export function inferWorkflowCapabilitiesFromId(id: string): InferredWorkflowCapabilities {
  const approved = getApprovedModel(id);
  if (approved) {
    const isImage = approved.capability === 'image';
    const isVideo = approved.capability === 'video';
    const isMultimodal = approved.capability === 'multimodal';
    return {
      isImage,
      isVideo,
      isMultimodal,
      isVision: isMultimodal,
      isAssistant: isMultimodal,
      isThinking: Boolean(approved.isThinking),
      isEmbedding: false,
      isAudio: false,
    };
  }

  const lower = id.toLowerCase();

  const isEmbedding =
    lower.includes('embedding') ||
    lower.includes('embed') ||
    lower.includes('bge') ||
    lower.includes('rerank') ||
    lower.includes('baai') ||
    lower.includes('text-search') ||
    lower.includes('similarity');

  const isAudio =
    !isEmbedding &&
    (lower.includes('audio') ||
      lower.includes('tts') ||
      lower.includes('whisper') ||
      lower.includes('suno') ||
      lower.includes('speech') ||
      lower.includes('voice') ||
      lower.includes('music') ||
      lower.includes('sound') ||
      lower.includes('elevenlabs'));

  const isVideo =
    !isEmbedding &&
    !isAudio &&
    (lower.includes('video') ||
      lower.includes('seedance') ||
      lower.includes('veo') ||
      lower.includes('kling') ||
      lower.includes('sora') ||
      lower.includes('vidu') ||
      lower.includes('minimax') ||
      isKnownVideoOnlyModel(id));

  const isImage =
    !isEmbedding &&
    !isAudio &&
    !isVideo &&
    (lower.includes('image') ||
      lower.includes('flux') ||
      lower.includes('seedream') ||
      lower.includes('midjourney') ||
      lower.includes('mjv') ||
      lower.includes('nano-banana') ||
      isKnownImageOnlyModel(id));

  const isThinking =
    lower.includes('thinking') ||
    lower.includes('reasoner') ||
    lower.includes('luna');

  const isMultimodal =
    !isEmbedding &&
    !isAudio &&
    !isVideo &&
    !isImage &&
    (lower.includes('vision') ||
      lower.includes('gemini') ||
      lower.includes('claude') ||
      /gpt-[45]/.test(lower) ||
      lower.includes('grok-4') ||
      lower.includes('qwen3') ||
      lower.includes('deepseek') ||
      lower.includes('kimi'));

  return {
    isImage,
    isVideo,
    isMultimodal,
    isVision: isMultimodal,
    isAssistant: isMultimodal,
    isThinking,
    isEmbedding,
    isAudio,
  };
}

/** 规范化 custom_models 单条：生图/生视频模型强制剥离多模态标签 */
export function normalizeWorkflowModel(m: WorkflowCapability): WorkflowCapability {
  const inferred = inferWorkflowCapabilitiesFromId(m.id);
  const isImage = !!(m.isImage || inferred.isImage);
  const isVideo = !!(m.isVideo || inferred.isVideo);

  if (isImage || isVideo) {
    return {
      ...m,
      isImage,
      isVideo,
      isMultimodal: false,
      isVision: false,
      isAssistant: false,
    };
  }

  const isMultimodal = !!(m.isMultimodal || m.isVision || m.isAssistant || inferred.isMultimodal);
  return {
    ...m,
    isImage: false,
    isVideo: false,
    isMultimodal,
    isVision: isMultimodal,
    isAssistant: m.isAssistant ?? isMultimodal,
    isThinking: m.isThinking ?? inferred.isThinking,
  };
}

/** 生图 model id 别名 → canonical id（localStorage 与上游提交共用） */
export const IMAGE_MODEL_ID_ALIASES: Record<string, string> = {
  'image2-4k': 'gpt-image-2-4k',
};

/** 折叠重复 -4k / -2k 后缀 */
function collapseRepeatedResolutionSuffix(id: string): string {
  let next = id.trim();
  if (!next) return next;
  for (let i = 0; i < 2; i += 1) {
    const collapsed = next.replace(/(-4k)+$/i, '-4k').replace(/(-2k)+$/i, '-2k');
    if (collapsed === next) break;
    next = collapsed;
  }
  return next;
}

/** 修复 custom_models 条目中的畸形 / 别名 model id */
export function repairWorkflowModelId(id: string): string {
  const collapsed = collapseRepeatedResolutionSuffix(id);
  return IMAGE_MODEL_ID_ALIASES[collapsed.toLowerCase()] || collapsed;
}

/** 启动时修复 localStorage 中误标的能力标签（无需用户重新添加模型） */
export function repairWorkflowModelsInStorage(): WorkflowCapability[] {
  const raw = readWorkflowModelsFromStorage();
  if (raw.length === 0) return raw;

  const storage = domainStorage();
  const migrateLegacyOpenAI = storage?.getItem('openai_responses_enabled') === 'true'
    && storage.getItem('openai_channel_split_v1') !== 'true';
  const legacySelectedIds = new Set(
    ['ai_multimodal_model', 'ai_vision_model']
      .map(key => storage?.getItem(key))
      .filter((id): id is string => Boolean(id))
  );
  const legacyOpenAIModels = migrateLegacyOpenAI
    ? raw.filter(item => legacySelectedIds.has(item.id)
        && /^gpt-(?:5\.6|6)(?:-|$)/i.test(item.id)
        && isApprovedModel(item.id, 'multimodal'))
      .map(item => ({ ...item, channel: 'openai' as const, routeId: openAIModelRouteId(item.id) }))
    : [];
  const source = [...raw, ...legacyOpenAIModels];

  const seen = new Set<string>();
  const repaired: WorkflowCapability[] = [];

  for (const item of source) {
    const canonicalId = repairWorkflowModelId(item.id);
    if (!isApprovedModel(canonicalId)) continue;
    const routeId = item.channel === 'openai' || isOpenAIModelRouteId(item.routeId || '')
      ? openAIModelRouteId(canonicalId) : canonicalId;
    if (seen.has(routeId.toLowerCase())) continue;
    seen.add(routeId.toLowerCase());

    const builtin = IMAGE_GEN_MODELS.find((m) => m.id === canonicalId);
    repaired.push(
      normalizeWorkflowModel({
        ...item,
        id: canonicalId,
        routeId: routeId === canonicalId ? undefined : routeId,
        channel: routeId === canonicalId ? (item.channel || (canonicalId === 'openai/gpt-image-2' ? 'lianchi' : 'comfly')) : 'openai',
        isAssistant: routeId === canonicalId ? item.isAssistant : false,
        name: item.id !== canonicalId ? (builtin?.name || item.name || canonicalId) : (item.name || builtin?.name || canonicalId),
        shortName: item.id !== canonicalId ? (builtin?.shortName || item.shortName || canonicalId) : (item.shortName || builtin?.shortName || canonicalId),
        badge: item.badge || builtin?.badge,
        desc: item.desc || item.description || builtin?.description,
        description: item.description || item.desc || builtin?.description,
      })
    );
  }

  const changed = JSON.stringify(raw) !== JSON.stringify(repaired);
  let persisted = true;
  if (changed) {
    try {
      storage?.setItem('custom_models', JSON.stringify(repaired));
    } catch {
      persisted = false;
    }
  }
  if (migrateLegacyOpenAI && storage && persisted) {
    try {
      for (const key of ['ai_multimodal_model', 'ai_vision_model']) {
        const selected = storage.getItem(key);
        if (selected && legacyOpenAIModels.some(model => model.id === selected)) {
          storage.setItem(key, openAIModelRouteId(selected));
        }
      }
      storage.setItem('openai_channel_split_v1', 'true');
    } catch {
      /* Keep the migration retryable if storage rejects the marker. */
    }
  }
  return repaired;
}

/** 设置页 WorkflowModel 列表（保证 name/shortName/isImage 等必填字段） */
export function repairWorkflowModelsForSettings() {
  return repairWorkflowModelsInStorage().map((m) => {
    const caps = inferWorkflowCapabilitiesFromId(m.id);
    return {
      id: m.id,
      routeId: m.routeId,
      channel: m.channel,
      name: m.name || m.id,
      shortName: m.shortName || m.id.split(/[-_]/)[0] || m.id,
      badge: m.badge,
      desc: m.desc || m.description,
      isMultimodal: m.isMultimodal ?? caps.isMultimodal,
      isImage: m.isImage ?? caps.isImage,
      isVideo: m.isVideo ?? caps.isVideo,
      isVision: m.isVision ?? caps.isVision,
      isAssistant: m.isAssistant ?? caps.isAssistant,
      isDistill: m.isDistill,
      isThinking: m.isThinking ?? caps.isThinking,
      isCustom: m.isCustom ?? true,
    };
  });
}

export function readWorkflowModelsFromStorage(): WorkflowCapability[] {
  try {
    const raw = domainStorage()?.getItem('custom_models');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function providerGuess(id: string, fallback?: string): string {
  if (fallback) return fallback;
  const m = id.toLowerCase();
  if (m.includes('gpt') || m.includes('sora') || m.includes('dall') || m.includes('o1') || m.includes('o3') || m.includes('o4') || m.includes('image2')) return 'OpenAI';
  if (m.includes('gemini') || m.includes('veo') || m.includes('omni_flash') || m.includes('omni-flash') || m.includes('imagen') || m.includes('nano-banana') || m.includes('nanobanana') || m.includes('banana') || m.includes('gemma')) return 'Google';
  if (m.includes('claude')) return 'Anthropic';
  if (m.includes('seedream') || m.includes('seedance') || m.includes('seededit') || m.includes('doubao') || m.includes('jimeng') || m.includes('bytedance')) return 'Bytedance';
  if (m.includes('flux')) return 'Black Forest Labs';
  if (m.includes('midjourney') || m.includes('mj')) return 'Midjourney';
  if (m.includes('kling') || m.includes('kolors') || m.includes('t2v')) return 'Kuaishou';
  if (m.includes('qwen') || m.includes('wanx') || m.includes('wan')) return 'Alibaba';
  if (m.includes('minimax') || m.includes('hailuo')) return 'MiniMax';
  if (m.includes('grok')) return 'xAI';
  if (m.includes('deepseek')) return 'DeepSeek';
  if (m.includes('runway')) return 'Runway';
  if (m.includes('luma')) return 'Luma';
  if (m.includes('vidu')) return 'Shengshu';
  if (m.includes('recraft')) return 'Recraft';
  if (m.includes('glm') || m.includes('cogview') || m.includes('zhipu')) return 'Zhipu AI';
  if (m.includes('kimi') || m.includes('moonshot')) return 'Moonshot';
  return 'Gateway';
}

/** 判断 custom_models 条目是否属于多模态工作流 */
export function isMultimodalWorkflowModel(m: WorkflowCapability): boolean {
  const normalized = normalizeWorkflowModel(m);
  return !!(normalized.isMultimodal || normalized.isVision || normalized.isAssistant);
}

/** 读取全局默认多模态模型（设置 / 助手 / 提示词工作室共用） */
export function getStoredMultimodalModelId(
  fallback = DEFAULT_MULTIMODAL_MODEL_ID
): string {
  const storage = domainStorage();
  if (!storage) return fallback;
  return (
    storage.getItem('ai_multimodal_model') ||
    storage.getItem('ai_vision_model') ||
    storage.getItem('ai_assistant_model') ||
    fallback
  );
}

/** 写入全局默认多模态模型，同步全部 legacy key */
export function setStoredMultimodalModelId(id: string): void {
  const storage = domainStorage();
  if (!storage) return;
  try {
    storage.setItem('ai_multimodal_model', id);
    storage.setItem('ai_vision_model', id);
    if (!isOpenAIModelRouteId(id)) storage.setItem('ai_assistant_model', id);
  } catch {
    /* ignore quota errors */
  }
}

/** 若当前存储的是生图/无效模型，自动回退到首个可用多模态模型 */
export function resolveStoredMultimodalModelId(
  enabledModels?: WorkflowCapability[],
  fallback = DEFAULT_MULTIMODAL_MODEL_ID
): string {
  const list = enabledModels ?? getEnabledMultimodalModelsFromSettings();
  const stored = getStoredMultimodalModelId(fallback);
  if (list.some((m) => m.id === stored)) return stored;
  if (list.length > 0) {
    setStoredMultimodalModelId(list[0].id);
    return list[0].id;
  }
  return stored;
}

/** 网关模型条目 → 工作区 WorkflowModel */
export function gatewayModelToWorkflowModel(model: {
  id: string;
  name?: string;
  shortName?: string;
  isVision?: boolean;
  isImage?: boolean;
  isVideo?: boolean;
  isMultimodal?: boolean;
  isThinking?: boolean;
  category?: string;
}, channel: WorkflowCapability['channel'] = 'comfly'): WorkflowCapability {
  return normalizeWorkflowModel({
    id: model.id,
    routeId: channel === 'openai' ? openAIModelRouteId(model.id) : undefined,
    channel,
    name: model.name || model.id,
    shortName: model.shortName || model.id.split(/[-_]/)[0] || model.name || model.id,
    isVision: model.isVision,
    isImage: model.isImage,
    isVideo: model.isVideo || model.category === 'video',
    isMultimodal: model.isMultimodal,
    isAssistant: channel === 'openai' ? false : undefined,
    isThinking: model.isThinking,
    isCustom: false,
  });
}

/** 设置中勾选「生图」的模型 → Hub / 生图工作室列表 */
export function getEnabledImageModelsFromSettings(
  models?: WorkflowCapability[]
): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  const list = (models ?? repairWorkflowModelsInStorage()).map((m) =>
    normalizeWorkflowModel({
      ...m,
      id: repairWorkflowModelId(m.id),
    })
  );
  return list
    .filter((m) => m.isImage && isApprovedModel(m.id, 'image'))
    .filter((m) => {
      const key = m.id.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((m) => {
      const builtin = IMAGE_GEN_MODELS.find((x) => x.id === m.id);
      return {
        id: m.id,
        name: builtin?.shortName || builtin?.name || m.name || m.id,
        shortName: builtin?.shortName || m.shortName || builtin?.name || m.name || m.id,
        provider: providerGuess(m.id, builtin?.provider),
        badge: m.badge || builtin?.badge,
        description: m.desc || m.description || builtin?.description,
        modelId: m.id,
        isPrimary: builtin?.isPrimary || false,
        supportedQualities: builtin?.supportedQualities || ['high', 'medium', 'low'],
        defaultSize: builtin?.defaultSize || '2448x3264',
        supportEdits: builtin?.supportEdits ?? true,
      };
    });
}

/** 设置中勾选「视频」的模型 → Hub 视频列表 */
export function getEnabledVideoModelsFromSettings(
  models?: WorkflowCapability[]
): Array<Record<string, unknown>> {
  const list = (models ?? repairWorkflowModelsInStorage()).map(normalizeWorkflowModel);
  return list
    .filter((m) => m.isVideo && isApprovedModel(m.id, 'video'))
    .map((m) => {
      const builtin = VIDEO_GEN_MODELS.find((x) => x.id === m.id);
      return {
        id: m.id,
        name: builtin?.shortName || builtin?.name || m.name || m.id,
        shortName: builtin?.shortName || m.shortName || builtin?.name || m.name || m.id,
        provider: providerGuess(m.id, builtin?.provider),
        badge: m.badge || builtin?.badge,
        description: m.desc || m.description || builtin?.description || '',
        isPrimary: builtin?.isPrimary || false,
        supportedDurations: builtin?.supportedDurations || [4, 5, 8, 10],
        supportedResolutions: builtin?.supportedResolutions || ['720P', '1080P'],
        supportedAspectRatios: builtin?.supportedAspectRatios || ['16:9', '9:16', '1:1'],
      };
    });
}

/** 设置中勾选「多模态」的模型 → 助手 / 提示词工作室 */
export function getEnabledMultimodalModelsFromSettings(
  models?: WorkflowCapability[]
): WorkflowCapability[] {
  const list = models ?? repairWorkflowModelsInStorage();
  return sortModelsByMultimodalPriority(
    list.filter((m) => isMultimodalWorkflowModel(m) && isApprovedModel(m.id, 'multimodal'))
      .map((m) => ({ ...m, id: workflowModelRouteId(m),
        name: `${m.name || m.id} · ${m.channel === 'openai' ? 'OpenAI 渠道' : 'Comfly 渠道'}`,
        shortName: `${m.shortName || m.id} · ${m.channel === 'openai' ? 'OpenAI' : 'Comfly'}`,
        provider: m.channel === 'openai' ? 'OpenAI 渠道' : 'Comfly 渠道',
      })),
  );
}

/** Keep Model Management's stored order; it is the declared fallback priority. */
export function sortModelsByMultimodalPriority<T extends { id: string }>(models: readonly T[]): T[] { return [...models]; }

/** 返回设置页顺序中的备用模型，主模型本身不会重复传入。 */
export function pickOrderedMultimodalFallbacks(
  selectedId: string,
  orderedIds: string[],
  max = Number.MAX_SAFE_INTEGER,
): string[] {
  const primary = String(selectedId || '').trim().toLowerCase();
  const seen = new Set<string>();
  return orderedIds
    .map((id) => String(id || '').trim())
    .filter((id) => {
      const key = id.toLowerCase();
      if (!key || key === primary || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, Math.max(0, max));
}
