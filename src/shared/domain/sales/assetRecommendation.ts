import type { AppearanceAudience } from '../assets/appearanceAudience';
import type { SalesImageRef } from './imageCatalog';
import {
  isPersonaCompatibleWithProductAudience,
  resolvePersonaAudience,
  salesAudienceLabel,
} from './productClassification';
import type { SalesBeatRequiredView, SalesScriptDomain } from './scriptTemplate';
import { SALES_IMAGE_VIEW_LABELS, type SalesProductImageView, type VideoSalesCategory } from './types';

export interface SalesPersonaCandidate {
  id: string;
  name: string;
  description: string;
  tags: string;
  dimensions?: string;
  identityUrl?: string;
  avatarUrl: string;
  fullBodyUrl: string;
  faceUrl: string;
  sourceImages: string[];
  hasReferenceImage: boolean;
  source: string;
  defaultVoiceId?: string;
}

export interface SalesSceneCandidate {
  id: string;
  title: string;
  description: string;
  lighting: string;
  category: string;
  spatialType: string;
  tags: string;
  suitableCategories: string[];
  coverUrl: string;
  sourceImages: string[];
  dimensions?: string;
  source: string;
}

export interface SalesVoiceCandidate {
  id: string;
  name: string;
  voiceId: string;
  ttsVoice: string;
  gender: string;
  voiceGroup?: string;
  tags: string[];
  sampleAudioUrl: string;
  promptText: string;
  source: string;
}

export interface SalesBgmCandidate {
  id: string;
  title: string;
  description: string;
  moodTags: string[];
  bpm: number;
  durationSec: number;
  suitableCategories: string[];
  license: string;
  audioUrl: string;
  source?: string;
  editable?: boolean;
}

export interface RankedAsset<T> {
  item: T;
  score: number;
  reasons: string[];
  audienceMatched?: boolean;
  audienceLabel?: string;
}

export interface BeatProductImageBinding {
  beatIndex: number;
  shotIndex: number;
  requiredView: SalesBeatRequiredView;
  assignedView: SalesProductImageView | 'untagged';
  image: SalesImageRef | null;
  exactViewMatch: boolean;
}

const CATEGORY_KEYWORDS: Record<VideoSalesCategory, string[]> = {
  fashion: ['穿搭', '服饰', '女装', '男装', '街拍', '模特', '时尚', '衣'],
  beauty: ['美妆', '护肤', '亲切', '精致', '生活', '达人'],
  food: ['美食', '生活', '居家', '亲和', '日常'],
  home: ['家居', '生活', '居家', '温婉', '暖'],
  tech: ['科技', '数码', '商务', '专业', '极简'],
  other: ['通用', '带货', '种草'],
};

function countKeywordHits(haystack: string, needles: string[]): string[] {
  const lower = haystack.toLowerCase();
  return needles.filter((needle) => needle.trim().length >= 2 && lower.includes(needle.trim().toLowerCase()));
}

function normalizeSpatialKind(raw: string): 'indoor' | 'outdoor' | 'studio' {
  const lower = raw.toLowerCase();
  if (lower.includes('outdoor') || lower.includes('street') || lower.includes('户外') || lower.includes('街')) return 'outdoor';
  if (lower.includes('studio') || lower.includes('backdrop') || lower.includes('影棚') || lower.includes('纯底')) return 'studio';
  return 'indoor';
}

export function recommendPersonas(
  script: SalesScriptDomain,
  category: VideoSalesCategory,
  personas: readonly SalesPersonaCandidate[],
  productAudience?: AppearanceAudience,
): RankedAsset<SalesPersonaCandidate>[] {
  if (!script.assetSlots.persona.required) return [];
  const wantedTags = [...script.assetSlots.persona.styleTags, ...script.visualSpec.moodTags];
  const catWords = CATEGORY_KEYWORDS[category] || [];
  const enforceAudience = Boolean(productAudience && productAudience !== 'unknown');
  return personas
    .map((item) => {
      let score = 0;
      const reasons: string[] = [];
      const text = `${item.name} ${item.tags} ${item.description}`;
      const personaAud = resolvePersonaAudience(item);
      const personaAudLabel = salesAudienceLabel(personaAud);
      const audienceMatched = isPersonaCompatibleWithProductAudience(item, productAudience);
      if (enforceAudience) {
        if (audienceMatched) {
          score += 60;
          reasons.push(`契合适用人群（${personaAudLabel}）`);
        } else {
          score -= 120;
        }
      }
      if (item.hasReferenceImage) {
        score += 40;
        if (item.fullBodyUrl && item.faceUrl && item.fullBodyUrl !== item.faceUrl) {
          score += 18;
          reasons.push('含全身+人脸双锚点参考图');
        } else {
          reasons.push('含人物基准参考图');
        }
      } else {
        score -= 25;
      }
      const tagHits = countKeywordHits(text, wantedTags);
      if (tagHits.length) {
        score += Math.min(24, tagHits.length * 8);
        reasons.push(`契合风格（${tagHits.slice(0, 2).join('、')}）`);
      }
      const catHits = countKeywordHits(text, catWords);
      if (catHits.length) {
        score += 14;
        reasons.push('适合当前商品品类');
      }
      if (script.voiceMode === 'speech' && /口播|主播|种草|达人/.test(text)) {
        score += 10;
        reasons.push('适合真人口播表现');
      }
      if (!reasons.length) reasons.push('可用人物形象资产');
      return { item, score, reasons, audienceMatched, audienceLabel: personaAudLabel };
    })
    .sort((a, b) => {
      if (Boolean(a.audienceMatched) !== Boolean(b.audienceMatched)) {
        return a.audienceMatched ? -1 : 1;
      }
      return b.score - a.score;
    });
}

export function recommendScenes(
  script: SalesScriptDomain,
  category: VideoSalesCategory,
  scenes: readonly SalesSceneCandidate[],
): RankedAsset<SalesSceneCandidate>[] {
  const targetSpatial = script.assetSlots.scene.spatialType;
  const wanted = [...script.assetSlots.scene.categoryTags, ...script.assetSlots.scene.requiredZones, ...script.visualSpec.moodTags];
  return scenes
    .map((item) => {
      let score = 0;
      const reasons: string[] = [];
      const text = `${item.title} ${item.category} ${item.tags} ${item.description} ${item.lighting}`;
      if (normalizeSpatialKind(item.spatialType + ' ' + text) === targetSpatial) {
        score += 35;
        reasons.push(`空间匹配（${targetSpatial === 'outdoor' ? '户外' : targetSpatial === 'studio' ? '影棚' : '室内'}）`);
      }
      if (item.suitableCategories.includes(category)) {
        score += 18;
        reasons.push('适用品类匹配');
      }
      if (item.coverUrl) {
        score += 20;
        reasons.push('含实景参考图');
      }
      const hits = countKeywordHits(text, wanted);
      if (hits.length) {
        score += Math.min(24, hits.length * 8);
        reasons.push(`场景元素匹配（${hits.slice(0, 2).join('、')}）`);
      }
      if (script.visualSpec.lighting && item.lighting && countKeywordHits(item.lighting, [script.visualSpec.lighting.slice(0, 2)]).length) {
        score += 8;
      }
      if (!reasons.length) reasons.push('通用场景预设');
      return { item, score, reasons };
    })
    .sort((a, b) => b.score - a.score);
}

export function recommendVoices(
  script: SalesScriptDomain,
  selectedPersona: SalesPersonaCandidate | null,
  voices: readonly SalesVoiceCandidate[],
): RankedAsset<SalesVoiceCandidate>[] {
  if (script.voiceMode === 'none') return [];
  const wanted = [...script.assetSlots.audio.voiceTags, ...script.visualSpec.moodTags];
  const personaText = selectedPersona ? `${selectedPersona.name} ${selectedPersona.tags} ${selectedPersona.description}` : '';
  const preferMale = /男|子轩|博文|先生/.test(personaText + ' ' + wanted.join(' '));
  return voices
    .map((item) => {
      let score = 0;
      const reasons: string[] = [];
      if (selectedPersona?.defaultVoiceId && item.id === selectedPersona.defaultVoiceId) {
        score += 45;
        reasons.push(`绑定「${selectedPersona.name}」默认专属音色`);
      }
      if ((preferMale && item.gender === 'male') || (!preferMale && item.gender !== 'male')) {
        score += 18;
        reasons.push(item.gender === 'male' ? '男声人设一致' : '女声人设一致');
      }
      const text = `${item.name} ${item.tags.join(' ')} ${item.promptText}`;
      const hits = countKeywordHits(text, wanted);
      if (hits.length) {
        score += Math.min(20, hits.length * 7);
        reasons.push(`语感匹配（${hits.slice(0, 2).join('、')}）`);
      }
      if (script.voiceMode === 'speech' && /带货|热情|种草|开朗/.test(text)) score += 10;
      if (script.voiceMode === 'voiceover' && /知性|温润|轻柔|治愈|故事/.test(text)) score += 10;
      if (!reasons.length) reasons.push('商用合成音色');
      return { item, score, reasons };
    })
    .sort((a, b) => b.score - a.score);
}

export function recommendBgms(
  script: SalesScriptDomain,
  category: VideoSalesCategory,
  bgms: readonly SalesBgmCandidate[],
): RankedAsset<SalesBgmCandidate>[] {
  const wanted = [...script.assetSlots.audio.bgmMoodTags, ...script.visualSpec.moodTags];
  const range = script.assetSlots.audio.bgmBpmRange;
  const targetBpm = range ? (range[0] + range[1]) / 2 : script.visualSpec.pacing === 'fast' ? 114 : script.visualSpec.pacing === 'slow' ? 88 : 100;
  return bgms
    .map((item) => {
      let score = 0;
      const reasons: string[] = [];
      if (item.suitableCategories.includes(category)) {
        score += 18;
        reasons.push('契合商品品类');
      }
      const hits = countKeywordHits(`${item.title} ${item.description} ${item.moodTags.join(' ')}`, wanted);
      if (hits.length) {
        score += Math.min(30, hits.length * 10);
        reasons.push(`情绪契合（${hits.slice(0, 2).join('、')}）`);
      }
      const bpmDiff = Math.abs(item.bpm - targetBpm);
      if (bpmDiff <= 12) {
        score += 18;
        reasons.push(`节奏匹配（${item.bpm} BPM）`);
      } else if (bpmDiff <= 22) {
        score += 8;
      }
      reasons.push(item.license);
      return { item, score, reasons };
    })
    .sort((a, b) => b.score - a.score);
}

export function bindBeatProductImages(
  script: SalesScriptDomain,
  selectedImages: readonly SalesImageRef[],
  overrides: Record<number, string> = {},
): BeatProductImageBinding[] {
  const byUrl = new Map(selectedImages.map((img) => [img.url, img]));
  const primary = selectedImages.find((img) => img.view === 'front') || selectedImages.find((img) => img.role === 'main') || selectedImages[0] || null;
  const bindings: BeatProductImageBinding[] = [];
  let flatIdx = 0;
  script.shots.forEach((shot, shotIndex) => {
    shot.beats.forEach((beat) => {
      const overrideUrl = overrides[flatIdx];
      const overrideImg = overrideUrl ? byUrl.get(overrideUrl) || null : null;
      let chosen = overrideImg;
      let exact = false;
      if (chosen) {
        exact = beat.requiredView === 'any' || chosen.view === beat.requiredView;
      } else if (beat.requiredView !== 'any') {
        const tagged = selectedImages.find((img) => img.view === beat.requiredView);
        if (tagged) {
          chosen = tagged;
          exact = true;
        } else if (beat.requiredView === 'detail') {
          chosen = selectedImages.find((img) => img.role === 'detail') || primary;
        } else {
          chosen = primary;
        }
      } else {
        chosen = primary;
        exact = Boolean(primary);
      }
      bindings.push({
        beatIndex: flatIdx,
        shotIndex,
        requiredView: beat.requiredView,
        assignedView: chosen?.view || 'untagged',
        image: chosen,
        exactViewMatch: exact,
      });
      flatIdx += 1;
    });
  });
  return bindings;
}

export function describeBoundImageLabel(binding: BeatProductImageBinding): string {
  if (!binding.image) return '未选商品图';
  const viewText = binding.image.view ? SALES_IMAGE_VIEW_LABELS[binding.image.view] : '主参考图';
  return `商品图 #${binding.image.index + 1}（${viewText}）`;
}
