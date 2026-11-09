/** Product collection and reference script domain types for the ecommerce video workspace. */
export type VideoSalesCategory = 'beauty' | 'food' | 'home' | 'fashion' | 'tech' | 'other';

export type SalesProductImageView = 'front' | 'back' | 'detail' | 'worn' | 'flat';

export interface SalesReferenceSlot {
  slotIndex: number;
  mixedToken: string;
  apiToken: string;
  kind: 'persona_identity' | 'persona_body' | 'persona_face' | 'product' | 'scene' | 'action';
  roles?: Array<SalesReferenceSlot['kind']>;
  mediaType?: 'image' | 'video';
  label: string;
  url: string;
  view?: SalesProductImageView;
}

export const SALES_PRODUCT_IMAGE_VIEWS: readonly SalesProductImageView[] = ['front', 'back', 'detail', 'worn', 'flat'];

export function isSalesProductImageView(value: unknown): value is SalesProductImageView {
  return typeof value === 'string' && (SALES_PRODUCT_IMAGE_VIEWS as readonly string[]).includes(value);
}

export const SALES_IMAGE_VIEW_LABELS: Record<SalesProductImageView, string> = {
  front: '正面',
  back: '背面',
  detail: '细节',
  worn: '上身/场景',
  flat: '平铺/白底',
};

export interface SalesColorSelection {
  variantId?: string;
  colorLabel: string;
  confirmedImageUrls: string[];
  excludedImageUrls: string[];
}

/** Whether to prepare narration and separate subtitle drafts, or produce a clean visual showcase. */
export type SalesPresentationMode = 'subtitled_intro' | 'clean_visual';

export const SALES_PRESENTATION_MODE_LABELS: Record<SalesPresentationMode, { title: string; subtitle: string }> = {
  subtitled_intro: {
    title: '卖点介绍',
    subtitle: '用口播或旁白讲解商品，提供字幕草稿。',
  },
  clean_visual: {
    title: '纯画面展示',
    subtitle: '专注商品、人物与运镜，不生成口播和字幕。',
  },
};

/** Step 4 in product video workflow: whether motion is driven by storyboard text or depth video imitation. */
export type SalesImitationMode = 'script_only' | 'depth_imitation';

export const SALES_IMITATION_MODE_LABELS: Record<SalesImitationMode, { title: string; subtitle: string }> = {
  script_only: {
    title: '仅按脚本',
    subtitle: '按脚本的镜头切换与动作描述生成，使用所选商品、人物与场景图片。',
  },
  depth_imitation: {
    title: '脚本＋深度视频',
    subtitle: '深度视频仅参考动作与节奏；运镜、景别和表情按分镜，人物、商品与场景按所选图片。',
  },
};

export type SalesScriptStyleCategory =
  | 'street_onetake'
  | 'lifestyle_vlog'
  | 'talking_head'
  | 'detail_proof'
  | 'studio_lookbook'
  | 'home_cozy';

export interface SalesScriptTaxonomy {
  categoryId?: string;
  styleId?: string;
  productCategory: VideoSalesCategory;
  subCategory: string;
  styleCategory: SalesScriptStyleCategory;
}

const VALID_PRODUCT_CATEGORIES = new Set<string>(['fashion', 'beauty', 'food', 'home', 'tech', 'other']);
const VALID_STYLE_CATEGORIES = new Set<string>([
  'street_onetake', 'lifestyle_vlog', 'talking_head', 'detail_proof', 'studio_lookbook', 'home_cozy',
]);

export function isSalesScriptStyleCategory(v: unknown): v is SalesScriptStyleCategory {
  return typeof v === 'string' && VALID_STYLE_CATEGORIES.has(v);
}

export function inferScriptProductCategory(
  explicit: unknown,
  reusableCategories: readonly string[],
  corpus: string,
): VideoSalesCategory {
  if (typeof explicit === 'string' && VALID_PRODUCT_CATEGORIES.has(explicit)) {
    return explicit as VideoSalesCategory;
  }
  for (const cat of reusableCategories) {
    if (VALID_PRODUCT_CATEGORIES.has(cat)) return cat as VideoSalesCategory;
  }
  if (/冲锋衣|开衫|连衣裙|针织|外套|衬衫|裤|裙|穿搭|衣|鞋|包|模特上身/.test(corpus)) return 'fashion';
  if (/护肤|精华|面霜|口红|粉底|面膜|洗发|美妆|彩妆/.test(corpus)) return 'beauty';
  if (/零食|茶|咖啡|饮|奶|食品|冲泡|试吃|口感/.test(corpus)) return 'food';
  if (/数码|手机|耳机|充电|家电|科技|电脑|音箱/.test(corpus)) return 'tech';
  if (/家居|客厅|桌面|收纳|床品|厨房|纸巾|清洁/.test(corpus)) return 'home';
  return 'other';
}

export function inferScriptStyleCategory(input: {
  explicit?: unknown;
  oneTake: boolean;
  format: string;
  voiceMode: string;
  spatialType: string;
  corpus: string;
}): SalesScriptStyleCategory {
  if (isSalesScriptStyleCategory(input.explicit)) return input.explicit;
  const text = input.corpus.toLowerCase();
  if (input.format === 'hands' || input.format === 'product' || /微距|细节测评|手部演示|材质实测/.test(text)) {
    return 'detail_proof';
  }
  if (input.spatialType === 'studio' || /影棚|纯底|大片|lookbook/.test(text)) {
    return 'studio_lookbook';
  }
  if ((input.oneTake && input.spatialType === 'outdoor') || /街拍|一镜到底/.test(text)) {
    return 'street_onetake';
  }
  if (/vlog|法式|松弛|度假|回眸/.test(text) || (input.voiceMode === 'none' && input.format === 'presenter')) {
    return 'lifestyle_vlog';
  }
  if (/治愈|居家|温暖|清晨|原木/.test(text) && input.voiceMode !== 'speech') {
    return 'home_cozy';
  }
  if (input.voiceMode === 'speech') {
    return 'talking_head';
  }
  return 'lifestyle_vlog';
}

export type SalesScriptFormat = 'presenter' | 'hands' | 'product' | 'mixed';
export type SalesScriptVoiceMode = 'speech' | 'voiceover' | 'mixed' | 'none';
export type SalesBeatVoiceMode = 'speech' | 'voiceover' | 'none';
export type SalesBeatPurpose = 'hook' | 'showcase' | 'proof' | 'usage' | 'closing' | 'other';
export type SalesScriptStatus = 'draft' | 'verified' | 'archived';
export type SalesBeatRequiredView = SalesProductImageView | 'any';
export type SalesExclusionType = 'product' | 'brand_signage' | 'person_appearance' | 'accessory' | 'copy_claim' | 'scene';

export interface SalesBeatVoice {
  mode: SalesBeatVoiceMode;
  speaker: string;
  text: string;
  linePattern: string;
  uncertain: boolean;
}

export interface SalesScriptBeat {
  start: number;
  end: number;
  estimated: boolean;
  previewFrameUrl: string;
  purpose: SalesBeatPurpose;
  shotSize: string;
  camera: string;
  subject: string;
  action: string;
  actionTemplate: string;
  referenceActionRaw: string;
  productVisible?: boolean;
  expression: string;
  scene: string;
  transition: string;
  requiredView: SalesBeatRequiredView;
  voice: SalesBeatVoice;
  subtitle: string;
  shows: string;
  sectionLabel?: string;
  cameraLabel?: string;
  inferred: string[];
}

export interface SalesScriptShot {
  start: number;
  end: number;
  estimated: boolean;
  summary: string;
  analysis?: Partial<Record<'style' | 'subject' | 'action' | 'camera' | 'expression', string>>;
  beats: SalesScriptBeat[];
}

export interface SalesVisualSpec {
  aspectRatio: '9:16' | '16:9' | '3:4' | '1:1';
  oneTake: boolean;
  styleSummary: string;
  lighting: string;
  cameraFeel: string;
  moodTags: string[];
  pacing: 'fast' | 'medium' | 'slow';
}

export interface SalesAssetSlots {
  productViews: SalesProductImageView[];
  persona: {
    required: boolean;
    presence: 'full_presenter' | 'silent_model' | 'hands_only' | 'none';
    anchorsNeeded: Array<'full_body' | 'face' | 'hands'>;
    styleTags: string[];
  };
  scene: {
    spatialType: 'indoor' | 'outdoor' | 'studio';
    categoryTags: string[];
    requiredZones: string[];
  };
  audio: {
    voiceMode: SalesBeatVoiceMode;
    targetCps: number;
    voiceTags: string[];
    bgmRequired: boolean;
    bgmMoodTags: string[];
    bgmBpmRange?: [number, number];
  };
}

export interface SalesSourceExclusion {
  type: SalesExclusionType;
  term: string;
  replacementRule: string;
}

export interface SalesScriptDomain {
  title: string;
  durationSec: number;
  format: SalesScriptFormat;
  voiceMode: SalesScriptVoiceMode;
  audioAvailable: boolean;
  sampleTimesSec?: number[];
  overview: string;
  taxonomy: SalesScriptTaxonomy;
  visualSpec: SalesVisualSpec;
  structure: { hook: string; showcase: string; proof: string; closing: string };
  assetSlots: SalesAssetSlots;
  shots: SalesScriptShot[];
  sourceExclusions: SalesSourceExclusion[];
  reusable: {
    categories: string[];
    requiredViews: string[];
    requirements: string[];
    replaceable: string[];
    nonTransferable: string[];
  };
  review: string[];
}

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const asText = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v.trim() : fallback);
const asNum = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : fallback;
const asList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((s) => s.trim()) : [];

function pickEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

export function normalizeScriptTemplate(input: unknown): SalesScriptDomain | null {
  const raw = asRecord(input);
  const rawShots = Array.isArray(raw.shots) ? raw.shots : [];
  if (!rawShots.length) return null;
  const format = pickEnum(raw.format, ['presenter', 'hands', 'product', 'mixed'] as const, 'presenter');
  const voiceMode = pickEnum(raw.voiceMode, ['speech', 'voiceover', 'mixed', 'none'] as const, 'speech');
  const shots: SalesScriptShot[] = [];
  for (const rawShot of rawShots) {
    const s = asRecord(rawShot);
    const rawBeats = Array.isArray(s.beats) ? s.beats : [];
    const beats: SalesScriptBeat[] = rawBeats.map((rawBeat) => {
      const b = asRecord(rawBeat);
      const actionRaw = asText(b.action);
      const templateRaw = asText(b.actionTemplate);
      const actionTemplate = templateRaw || actionRaw;
      const action = actionRaw || templateRaw;
      const vObj = asRecord(b.voice);
      const rawText = asText(vObj.text);
      return {
        start: asNum(b.start, asNum(s.start, 0)),
        end: asNum(b.end, asNum(s.end, 0)),
        estimated: Boolean(b.estimated),
        previewFrameUrl: asText(b.previewFrameUrl),
        purpose: pickEnum(b.purpose, ['hook', 'showcase', 'proof', 'usage', 'closing', 'other'] as const, 'showcase'),
        shotSize: asText(b.shotSize, '中景') || '中景',
        camera: asText(b.camera),
        subject: asText(b.subject),
        action,
        actionTemplate,
        referenceActionRaw: asText(b.referenceActionRaw) || actionRaw,
        ...(typeof b.productVisible === 'boolean' ? { productVisible: b.productVisible } : {}),
        expression: asText(b.expression),
        scene: asText(b.scene),
        transition: asText(b.transition),
        requiredView: pickEnum(b.requiredView, ['front', 'back', 'detail', 'worn', 'flat', 'any'] as const, 'any'),
        voice: {
          mode: pickEnum(vObj.mode, ['speech', 'voiceover', 'none'] as const, voiceMode === 'voiceover' ? 'voiceover' : voiceMode === 'speech' ? 'speech' : 'none'),
          speaker: asText(vObj.speaker),
          text: rawText,
          linePattern: asText(vObj.linePattern) || (rawText ? '沿用原段台词节奏改写当前商品买点' : ''),
          uncertain: Boolean(vObj.uncertain),
        },
        subtitle: asText(b.subtitle),
        shows: asText(b.shows),
        ...(asText(b.sectionLabel) ? { sectionLabel: asText(b.sectionLabel) } : {}),
        ...(asText(b.cameraLabel) ? { cameraLabel: asText(b.cameraLabel) } : {}),
        inferred: asList(b.inferred),
      };
    });
    if (!beats.length) continue;
    const analysis = asRecord(s.analysis);
    shots.push({
      start: asNum(s.start, beats[0].start),
      end: asNum(s.end, beats[beats.length - 1].end),
      estimated: Boolean(s.estimated),
      summary: asText(s.summary),
      ...(s.analysis ? { analysis: {
        style: asText(analysis.style), subject: asText(analysis.subject), action: asText(analysis.action),
        camera: asText(analysis.camera), expression: asText(analysis.expression),
      } } : {}),
      beats,
    });
  }
  if (!shots.length) return null;
  const maxEnd = shots[shots.length - 1].end;
  const durationSec = asNum(raw.durationSec, maxEnd) || maxEnd;
  const vis = asRecord(raw.visualSpec);
  const inferredOneTake = shots.length === 1 && shots[0].beats.length > 1;
  const reusable = asRecord(raw.reusable);
  const slots = asRecord(raw.assetSlots);
  const slotViews = asList(slots.productViews).filter(isSalesProductImageView);
  const beatViews = shots.flatMap((sh) => sh.beats.map((b) => b.requiredView)).filter(isSalesProductImageView);
  const reusableViews = asList(reusable.requiredViews).filter(isSalesProductImageView);
  const productViews = [...new Set([...slotViews, ...beatViews, ...reusableViews])];
  const pSlot = asRecord(slots.persona);
  const defaultPresence = format === 'product' ? 'none' : format === 'hands' ? 'hands_only' : voiceMode === 'speech' ? 'full_presenter' : 'silent_model';
  const presence = pickEnum(pSlot.presence, ['full_presenter', 'silent_model', 'hands_only', 'none'] as const, defaultPresence);
  const personaRequired = typeof pSlot.required === 'boolean' ? pSlot.required : presence !== 'none';
  const rawAnchors = asList(pSlot.anchorsNeeded).filter((x): x is 'full_body' | 'face' | 'hands' => ['full_body', 'face', 'hands'].includes(x));
  const anchorsNeeded: Array<'full_body' | 'face' | 'hands'> = rawAnchors.length
    ? rawAnchors
    : presence === 'hands_only' ? ['hands'] : presence === 'none' ? [] : ['full_body', 'face'];
  const scSlot = asRecord(slots.scene);
  const auSlot = asRecord(slots.audio);
  const nonTransferable = asList(reusable.nonTransferable);
  const rawExclusions = Array.isArray(raw.sourceExclusions) ? raw.sourceExclusions : [];
  const sourceExclusions: SalesSourceExclusion[] = rawExclusions
    .map((item) => {
      const ex = asRecord(item);
      const term = asText(ex.term);
      if (!term) return null;
      return {
        type: pickEnum(ex.type, ['product', 'brand_signage', 'person_appearance', 'accessory', 'copy_claim', 'scene'] as const, 'copy_claim'),
        term,
        replacementRule: asText(ex.replacementRule, '迁移新商品时剔除或替换为当前资产'),
      };
    })
    .filter((item): item is SalesSourceExclusion => Boolean(item));
  if (!sourceExclusions.length && nonTransferable.length) {
    for (const term of nonTransferable) {
      sourceExclusions.push({ type: 'product', term, replacementRule: '原片专属元素，生成新商品时剔除' });
    }
  }
  const struct = asRecord(raw.structure);
  const tax = asRecord(raw.taxonomy);
  const styleSummaryText = asText(vis.styleSummary);
  const oneTakeVal = typeof vis.oneTake === 'boolean' ? vis.oneTake : inferredOneTake;
  const spatialVal = pickEnum(scSlot.spatialType, ['indoor', 'outdoor', 'studio'] as const, 'indoor');
  const reusableCats = asList(reusable.categories);
  const corpus = [asText(raw.title), asText(raw.overview), styleSummaryText, ...asList(vis.moodTags)].join(' ');
  const productCategory = inferScriptProductCategory(tax.productCategory, reusableCats, corpus);
  const styleCategory = inferScriptStyleCategory({
    explicit: tax.styleCategory,
    oneTake: oneTakeVal,
    format,
    voiceMode,
    spatialType: spatialVal,
    corpus,
  });
  const mergedCategories = reusableCats.includes(productCategory) ? reusableCats : [productCategory, ...reusableCats];
  return {
    title: asText(raw.title, '未命名参考脚本') || '未命名参考脚本',
    durationSec,
    format,
    voiceMode,
    ...(Array.isArray(raw.sampleTimesSec) ? { sampleTimesSec: raw.sampleTimesSec.filter((s): s is number => typeof s === 'number' && Number.isFinite(s) && s >= 0).slice(0, 24) } : {}),
    audioAvailable: typeof raw.audioAvailable === 'boolean' ? raw.audioAvailable : true,
    overview: asText(raw.overview),
    taxonomy: {
      categoryId: asText(tax.categoryId),
      styleId: asText(tax.styleId),
      productCategory,
      subCategory: asText(tax.subCategory).slice(0, 40),
      styleCategory,
    },
    visualSpec: {
      aspectRatio: pickEnum(vis.aspectRatio, ['9:16', '16:9', '3:4', '1:1'] as const, '9:16'),
      oneTake: typeof vis.oneTake === 'boolean' ? vis.oneTake : inferredOneTake,
      styleSummary: styleSummaryText,
      lighting: asText(vis.lighting),
      cameraFeel: asText(vis.cameraFeel),
      moodTags: asList(vis.moodTags),
      pacing: pickEnum(vis.pacing, ['fast', 'medium', 'slow'] as const, 'medium'),
    },
    structure: {
      hook: asText(struct.hook),
      showcase: asText(struct.showcase),
      proof: asText(struct.proof),
      closing: asText(struct.closing),
    },
    assetSlots: {
      productViews,
      persona: { required: personaRequired, presence, anchorsNeeded, styleTags: asList(pSlot.styleTags) },
      scene: {
        spatialType: pickEnum(scSlot.spatialType, ['indoor', 'outdoor', 'studio'] as const, 'indoor'),
        categoryTags: asList(scSlot.categoryTags),
        requiredZones: asList(scSlot.requiredZones),
      },
      audio: {
        voiceMode: pickEnum(auSlot.voiceMode, ['speech', 'voiceover', 'none'] as const, voiceMode === 'voiceover' ? 'voiceover' : voiceMode === 'speech' ? 'speech' : 'none'),
        targetCps: asNum(auSlot.targetCps, voiceMode === 'none' ? 0 : 3.8),
        voiceTags: asList(auSlot.voiceTags),
        bgmRequired: typeof auSlot.bgmRequired === 'boolean' ? auSlot.bgmRequired : true,
        bgmMoodTags: asList(auSlot.bgmMoodTags),
      },
    },
    shots: shots.map((shot) => ({
      ...shot,
      beats: shot.beats.map((beat) => ({ ...beat, action: beat.actionTemplate || beat.action })),
    })),
    sourceExclusions,
    reusable: {
      categories: mergedCategories,
      requiredViews: productViews,
      requirements: asList(reusable.requirements),
      replaceable: asList(reusable.replaceable),
      nonTransferable,
    },
    review: asList(raw.review),
  };
}

export function validateScriptTemplate(script: SalesScriptDomain): string[] {
  const issues: string[] = [];
  if (!script.title.trim()) issues.push('请填写脚本模板名称');
  if (script.durationSec <= 0 || script.durationSec > 600) issues.push('视频总时长需在 0.5—600 秒之间');
  if (!script.shots.length) issues.push('至少需要保留 1 个镜头');
  let prevShotEnd = 0;
  script.shots.forEach((shot, sIdx) => {
    if (shot.end <= shot.start) issues.push(`镜头 ${sIdx + 1} 结束秒数需大于开始秒数`);
    if (shot.start < prevShotEnd - 0.25) issues.push(`镜头 ${sIdx + 1} 与上一镜头时间重叠`);
    if (shot.end > script.durationSec + 0.5) issues.push(`镜头 ${sIdx + 1} 超出总时长`);
    let prevBeatEnd = shot.start;
    shot.beats.forEach((beat, bIdx) => {
      if (beat.end <= beat.start) issues.push(`镜头 ${sIdx + 1} 第 ${bIdx + 1} 段结束秒数需大于开始秒数`);
      if (beat.start < shot.start - 0.25 || beat.end > shot.end + 0.25) issues.push(`镜头 ${sIdx + 1} 第 ${bIdx + 1} 段超出所属镜头范围`);
      if (beat.start < prevBeatEnd - 0.25) issues.push(`镜头 ${sIdx + 1} 第 ${bIdx + 1} 段与上一段重叠`);
      if (!beat.actionTemplate.trim()) issues.push(`镜头 ${sIdx + 1} 第 ${bIdx + 1} 段缺少动作模板描述`);
      prevBeatEnd = beat.end;
    });
    prevShotEnd = shot.end;
  });
  return issues;
}

export function detectExclusionLeaks(script: SalesScriptDomain): Array<{ label: string; term: string }> {
  const terms = script.sourceExclusions
    .map((item) => item.term.trim())
    .flatMap((raw) => raw.split(/[、，,/；;\s]+/).map((part) => part.trim()))
    .filter((term) => term.length >= 2);
  const unique = [...new Set(terms)];
  const leaks: Array<{ label: string; term: string }> = [];
  for (const term of unique) {
    if (script.visualSpec.styleSummary.includes(term)) leaks.push({ label: '全局画面风格', term });
    script.shots.forEach((shot, sIdx) => {
      shot.beats.forEach((beat, bIdx) => {
        if (beat.actionTemplate.includes(term)) leaks.push({ label: `镜头 ${sIdx + 1}-${bIdx + 1} 动作模板`, term });
      });
    });
  }
  return leaks;
}

export function matchScriptProductReadiness(
  script: SalesScriptDomain,
  selectedCount: number,
  taggedViews: ReadonlySet<SalesProductImageView>,
): { ready: boolean; requiredViews: SalesProductImageView[]; missingViews: SalesProductImageView[]; summary: string } {
  const requiredViews = script.assetSlots.productViews;
  const missingViews = requiredViews.filter((view) => !taggedViews.has(view));
  if (selectedCount === 0) {
    return { ready: false, requiredViews, missingViews, summary: requiredViews.length ? `需商品图：${requiredViews.map((v) => SALES_IMAGE_VIEW_LABELS[v]).join('、')}` : '需至少选 1 张商品图' };
  }
  if (!requiredViews.length) {
    return { ready: true, requiredViews, missingViews: [], summary: `已选 ${selectedCount} 张商品图，视角不限` };
  }
  if (!missingViews.length) {
    return { ready: true, requiredViews, missingViews: [], summary: `商品视角齐全（${requiredViews.map((v) => SALES_IMAGE_VIEW_LABELS[v]).join('、')}）` };
  }
  return {
    ready: false,
    requiredViews,
    missingViews,
    summary: `当前商品缺：${missingViews.map((v) => SALES_IMAGE_VIEW_LABELS[v]).join('、')}（可在商品图上标注视角）`,
  };
}

export function tryParsePastedScriptJson(raw: string): SalesScriptDomain | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;
  try {
    const parsed: unknown = JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
    const record = asRecord(parsed);
    const inner = record.script && typeof record.script === 'object' ? record.script : parsed;
    const normalized = normalizeScriptTemplate(inner);
    return normalized;
  } catch {
    return null;
  }
}

export function selectSalesTemplateVoice(template: string, mode: SalesBeatVoiceMode): string {
  const label = { speech: '有口播', none: '无口播', voiceover: '后期旁白' }[mode];
  return template.replace(/^【仅(有口播|无口播|后期旁白)】([^\r\n]*)(\r?\n|$)/gm,
    (_, voice: string, line: string, newline: string) => voice === label ? line + newline : '');
}
