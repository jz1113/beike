import { canExtractOutfit, canExtractPersona, isObservedDetail } from './visualEvidence';
import { assembleReversePrompt, MIN_REVERSE_PROMPT_LENGTH, type PerImageResult } from './prompts';
import { sanitizeActionPrompt, sanitizeActionTitle, sanitizeScenePrompt } from './sanitize';
import {
  isActionTitle,
  dedupeSceneCandidates,
} from './sceneDedup';
import {
  dedupeOutfitCandidates,
} from './outfitDedup';

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

/**
 * 动作资产物理提纯函数：
 * 1. 彻底剥离任何具体衣服、大衣、风衣、外套、蕾丝裙、短裙、围巾、运动鞋等服饰名词；
 * 2. 泛化特定模特发色与人设标签（如金发、橙卷发、黑长直等 -> 模特）；
 * 3. 剥离“身穿...”、“穿着...”从句；
 * 4. 纯净保留：机位焦段、构图角度、肢体手势、视线交互与动态瞬间。
 */

/** 将 per_image 结果绑定到 actions/scenes 等原子资产（实施四维正交纯净提纯） */
export function mergePerImageIntoAssets(
  parsedResult: Record<string, unknown>,
  perImageResults: PerImageResult[]
): Record<string, unknown> {
  const perImageMap = new Map(perImageResults.map((p) => [p.image_index, p]));

  const actions = Array.isArray(parsedResult.actions) ? parsedResult.actions : [];
  for (const act of actions) {
    const idx =
      typeof act.source_image_index === 'number'
        ? act.source_image_index
        : typeof act.sourceImageIndex === 'number'
          ? act.sourceImageIndex
          : null;

    if (idx !== null) {
      const source = perImageMap.get(idx);
      if (source?.reverse_prompt_zh) {
        act.reverse_prompt = source.reverse_prompt_zh;
        act.reversePrompt = source.reverse_prompt_zh;
        act.dimensions = source.dimensions;
        act.image_type = source.image_type;
      }
    }
    const shotType = (act.shot_type as string) || (act.shot_framing as string) || 'half_body';
    if (typeof act.action === 'string') {
      act.action = sanitizeActionPrompt(act.action);
    }
    if (typeof act.title === 'string') {
      act.title = sanitizeActionTitle(act.title, shotType, (act.action as string) || '');
    }
  }

  const scenes = Array.isArray(parsedResult.scenes) ? parsedResult.scenes : [];
  for (const sc of scenes) {
    const idx =
      typeof sc.source_image_index === 'number'
        ? sc.source_image_index
        : typeof sc.sourceImageIndex === 'number'
          ? sc.sourceImageIndex
          : null;

    if (idx !== null) {
      const source = perImageMap.get(idx);
      if (source?.reverse_prompt_zh && !sc.reverse_prompt) {
        sc.reverse_prompt = sanitizeScenePrompt(source.scene?.description || source.reverse_prompt_zh);
        sc.dimensions = source.dimensions;
      }
    }
    if (typeof sc.description === 'string') {
      sc.description = sanitizeScenePrompt(sc.description);
    }
    if (typeof sc.reverse_prompt === 'string') {
      sc.reverse_prompt = sanitizeScenePrompt(sc.reverse_prompt);
    }
  }

  return {
    ...parsedResult,
    per_image: perImageResults,
    actions,
    scenes,
  };
}

export interface ReconcileStats {
  actionsBeforeDedup: number;
  actionsAfterDedup: number;
  scenesBeforeDedup: number;
  scenesAfterDedup: number;
}

type LooseRecord = Record<string, unknown>;

function getSourceImageIndex(item: LooseRecord): number | null {
  if (typeof item.source_image_index === 'number') return item.source_image_index;
  if (typeof item.sourceImageIndex === 'number') return item.sourceImageIndex;
  return null;
}

function shouldIncludeAction(img: PerImageResult): boolean {
  return img.has_human !== false;
}


function buildActionFromPerImage(
  img: PerImageResult,
  pass2Action?: LooseRecord
): LooseRecord {
  const shotType =
    (pass2Action?.shot_type as string) ||
    (pass2Action?.shot_framing as string) ||
    img.action?.shot_type ||
    img.shot_framing ||
    'medium_full_body';

  const rawAction =
    (pass2Action?.action as string) ||
    img.action?.action ||
    img.dimensions.subject ||
    img.reverse_prompt_zh.slice(0, 80);

  const cleanAction = sanitizeActionPrompt(rawAction);
  const cleanReversePrompt = img.reverse_prompt_zh;

  const rawTitle =
    (pass2Action?.title as string) ||
    img.action?.title ||
    img.title ||
    `抓拍姿态${img.image_index}`;
  const title = sanitizeActionTitle(rawTitle, shotType, cleanAction);

  return {
    ...(pass2Action || {}),
    shot_type: shotType,
    title,
    action: cleanAction,
    camera: (pass2Action?.camera as string) || img.action?.camera || 'iPhone 50mm 生活镜头',
    suitable_anatomy: pass2Action?.suitable_anatomy || img.action?.suitable_anatomy || ['all'],
    source_image_index: img.image_index,
    reverse_prompt: cleanReversePrompt,
    reversePrompt: cleanReversePrompt,
    dimensions: img.dimensions,
    image_type: img.image_type,
  };
}

function buildSceneCandidate(
  img: PerImageResult,
  pass2Scene?: LooseRecord
): LooseRecord {
  const d = img.dimensions;
  const pureSceneDesc = img.scene?.description || '';
  const pureSceneTitle = img.scene?.title || '';
  const pureLighting = img.scene?.lighting || '';

  const rawDescription =
    (pass2Scene?.description as string) ||
    pureSceneDesc ||
    [d.vegetation_water, d.atmosphere, d.composition]
      .filter((v) => typeof v === 'string' && v.trim().length > 0)
      .join('，');

  const cleanDescription = sanitizeScenePrompt(rawDescription || img.reverse_prompt_zh.slice(0, 120));
  const cleanReversePrompt = pureSceneDesc
    ? sanitizeScenePrompt(pureSceneDesc)
    : sanitizeScenePrompt(img.reverse_prompt_zh);

  // 🚨 严禁使用动作标题作为场景标题！若包含动作词，自动回退到物理空间环境命名
  let sceneTitle = (pass2Scene?.title as string) || pureSceneTitle || '';
  if (!sceneTitle || isActionTitle(sceneTitle)) {
    if (pureSceneTitle && !isActionTitle(pureSceneTitle)) {
      sceneTitle = pureSceneTitle;
    } else if (img.title && !isActionTitle(img.title)) {
      sceneTitle = img.title;
    } else {
      const spatialDesc = d.vegetation_water || d.material_texture || '实景拍摄环境';
      sceneTitle = `${spatialDesc.slice(0, 10)}空间`;
    }
  }

  return {
    ...(pass2Scene || {}),
    title: sceneTitle,
    description: cleanDescription,
    lighting: (pass2Scene?.lighting as string) || pureLighting || d.lighting || '自然采光与清晰物理接触阴影',
    spatial_type: (pass2Scene?.spatial_type as string) || img.scene?.spatial_type || 'outdoor_nature',
    suitable_categories: pass2Scene?.suitable_categories || ['apparel'],
    tags: pass2Scene?.tags || [],
    source_image_index: img.image_index,
    source_image_indices: [img.image_index],
    reverse_prompt: cleanReversePrompt,
    dimensions: img.dimensions,
    image_type: img.image_type,
  };
}


function buildOutfitFromPerImage(img: PerImageResult): LooseRecord {
  const o = img.outfit || ({} as Partial<NonNullable<PerImageResult['outfit']>>);
  const title = String(o.title || '服装参考').trim();
  const top = isObservedDetail(o.top) ? String(o.top).trim() : '';
  const bottom = isObservedDetail(o.bottom) ? String(o.bottom).trim() : '';
  const shoes = isObservedDetail(o.shoes) ? String(o.shoes).trim() : '';
  const accessories = isObservedDetail(o.accessories) ? String(o.accessories).trim() : '';
  const colorPalette = isObservedDetail(o.color_palette) ? String(o.color_palette).trim() : '';

  const lookParts = [top, bottom, shoes].filter(Boolean).join('，');
  const reversePrompt = `【服装穿搭】：${lookParts || title}${colorPalette ? `，配色方案：${colorPalette}` : ''}${accessories ? `，细节配件：${accessories}` : ''}`;

  return {
    title,
    top: top || '',
    bottom: bottom || '',
    shoes,
    accessories,
    color_palette: colorPalette,
    dimensions: o.dimensions,
    source_image_index: img.image_index,
    reverse_prompt: reversePrompt,
    tags: [title, colorPalette].filter(Boolean),
  };
}

function buildPersonaFromPerImage(perImageResults: PerImageResult[]): LooseRecord | undefined {
  const source = perImageResults.find(canExtractPersona);
  if (!source?.persona) return undefined;
  const p = source.persona;
  const hair = isObservedDetail(p.hair) ? p.hair : '';
  const face = isObservedDetail(p.face) ? p.face : '';
  const skin = isObservedDetail(p.skin) ? p.skin : '';
  const vibe = isObservedDetail(p.vibe) ? p.vibe : '';
  const description = [hair && `发型发色：${hair}`, face && `五官轮廓：${face}`,
    skin && `肤质特征：${skin}`, vibe && `神态气质：${vibe}`].filter(Boolean).join('；');
  return { dimensions: p.dimensions, name: p.name || '人物参考', hair, face, skin, vibe, description,
    reverse_prompt: `【模特博主】：${description}`, source_image_index: source.image_index };
}

/**
 * 以 Pass1 逐图结果为权威源，先全量生成 actions/scenes/outfits/persona，再代码层去重。
 * Pass2 仅作元数据补充，不再决定条数。
 */
export function reconcileAssetsFromPerImage(
  parsedResult: Record<string, unknown>,
  perImageResults: PerImageResult[]
): { result: Record<string, unknown>; stats: ReconcileStats } {
  const pass2Actions = Array.isArray(parsedResult.actions) ? parsedResult.actions : [];
  const pass2Scenes = Array.isArray(parsedResult.scenes) ? parsedResult.scenes : [];

  const pass2ActionByIndex = new Map<number, LooseRecord>();
  for (const act of pass2Actions) {
    const idx = getSourceImageIndex(act as LooseRecord);
    if (idx !== null) pass2ActionByIndex.set(idx, act as LooseRecord);
  }

  const pass2SceneByIndex = new Map<number, LooseRecord>();
  for (const sc of pass2Scenes) {
    const idx = getSourceImageIndex(sc as LooseRecord);
    if (idx !== null) pass2SceneByIndex.set(idx, sc as LooseRecord);
  }

  const reconciledActions: LooseRecord[] = [];
  for (const img of perImageResults) {
    if (!shouldIncludeAction(img)) continue;
    reconciledActions.push(buildActionFromPerImage(img, pass2ActionByIndex.get(img.image_index)));
  }
  reconciledActions.sort(
    (a, b) => (a.source_image_index as number) - (b.source_image_index as number)
  );

  const sceneCandidates = perImageResults.map((img) =>
    buildSceneCandidate(img, pass2SceneByIndex.get(img.image_index))
  );
  const reconciledScenes = dedupeSceneCandidates(sceneCandidates);

  const outfitCandidates = perImageResults.filter(canExtractOutfit).map((img) => buildOutfitFromPerImage(img));
  const reconciledOutfits = dedupeOutfitCandidates(outfitCandidates);

  const reconciledPersona = buildPersonaFromPerImage(perImageResults);

  const stats: ReconcileStats = {
    actionsBeforeDedup: pass2Actions.length,
    actionsAfterDedup: reconciledActions.length,
    scenesBeforeDedup: sceneCandidates.length,
    scenesAfterDedup: reconciledScenes.length,
  };

  return {
    result: {
      ...parsedResult,
      per_image: perImageResults,
      actions: reconciledActions,
      scenes: reconciledScenes,
      outfits: reconciledOutfits,
      persona: reconciledPersona ?? null,
    },
    stats,
  };
}

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
