/**
 * 工作流模型：设置页 custom_models 为各功能选择器的唯一真相源。
 * 仅用 IMAGE_GEN_MODELS / VIDEO_GEN_MODELS 补齐展示元数据，不自动注入未启用的内置模型。
 */

import { IMAGE_GEN_MODELS } from '@shared/domain/media/drawing';
import { VIDEO_GEN_MODELS } from '@shared/domain/media/video';
import {
  DEFAULT_MULTIMODAL_MODEL_ID,
  isApprovedModel,
  getApprovedModel,
} from '@shared/domain/models/modelCatalog';
import { deepSeekModel, deepSeekRouteId, isDeepSeekRoute, deepSeekModelId } from './deepseek';
import { domainStorage } from '../core/runtime';
import { inferWorkflowCapabilitiesFromId, isKnownImageOnlyModel, isKnownVideoOnlyModel } from './workflowCapabilities';
import { parseWorkflowModelList, isValidWorkflowModelList } from './workflowModelStorage';
export { inferWorkflowCapabilitiesFromId, isKnownImageOnlyModel, isKnownVideoOnlyModel } from './workflowCapabilities';
export type { InferredWorkflowCapabilities } from './workflowCapabilities';

import type { WorkflowCapability } from './workflowModelTypes';
export type { WorkflowCapability } from './workflowModelTypes';

export const OPENAI_MODEL_ROUTE_PREFIX = 'openai-responses:';

export function openAIModelRouteId(modelId: string): string {
  return `${OPENAI_MODEL_ROUTE_PREFIX}${modelId}`;
}

export function isOpenAIModelRouteId(routeId: string): boolean {
  return routeId.startsWith(OPENAI_MODEL_ROUTE_PREFIX);
}

export function upstreamModelId(routeId: string): string {
  if (isDeepSeekRoute(routeId)) return deepSeekModelId(routeId);
  return isOpenAIModelRouteId(routeId) ? routeId.slice(OPENAI_MODEL_ROUTE_PREFIX.length) : routeId;
}

/** Keep official channel identity until the server's Chat Completions adapter. */
export function requestModelId(routeId: string): string {
  return isDeepSeekRoute(routeId) ? routeId : upstreamModelId(routeId);
}

export function workflowModelRouteId(model: Pick<WorkflowCapability, 'id' | 'routeId' | 'channel'>): string {
  return model.routeId || (model.channel === 'deepseek' ? deepSeekRouteId(model.id) : model.channel === 'openai' ? openAIModelRouteId(model.id) : model.id);
}

/** 规范化 custom_models 单条：生图/生视频模型强制剥离多模态标签 */
export function normalizeWorkflowModel(m: WorkflowCapability): WorkflowCapability {
  if (m.channel === 'deepseek' || isDeepSeekRoute(m.id)) {
    const official = deepSeekModel(m.id);
    const isVision = Boolean(official?.vision && (m.isVision ?? m.isMultimodal ?? true));
    return { ...m, isImage: false, isVideo: false, isMultimodal: isVision, isVision,
      isAssistant: Boolean(official && (m.isAssistant ?? true)), isThinking: m.isThinking ?? true };
  }
  const inferred = inferWorkflowCapabilitiesFromId(m.id);
  const isImage = Boolean(m.isImage ?? inferred.isImage);
  const isVideo = Boolean(m.isVideo ?? inferred.isVideo);
  const generationOnly = isKnownImageOnlyModel(m.id) || isKnownVideoOnlyModel(m.id);
  const isMultimodal = !generationOnly && !isImage && !isVideo
    && Boolean(m.isMultimodal ?? m.isVision ?? (m.channel === 'openai' ? inferred.isMultimodal : m.isAssistant ?? inferred.isMultimodal));
  return { ...m, isImage, isVideo, isMultimodal, isVision: isMultimodal,
    isAssistant: isMultimodal && (m.isAssistant ?? true),
    isThinking: !generationOnly && !isImage && !isVideo && Boolean(m.isThinking ?? inferred.isThinking) };
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
  const aliased = IMAGE_MODEL_ID_ALIASES[collapsed.toLowerCase()] || collapsed;
  return aliased.includes('/') || aliased.includes(':') ? aliased : getApprovedModel(aliased)?.id || aliased;
}

/** Normalize and deduplicate routes, preserving the first saved enabled state and stored order. */
export function repairWorkflowModelList(value: unknown): WorkflowCapability[] {
  const seen = new Set<string>();
  const repaired: WorkflowCapability[] = [];

  for (const item of parseWorkflowModelList(value)) {
    const canonicalId = repairWorkflowModelId(upstreamModelId(item.id));
    if (item.channel === 'deepseek' || isDeepSeekRoute(item.id) || isDeepSeekRoute(item.routeId || '')) {
      const routeId = deepSeekRouteId(deepSeekModelId(canonicalId));
      if (!deepSeekModel(canonicalId) || seen.has(routeId)) continue;
      seen.add(routeId);
      repaired.push(normalizeWorkflowModel({ ...item, id: deepSeekModelId(canonicalId), routeId, channel: 'deepseek' }));
      continue;
    }
    if (!isApprovedModel(canonicalId)) {
      const keepCustom = item.isCustom === true && (item.isImage === true || item.isVideo === true || item.isMultimodal === true || item.isVision === true);
      const customKey = canonicalId.toLowerCase();
      if (!keepCustom || seen.has(customKey)) continue;
      seen.add(customKey);
      repaired.push(normalizeWorkflowModel({ ...item, id: canonicalId, routeId: undefined, channel: item.channel || 'comfly', enabled: item.enabled !== false, isCustom: true, name: item.name || canonicalId, shortName: item.shortName || item.name || canonicalId }));
      continue;
    }
    const routeId = item.channel === 'openai' || isOpenAIModelRouteId(item.id) || isOpenAIModelRouteId(item.routeId || '')
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
        name: item.name && item.name !== item.id ? item.name : builtin?.name || item.name || canonicalId,
        shortName: item.shortName && item.shortName !== item.id ? item.shortName : builtin?.shortName || item.shortName || canonicalId,
        badge: item.badge || builtin?.badge,
        desc: item.desc || item.description || builtin?.description,
        description: item.description || item.desc || builtin?.description,
      })
    );
  }

  return repaired;
}

/** 启动时修复 localStorage 中误标的能力标签（无需用户重新添加模型） */
export function repairWorkflowModelsInStorage(): WorkflowCapability[] {
  const raw = readWorkflowModelsFromStorage();
  if (raw.length === 0) return raw;

  const storage = domainStorage();
  try {
    const saved = storage?.getItem('custom_models');
    if (saved && !isValidWorkflowModelList(JSON.parse(saved))) return repairWorkflowModelList(raw);
  } catch { return repairWorkflowModelList(raw); }
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

  const repaired = repairWorkflowModelList(source);

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
export function repairWorkflowModelsForSettings(value?: unknown) {
  return (value === undefined ? repairWorkflowModelsInStorage() : repairWorkflowModelList(value)).map((m) => {
    const caps = inferWorkflowCapabilitiesFromId(m.id);
    return {
      id: m.id,
      routeId: m.routeId,
      channel: m.channel,
      enabled: m.enabled,
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

/** An explicit empty list is a configured pool, not a request to restore built-ins. */
export function hasWorkflowModelConfiguration(): boolean {
  try {
    const raw = domainStorage()?.getItem('custom_models');
    return raw !== null && raw !== undefined;
  } catch { return false; }
}

export function readWorkflowModelsFromStorage(): WorkflowCapability[] {
  try {
    const raw = domainStorage()?.getItem('custom_models');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parseWorkflowModelList(parsed);
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
export function setStoredMultimodalModelId(id: string): boolean {
  const storage = domainStorage();
  if (!storage) return false;
  try {
    const keys = ['ai_multimodal_model', 'ai_vision_model', ...(id && !isOpenAIModelRouteId(id) ? ['ai_assistant_model'] : [])];
    const previous = keys.map(key => [key, storage.getItem(key)] as const);
    try {
      for (const key of keys) { if (id) storage.setItem(key, id); else storage.removeItem(key); }
    } catch (error) {
      for (const [key, value] of previous) { try { if (value === null) storage.removeItem(key); else storage.setItem(key, value); } catch {} }
      throw error;
    }
    return true;
  } catch {
    return false;
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
  setStoredMultimodalModelId('');
  return '';
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
  const caps = getApprovedModel(model.id) ? inferWorkflowCapabilitiesFromId(model.id) : undefined;
  return normalizeWorkflowModel({
    id: model.id,
    routeId: channel === 'deepseek' ? deepSeekRouteId(model.id) : channel === 'openai' ? openAIModelRouteId(model.id) : undefined,
    channel,
    name: model.name || model.id,
    shortName: model.shortName || model.id.split(/[-_]/)[0] || model.name || model.id,
    isVision: caps?.isVision ?? model.isVision,
    isImage: caps?.isImage ?? model.isImage,
    isVideo: caps?.isVideo ?? model.isVideo ?? (model.category === 'video' ? true : undefined),
    isMultimodal: caps?.isMultimodal ?? model.isMultimodal,
    isAssistant: channel === 'openai' ? false : undefined,
    isThinking: caps?.isThinking ?? model.isThinking,
    isCustom: false,
  });
}

/** 设置中勾选「生图」的模型 → Hub / 生图工作室列表 */
export function getEnabledImageModelsFromSettings(
  models?: WorkflowCapability[]
) {
  const seen = new Set<string>();
  const list = models === undefined ? repairWorkflowModelsInStorage() : repairWorkflowModelList(models);
  return list
    .filter((m) => m.enabled !== false && m.isImage && (isApprovedModel(m.id, 'image') || m.isCustom === true))
    .filter((m) => {
      const key = m.id.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((m) => {
      const builtin = IMAGE_GEN_MODELS.find((x) => x.id === getApprovedModel(m.id)?.id);
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
) {
  const list = models === undefined ? repairWorkflowModelsInStorage() : repairWorkflowModelList(models);
  return list
    .filter((m) => m.enabled !== false && m.isVideo && (isApprovedModel(m.id, 'video') || m.isCustom === true))
    .map((m) => {
      const builtin = VIDEO_GEN_MODELS.find((x) => x.id === getApprovedModel(m.id)?.id);
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
  models?: WorkflowCapability[],
  purpose: 'vision' | 'assistant' = 'vision',
): WorkflowCapability[] {
  const list = models === undefined ? repairWorkflowModelsInStorage() : repairWorkflowModelList(models);
  return sortModelsByMultimodalPriority(
    list.filter((m) => m.enabled !== false && (m.channel === 'deepseek'
      ? !!deepSeekModel(m.id) && (purpose === 'assistant' ? !!m.isAssistant : !!m.isVision)
      : isMultimodalWorkflowModel(m) && (isApprovedModel(m.id, 'multimodal') || m.isCustom === true)))
      .map((m) => ({ ...m, id: workflowModelRouteId(m),
        name: `${m.name || m.id} · ${m.channel === 'deepseek' ? 'DeepSeek 官方' : m.channel === 'openai' ? 'OpenAI 渠道' : 'Comfly 渠道'}`,
        shortName: `${m.shortName || m.id} · ${m.channel === 'deepseek' ? '官方' : m.channel === 'openai' ? 'OpenAI' : 'Comfly'}`,
        badge: m.channel === 'deepseek' && !deepSeekModel(m.id)?.vision ? '仅文本' : m.badge,
        provider: m.channel === 'deepseek' ? 'DeepSeek 官方' : m.channel === 'openai' ? 'OpenAI 渠道' : 'Comfly 渠道',
      })),
  );
}

/** Preserve stored order; display sorting must never change call configuration. */
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
