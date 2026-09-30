import { assembleReversePrompt, MIN_REVERSE_PROMPT_LENGTH, type PerImageResult } from './prompts';

export const MIN_PROMPT_LENGTH = MIN_REVERSE_PROMPT_LENGTH;

export const VAGUE_PATTERNS = [
  /很高级/,
  /氛围感强/,
  /很好看/,
  /非常美/,
  /极具质感/,
  /高级感/,
  /很有感觉/,
];

const CORE_DIMENSION_KEYS = [
  'subject',
  'art_style',
  'color_scheme',
  'lighting',
  'composition',
  'material_texture',
  'camera_language',
  'atmosphere',
  'resolution_quality',
] as const;

const PHOTOGRAPHY_EXTRA_KEYS = ['lighting_type', 'focal_length', 'depth_of_field', 'color_tone'] as const;
const LANDSCAPE_EXTRA_KEYS = ['season', 'time_of_day', 'sky_state', 'vegetation_water', 'perspective'] as const;

const REQUIRED_SECTION_MARKERS = ['【主体】', '【场景结构】', '【光影】'] as const;

export interface ValidationResult {
  valid: boolean;
  issues: string[];
}

export function validateReversePrompt(prompt: string): ValidationResult {
  const issues: string[] = [];
  const trimmed = (prompt || '').trim();

  if (trimmed.length < MIN_PROMPT_LENGTH) {
    issues.push(`提示词过短（${trimmed.length}字，要求≥${MIN_PROMPT_LENGTH}字）`);
  }

  for (const marker of REQUIRED_SECTION_MARKERS) {
    if (!trimmed.includes(marker)) {
      issues.push(`缺少分段标记：${marker}`);
    }
  }

  for (const pattern of VAGUE_PATTERNS) {
    if (pattern.test(trimmed)) {
      issues.push(`包含空泛词：${pattern.source}`);
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateDimensions(
  dimensions: Record<string, unknown>,
  imageType?: string
): ValidationResult {
  const issues: string[] = [];
  const filledCore = CORE_DIMENSION_KEYS.filter((k) => {
    const v = dimensions[k];
    return typeof v === 'string' && v.trim().length > 0;
  });

  if (filledCore.length < CORE_DIMENSION_KEYS.length) {
    issues.push(`核心维度不足（仅填 ${filledCore.length}/${CORE_DIMENSION_KEYS.length} 项，要求全部非空）`);
  }

  if (imageType === 'photography') {
    const filledPhoto = PHOTOGRAPHY_EXTRA_KEYS.filter((k) => {
      const v = dimensions[k];
      return typeof v === 'string' && v.trim().length > 0;
    });
    if (filledPhoto.length < 2) {
      issues.push(`摄影类扩展维度不足（仅填 ${filledPhoto.length}/4 项）`);
    }
  }

  if (imageType === 'landscape') {
    const filledLandscape = LANDSCAPE_EXTRA_KEYS.filter((k) => {
      const v = dimensions[k];
      return typeof v === 'string' && v.trim().length > 0;
    });
    if (filledLandscape.length < 2) {
      issues.push(`风景类扩展维度不足（仅填 ${filledLandscape.length}/5 项）`);
    }
  }

  return { valid: issues.length === 0, issues };
}

/** 将 LLM 原始输出规范化为 PerImageResult */
export function normalizePerImageResult(raw: Record<string, unknown>, imageIndex: number): PerImageResult {
  const dimensions =
    typeof raw.dimensions === 'object' && raw.dimensions !== null
      ? (raw.dimensions as Record<string, string>)
      : {};

  const reversePromptZh =
    (raw.reverse_prompt_zh as string) ||
    (raw.reverse_prompt as string) ||
    (raw.reversePrompt as string) ||
    '';

  const scene =
    typeof raw.scene === 'object' && raw.scene !== null
      ? (raw.scene as PerImageResult['scene'])
      : undefined;
  const outfit =
    typeof raw.outfit === 'object' && raw.outfit !== null
      ? (raw.outfit as PerImageResult['outfit'])
      : undefined;
  const action =
    typeof raw.action === 'object' && raw.action !== null
      ? (raw.action as PerImageResult['action'])
      : undefined;
  const persona =
    typeof raw.persona === 'object' && raw.persona !== null
      ? (raw.persona as PerImageResult['persona'])
      : undefined;

  const productFrameRatio =
    typeof raw.product_frame_ratio === 'number'
      ? raw.product_frame_ratio
      : typeof raw.productFrameRatio === 'number'
        ? raw.productFrameRatio
        : null;

  let tags: string[] | string | undefined;
  if (Array.isArray(raw.tags)) {
    tags = raw.tags.filter((t): t is string => typeof t === 'string');
  } else if (typeof raw.tags === 'string') {
    tags = raw.tags;
  }

  const negativePromptZh =
    (raw.negative_prompt_zh as string) ||
    (raw.negative_prompt as string) ||
    (raw.negativePrompt as string) ||
    undefined;

  const analysisSummary =
    (raw.analysis_summary as string) || (raw.analysisSummary as string) || undefined;

  return {
    image_index: (raw.image_index as number) || imageIndex,
    image_type: (raw.image_type as string) || (raw.imageType as string) || 'general',
    title: raw.title as string | undefined,
    reverse_prompt_zh: reversePromptZh,
    reverse_prompt: reversePromptZh,
    negative_prompt_zh: negativePromptZh,
    analysis_summary: analysisSummary,
    dimensions,
    has_human: raw.has_human as boolean | undefined,
    shot_framing: (raw.shot_framing as string) || (raw.shot_type as string) || undefined,
    product_frame_ratio: productFrameRatio,
    tags,
    scene,
    outfit,
    action,
    persona,
  };
}

/** 校验并修复单张反推结果：不合格时用 assembleReversePrompt 兜底，择优取长版 */
export function ensurePerImageQuality(item: PerImageResult): PerImageResult {
  const assembled = assembleReversePrompt(item.dimensions, item.image_type, {
    outfit: item.outfit,
    scene: item.scene,
    analysis_summary: item.analysis_summary,
  });

  const candidates = [item.reverse_prompt_zh, assembled].filter(
    (p) => typeof p === 'string' && p.trim().length > 0
  ) as string[];

  let bestPrompt = item.reverse_prompt_zh;
  for (const candidate of candidates) {
    const validation = validateReversePrompt(candidate);
    const hasSections = candidate.includes('【');
    const currentValid = validateReversePrompt(bestPrompt).valid;
    const currentHasSections = bestPrompt.includes('【');

    if (
      validation.valid &&
      (!currentValid ||
        candidate.length > bestPrompt.length ||
        (hasSections && !currentHasSections))
    ) {
      bestPrompt = candidate;
    }
  }

  const promptValidation = validateReversePrompt(bestPrompt);

  if (promptValidation.valid) {
    return {
      ...item,
      reverse_prompt_zh: bestPrompt,
      reverse_prompt: bestPrompt,
    };
  }

  if (assembled.length >= MIN_PROMPT_LENGTH) {
    const assembledValidation = validateReversePrompt(assembled);
    const finalPrompt =
      assembledValidation.valid && assembled.length >= bestPrompt.length ? assembled : bestPrompt;
    return {
      ...item,
      reverse_prompt_zh: finalPrompt,
      reverse_prompt: finalPrompt,
    };
  }

  return {
    ...item,
    reverse_prompt_zh: bestPrompt,
    reverse_prompt: bestPrompt,
  };
}

export { mergePerImageIntoAssets, reconcileAssetsFromPerImage, type ReconcileStats } from './reconcile';

export {
  sanitizeActionPrompt,
  sanitizeActionTitle,
  sanitizeScenePrompt,
  formatActionTitleByShotType,
} from './sanitize';
export {
  isActionTitle,
  extractSceneSignature,
  sceneSimilarity,
  type SceneSignature,
} from './sceneDedup';
export {
  extractOutfitSignature,
  outfitSimilarity,
  dedupeOutfitCandidates,
  type OutfitSignature,
} from './outfitDedup';
