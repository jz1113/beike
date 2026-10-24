import { isDeepSeekRoute, deepSeekModel } from '../models/deepseek';
import {
  buildMultimodalUpstreamFallbackChain,
  listApprovedModels,
  vendorLabel,
  DEFAULT_MULTIMODAL_MODEL_ID,
  getApprovedModel,
  MULTIMODAL_UPSTREAM_FALLBACK_ORDER,
} from '@shared/domain/models/modelCatalog';
import { domainStorage } from '../core/runtime';
import { appendPhoneGenerationPolicy } from './visionPromptAssets';

export type { PreviousGroupSignature, AssetLibrarySlotData, LockedAssetSlots, VisionAnalyzeParams, ShotPrompt } from './visionTypes';
export { buildVisionSystemPrompt } from './visionSystemPrompt';

export function buildActionDigestFromShots(
  shots: Array<{ expression?: string; action?: string }>
): string {
  return shots
    .map((s) => [s.expression, s.action].filter(Boolean).join('/'))
    .filter(Boolean)
    .slice(0, 6)
    .join(' | ');
}

export interface CategoryItem {
  id: string;
  name: string;
  isCustom?: boolean;
}

export const DEFAULT_CATEGORIES: CategoryItem[] = [
  { id: 'digital_3c', name: '📱 手机数码 / 电脑办公' },
  { id: 'jewelry_luxury', name: '💎 珠宝首饰' },
  { id: 'general', name: '🌐 通用生活买家秀' }
];

export function getMergedCategories(): CategoryItem[] {
  const storage = domainStorage();
  if (!storage) return DEFAULT_CATEGORIES;
  const saved = storage.getItem('custom_categories');
  if (!saved) return DEFAULT_CATEGORIES;
  try {
    const custom: unknown = JSON.parse(saved);
    if (Array.isArray(custom)) {
      const merged = [...DEFAULT_CATEGORIES];
      const knownIds = new Set(merged.map(category => category.id));
      for (const category of custom) {
        if (!category || typeof category !== 'object') continue;
        const candidate = category as Partial<CategoryItem>;
        if (typeof candidate.id !== 'string' || !candidate.id.trim()
          || typeof candidate.name !== 'string' || !candidate.name.trim()
          || knownIds.has(candidate.id)) continue;
        merged.push(candidate as CategoryItem);
        knownIds.add(candidate.id);
      }
      return merged;
    }
  } catch {}
  return DEFAULT_CATEGORIES;
}

export function saveCategoriesList(list: CategoryItem[]): CategoryItem[] {
  const storage = domainStorage();
  if (!storage) return list;
  try {
    storage.setItem('custom_categories', JSON.stringify(list));
  } catch {}
  return list;
}

export function deleteCategoryItem(catId: string): CategoryItem[] {
  const current = getMergedCategories();
  const updated = current.filter(c => c.id !== catId);
  return saveCategoriesList(updated);
}

export function resetCategoriesToDefault(): CategoryItem[] {
  return saveCategoriesList(DEFAULT_CATEGORIES);
}

export interface VisionModel {
  id: string;
  name: string;
  shortName: string;
  provider: string;
  badge?: string;
  description?: string;
}

export const VISION_MODELS: VisionModel[] = listApprovedModels('multimodal').map((m) => ({
  id: m.id,
  name: m.name,
  shortName: m.shortName,
  provider: vendorLabel(m.vendor),
  badge: m.badge,
  description: m.description,
}));

/** 模型是否支持 image_url 多模态输入（反推管线专用，排除纯文本 deepseek 等） */
export function isVisionCapableModel(modelId?: string): boolean {
  if (isDeepSeekRoute(modelId || '')) return !!deepSeekModel(modelId!)?.vision;
  const raw = (modelId || '').trim();
  if (!raw) return false;
  const approved = getApprovedModel(raw);
  if (approved) return approved.capability === 'multimodal';
  const lower = raw.toLowerCase();

  if (
    lower.includes('embedding') ||
    lower.includes('embed') ||
    lower.includes('whisper') ||
    lower.includes('tts') ||
    lower.includes('suno') ||
    lower.includes('rerank')
  ) {
    return false;
  }

  if (lower.includes('deepseek') && !lower.includes('vl')) {
    return false;
  }

  if (
    lower.includes('vision') ||
    lower.includes('gemini') ||
    lower.includes('claude') ||
    lower.includes('grok') ||
    lower.includes('4o') ||
    /gpt-[456]/.test(lower) ||
    lower.includes('qwen-vl') ||
    lower.includes('luna')
  ) {
    return true;
  }

  return false;
}

/** 过滤模型链，仅保留支持 image_url 的视觉模型 */
export function filterVisionCapableModels(models: string[]): string[] {
  return models.filter((m) => isVisionCapableModel(m));
}

/** 根据当前模型构建统一的多模态上游降级链。 */
export function buildVisionModelsToTry(
  requestedModel: string | undefined,
  fallbackModels: string[] | undefined = undefined,
  maxTotal = Math.max(MULTIMODAL_UPSTREAM_FALLBACK_ORDER.length, fallbackModels?.length ?? 0) + 1,
): string[] {
  const raw = (requestedModel || '').trim();
  const primary = raw ? normalizeVisionModelId(raw) : DEFAULT_MULTIMODAL_MODEL_ID;
  const chain = buildMultimodalUpstreamFallbackChain(primary, fallbackModels);
  return chain.slice(0, Math.max(1, maxTotal));
}

/** Pass1 逐图反推与其他视觉入口使用完全相同的上游降级顺序。 */
export function buildPass1VisionModelsToTry(
  requestedModel: string | undefined,
  fallbackModels: string[] | undefined = undefined,
  maxTotal = Math.max(MULTIMODAL_UPSTREAM_FALLBACK_ORDER.length, fallbackModels?.length ?? 0) + 1,
): string[] {
  return buildVisionModelsToTry(requestedModel, fallbackModels, maxTotal);
}

export function pickVisionAnalyzeFallbacks(selectedId: string): string[] {
  return buildMultimodalUpstreamFallbackChain(normalizeVisionModelId(selectedId)).slice(1);
}

export function normalizeVisionModelId(modelId?: string): string {
  if (!modelId) return DEFAULT_MULTIMODAL_MODEL_ID;
  const clean = modelId.trim().toLowerCase();
  const aliases: Record<string, string> = {
    'gpt-4-vision-preview': 'gpt-5.6-luna',
    'gpt-4-turbo-vision': 'gpt-5.6-luna',
    'gpt-4o': 'gpt-5.6-luna',
    'gpt-5.5-pro': 'gpt-5.6-luna',
    'gemini-1.5-flash': 'gemini-3.7-flash',
    'gemini-2.0-flash': 'gemini-3.7-flash',
    'gemini-2.5-flash': 'gemini-3.7-flash',
    'gemini-1.5-pro': 'gemini-3.1-pro-preview',
    'gemini-2.5-pro': 'gemini-3.1-pro-preview',
    'gemini-3.1-pro-preview-thinking-high': 'gemini-3.1-pro-preview',
    'claude-3-5-sonnet': 'claude-sonnet-5',
    'claude-3-5-sonnet-20241022': 'claude-sonnet-5',
    'claude-3-7-sonnet': 'claude-sonnet-5',
    'claude-3-7-sonnet-thinking': 'claude-opus-5',
    'claude-3-7-sonnet-20250219': 'claude-sonnet-5',
  };
  return aliases[clean] || modelId;
}

/** 爆款复刻 Pass2：用商品信息优化反推词，产出最终生图提示词（仅 @图片1） */
export function buildReplicationOptimizeSystemPrompt(params: {
  productTitle: string;
  productProps?: Record<string, string>;
  referenceImageCount: number;
  modelPersona: string;
  hasAnchorFace?: boolean;
  productFingerprint?: string;
  templateStyle?: string;
  extraRequirements?: string;
  reverseShots: Array<{
    shot_no: number;
    image_type?: string;
    has_human?: boolean;
    shot_type?: string;
    title?: string;
    scene?: string;
    reverse_prompt: string;
    negative_prompt?: string;
  }>;
}): string {
  const {
    productTitle,
    productProps,
    referenceImageCount,
    modelPersona,
    hasAnchorFace = false,
    productFingerprint,
    templateStyle,
    extraRequirements,
    reverseShots,
  } = params;

  const isNoModel =
    !modelPersona ||
    modelPersona === 'none' ||
    modelPersona.includes('无人物') ||
    modelPersona.includes('无需模特') ||
    modelPersona.includes('纯商品') ||
    modelPersona.includes('纯静物');

  const propsSection =
    productProps && Object.keys(productProps).length > 0
      ? `\n- 目标商品规格参数:\n${Object.entries(productProps)
          .map(([k, v]) => `  • ${k}: ${v}`)
          .join('\n')}\n`
      : '';

  const reverseBlock = reverseShots
    .map((s) => {
      const no = s.shot_no;
      return `### 分镜 ${no}
- image_type: ${s.image_type || 'photography'}
- has_human(反推判定): ${s.has_human === true}
- shot_type(反推判定): ${s.shot_type || 'pure_product'}
- title: ${s.title || `分镜 ${no}`}
- scene: ${s.scene || ''}
- negative_prompt: ${s.negative_prompt || '无'}
- reverse_prompt:
${s.reverse_prompt}`;
    })
    .join('\n\n');

  return appendPhoneGenerationPolicy(`你是电商「爆款复刻」提示词优化引擎。已完成对 ${referenceImageCount} 张外站参考图的全维反推；请结合目标商品，将每条 reverse_prompt 改写成**可直接生图的最终 prompt**。

## 目标商品
- 标题: ${productTitle}${propsSection}${
    productFingerprint ? `- 商品指纹摘要: ${productFingerprint}\n` : ''
  }${templateStyle && templateStyle !== 'auto' ? `- 风格架构参考（可吸收美学，勿整段照抄）:\n${templateStyle}\n` : ''}
- 模特人设: ${isNoModel ? '纯商品静物，无人物' : modelPersona}
- 专属正脸垫图: ${hasAnchorFace ? '已提供（生图时为 @图片3，仅五官 ID）' : '无'}

## 反推原文（按分镜，须 1:1 优化，不可丢镜）
${reverseBlock}

## 优化铁律
1. **保留反推九段结构**（【主体】【发型与面部】【穿搭或物体细节】【动作或摆放】【场景结构】【光影】【构图镜头】【材质与真实感】【画质与限制】），仅将商品相关段落中的具体外观替换为 **@图片1**。
2. **保留反推中的构图、机位、光影、景深、置景节奏与 image_type 对应的手法**；主体置换为当前目标商品。
3. **商品外观禁止文字硬描**（颜色几何、型号、支架形态等）；一律用 **@图片1** 指代商品实物外观。
4. **严禁出现 @图片2**，严禁写「以参考图为垫图 / 构图跟参考像素」——生图阶段只垫商品图，美学已写入文字。
5. ${
    isNoModel
      ? '全部分镜禁止人物/手部出镜；has_human=false, shot_type=pure_product。'
      : '人物是否出镜以各镜反推判定为准：反推无人物则禁止脑补模特；有人物则用人设定脸' +
        (hasAnchorFace ? '（五官 ID 用 @图片3）' : '') +
        '，表情用独立 expression 关键词，禁止抄参考图原模特身份。'
  }
6. 将各镜 negative_prompt 精简后追加到最终 prompt 末尾作为排除约束。
7. 清除鼠标光标、截屏边框、促销海报大字、参数贴纸等污染。
8. prompt 必须用简体中文；画面内必要外文可放中文引号内。
9. prompts 数组长度必须恰好等于 ${referenceImageCount}，shot_no 从 1 到 ${referenceImageCount}。

${extraRequirements ? `【用户定制补充要求】：\n${extraRequirements}\n` : ''}

## 输出 JSON
\`\`\`json
{
  "product_fingerprint": "对目标商品品类的简要提炼（只来自商品信息/商品图，勿抄旧竞品）",
  "model_anchor_features": "${
    isNoModel
      ? '无人物纯静物'
      : hasAnchorFace
        ? '已绑定专属真人模特正脸图 @图片3（仅五官）；表情由各镜文字关键词'
        : '按人设文字定型的新模特五官与发型摘要'
  }",
  "prompts": [
    {
      "shot_no": 1,
      "title": "短标题",
      "scene": "场景与光影",
      "expression": "有人物则写表情关键词，静物写无（静物）",
      "has_human": false,
      "shot_type": "pure_product",
      "image_type": "photography",
      "prompt": "【爆款复刻实拍】：……主体为 @图片1 所示商品实物……（保留九段结构，末尾附精简负面约束，无 @图片2）"
    }
  ]
}
\`\`\`
`, productTitle);
}
