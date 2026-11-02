import { isSalesProductImageView } from './imageCatalog';
import { inferScriptProductCategory, inferScriptStyleCategory, type SalesScriptTaxonomy } from './scriptTaxonomy';
import { SALES_IMAGE_VIEW_LABELS, type SalesProductImageView } from './types';

export type SalesScriptFormat = 'presenter' | 'hands' | 'product' | 'mixed';
export type SalesScriptVoiceMode = 'speech' | 'voiceover' | 'mixed' | 'none';
export type SalesBeatVoiceMode = 'speech' | 'voiceover' | 'none';
export type SalesBeatPurpose = 'hook' | 'showcase' | 'proof' | 'usage' | 'closing' | 'other';
export type SalesScriptStatus = 'draft' | 'verified' | 'archived';
export type SalesBeatRequiredView = SalesProductImageView | 'any';
export type SalesExclusionType = 'product' | 'brand_signage' | 'person_appearance' | 'accessory' | 'copy_claim';

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
  expression: string;
  scene: string;
  transition: string;
  requiredView: SalesBeatRequiredView;
  voice: SalesBeatVoice;
  subtitle: string;
  shows: string;
  inferred: string[];
}

export interface SalesScriptShot {
  start: number;
  end: number;
  estimated: boolean;
  summary: string;
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
        inferred: asList(b.inferred),
      };
    });
    if (!beats.length) continue;
    shots.push({
      start: asNum(s.start, beats[0].start),
      end: asNum(s.end, beats[beats.length - 1].end),
      estimated: Boolean(s.estimated),
      summary: asText(s.summary),
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
        type: pickEnum(ex.type, ['product', 'brand_signage', 'person_appearance', 'accessory', 'copy_claim'] as const, 'product'),
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
  const styleSummaryText = asText(vis.styleSummary) || asText(shots[0].beats[0]?.scene);
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
      styleSummary: asText(vis.styleSummary) || asText(shots[0].beats[0]?.scene),
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
