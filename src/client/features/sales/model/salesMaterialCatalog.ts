import { appearanceAudience, audienceDimensions, setAudienceDimensions } from '@shared/domain/assets/appearanceAudience';
import type { SalesActionCandidate, SalesMaterialCatalog, SalesPersonaCandidate, SalesSceneCandidate, SalesVoiceCandidate } from '@shared/domain/sales';
import { ACTION_MEDIA_LABELS, actionMedia, type ActionMediaType, type DepthActionKind } from './salesActionMedia';
import { extractActionAngleEntries, type ActionAngleEntry } from './salesActionViews';
import { compareSalesAssetNames } from './salesAssetNames';

export type SalesMaterialKind = 'persona' | 'scene' | 'action' | 'sound';
export type SalesPersonaGroup = 'male' | 'female' | 'senior' | 'child';
export type SalesSceneSpace = 'indoor' | 'outdoor';
export type ActionCategoryFilter = 'all' | 'unclassified' | `category:${string}`;

export const PERSONA_GROUP_TABS: readonly { id: SalesPersonaGroup; label: string }[] = [
  { id: 'female', label: '成年女' },
  { id: 'male', label: '成年男' },
  { id: 'senior', label: '老年' },
  { id: 'child', label: '儿童' },
];

export const SCENE_SPACE_TABS: readonly { id: SalesSceneSpace; label: string }[] = [
  { id: 'outdoor', label: '户外' },
  { id: 'indoor', label: '室内' },
];

export const ACTION_DEPTH_TABS: readonly { id: 'all' | DepthActionKind; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'depth-video', label: '视频' },
  { id: 'depth-image', label: '图片' },
];

export const SOUND_KIND_TABS: readonly { id: 'voice' | 'bgm'; label: string }[] = [
  { id: 'voice', label: '人声' },
  { id: 'bgm', label: 'BGM' },
];

export const PERSONA_GROUP_LABELS: Record<SalesPersonaGroup, string> = {
  female: '成年女',
  male: '成年男',
  senior: '老年',
  child: '儿童',
};

export const SCENE_SPACE_LABELS: Record<SalesSceneSpace, string> = {
  outdoor: '户外',
  indoor: '室内',
};

export const ACTION_PRESET_TAGS = [
  '全身展示',
  '半身展示',
  '转身展示',
  '走秀台步',
  '街拍随性',
  '拎包走动',
  '近景细节',
  '插兜站姿',
] as const;

const SYSTEM_NOISE_ACTION_TAGS = new Set([
  'mocap',
  'raw',
  'turbo',
  'fast',
  'standard',
  'high',
  '深度动作',
  '中景',
  '半身',
  'half_body',
  'medium',
  'iPhone 50mm 生活镜头',
  'iPhone 50mm 标准生活镜头',
]);

export interface SalesMaterialCard {
  key: string;
  id: string;
  kind: SalesMaterialKind;
  soundType?: 'voice' | 'bgm';
  voiceGroup?: SalesPersonaGroup;
  personaGroup?: SalesPersonaGroup;
  sceneSpace?: SalesSceneSpace;
  depthKind?: DepthActionKind;
  categoryId?: string;
  productCategoryIds?: string[];
  title: string;
  description: string;
  tags: string[];
  editableTags?: string[];
  image: string;
  audio: string;
  durationSec?: number;
  badge: string;
  subBadge?: string;
  video?: string;
  mediaType?: ActionMediaType;
  sourceUrl?: string;
  sourceImages?: string[];
  dimensions?: string;
  angleEntries?: ActionAngleEntry[];
  personaViewCount?: number;
  editable?: boolean;
}

const splitTags = (tags: string): string[] => tags.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);

export function cleanActionTags(rawTags: string | readonly string[]): string[] {
  const list = typeof rawTags === 'string' ? splitTags(rawTags) : rawTags.map((s) => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of list) {
    if (!tag || SYSTEM_NOISE_ACTION_TAGS.has(tag) || SYSTEM_NOISE_ACTION_TAGS.has(tag.toLowerCase())) continue;
    if (seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
  }
  return result;
}

export function isMachineGeneratedActionTitle(title: string): boolean {
  const trimmed = title.trim().replace(/\s*·\s*深度(?:视频|图片)?$/, '').trim();
  if (!trimmed) return true;
  if (/^[0-9a-f]{16,}(?:[_-]\d+)?$/i.test(trimmed)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) return true;
  if (/^(?:wx_camera_|mmexport|vid_|img_|pxl_|dji_|screenrecording_|rpReplay_)[0-9a-z_-]+$/i.test(trimmed)) return true;
  return false;
}

export function nextSequentialActionName(actions: readonly Pick<SalesActionCandidate, 'title'>[]): string {
  const used = new Set<number>();
  let maxNumeric = 0;
  for (const item of actions) {
    const trimmed = (item.title || '').trim();
    if (/^\d+$/.test(trimmed)) {
      const n = Number(trimmed);
      if (Number.isInteger(n) && n > 0) {
        used.add(n);
        if (n > maxNumeric) maxNumeric = n;
      }
    }
  }
  const candidate = Math.max(actions.length + 1, maxNumeric + 1);
  if (!used.has(candidate)) return String(candidate);
  let seq = 1;
  while (used.has(seq)) seq += 1;
  return String(seq);
}

export function toggleTagInList(rawTags: string, tag: string): string {
  const current = cleanActionTags(rawTags);
  const next = current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag];
  return next.join('，');
}

export function resolveActionCategoryIds(action: Pick<SalesActionCandidate, 'categoryId' | 'productCategoryIds'>): string[] {
  const raw = Array.isArray(action.productCategoryIds) ? action.productCategoryIds : [];
  const list = raw.map((s) => s.trim()).filter(Boolean);
  if (list.length > 0) return list;
  const single = action.categoryId?.trim();
  return single ? [single] : [];
}

export function matchesActionCategoryFilter(
  card: Pick<SalesMaterialCard, 'categoryId' | 'productCategoryIds'>,
  filter: ActionCategoryFilter,
  validCategoryIds: ReadonlySet<string>,
): boolean {
  if (filter === 'all') return true;
  const assigned = (card.productCategoryIds || (card.categoryId ? [card.categoryId] : []))
    .filter((id) => validCategoryIds.has(id));
  if (filter === 'unclassified') return assigned.length === 0;
  const targetId = filter.slice('category:'.length);
  return assigned.includes(targetId);
}

export function classifyPersonaGroup(persona: Pick<SalesPersonaCandidate, 'name' | 'description' | 'tags' | 'dimensions'>): SalesPersonaGroup {
  const aud = appearanceAudience({
    name: persona.name,
    description: persona.description,
    tags: persona.tags,
    dimensions: persona.dimensions,
  });
  if (aud === 'child_male' || aud === 'child_female' || aud === 'child_unisex') return 'child';
  if (aud === 'senior_male' || aud === 'senior_female' || aud === 'senior_unisex') return 'senior';
  if (aud === 'adult_male') return 'male';
  if (aud === 'adult_female') return 'female';
  const text = `${persona.name} ${persona.tags} ${persona.description}`.toLowerCase();
  if (/儿童|童|小孩|男孩|女孩|宝宝|少儿/.test(text)) return 'child';
  if (/老年|老人|老爷爷|老奶奶|银发|长者|大爷|大妈|老\b/.test(text)) return 'senior';
  if (/男|先生|子轩|博文|小哥|大叔|绅士/.test(text) && !/女/.test(text)) return 'male';
  return 'female';
}

export function personaGroupToDimensions(existingDimensions: string | undefined, group: SalesPersonaGroup): string {
  if (group === 'male' || group === 'female') return setAudienceDimensions(existingDimensions, `adult_${group}`);
  const audience = audienceDimensions(existingDimensions).audience;
  // Age-only groups must not silently change an existing boy or older man's gender.
  const gender = typeof audience === 'string' && audience.endsWith('_male') ? 'male' : 'female';
  return setAudienceDimensions(existingDimensions, `${group}_${gender}`);
}

const LEGACY_PERSONA_GROUP_TAGS = new Set(['男', '女', '老', '老年', '儿童', '成年女', '成年男']);

export function mergeGroupTag(rawTags: string, groupLabel: string, pool: readonly string[]): string {
  const drop = new Set([...pool, ...LEGACY_PERSONA_GROUP_TAGS]);
  const existing = splitTags(rawTags).filter((t) => !drop.has(t));
  return [groupLabel, ...existing].join('，');
}

export function classifySceneSpace(scene: Pick<SalesSceneCandidate, 'title' | 'description' | 'spatialType' | 'tags' | 'category'>): SalesSceneSpace {
  const spatialType = scene.spatialType.trim().toLowerCase();
  if (/^indoor(?:_|$)/.test(spatialType) || spatialType === '室内') return 'indoor';
  if (/^outdoor(?:_|$)/.test(spatialType) || spatialType === '户外' || spatialType === '室外') return 'outdoor';
  const tags = splitTags(scene.tags);
  if (tags.includes('室内') && !tags.includes('户外')) return 'indoor';
  if (tags.includes('户外') && !tags.includes('室内')) return 'outdoor';
  const text = `${scene.spatialType} ${scene.title} ${scene.category} ${scene.tags} ${scene.description}`.toLowerCase();
  if (/outdoor|street|park|garden|beach|nature|户外|室外|街|公园|草坪|海边|外景|露营|阳台外/.test(text)) {
    return 'outdoor';
  }
  return 'indoor';
}

export function classifyVoiceGroup(voice: Pick<SalesVoiceCandidate, 'name' | 'gender' | 'voiceGroup' | 'tags' | 'promptText'>): SalesPersonaGroup {
  if (voice.voiceGroup === 'male' || voice.voiceGroup === 'female' || voice.voiceGroup === 'senior' || voice.voiceGroup === 'child') {
    return voice.voiceGroup;
  }
  const text = `${voice.name} ${voice.tags.join(' ')} ${voice.promptText}`.toLowerCase();
  if (/儿童|童声|小孩|男孩|女孩|少儿|正太|萝莉/.test(text)) return 'child';
  if (/老年|老人|长者|老爷爷|老奶奶|银发|沧桑老/.test(text)) return 'senior';
  if (voice.gender === 'male' || /男声|男神|男士|青年男|大叔/.test(text)) return 'male';
  return 'female';
}

export function salesMaterialCards(catalog: SalesMaterialCatalog): SalesMaterialCard[] {
  return [
    ...catalog.personas.map((p): SalesMaterialCard => {
      const personaGroup = classifyPersonaGroup(p);
      const rawPersonaViews = audienceDimensions(audienceDimensions(p.dimensions).personaViews);
      const mainImage = rawPersonaViews.main;
      const viewUrls = new Set(
        [
          ...Object.values(rawPersonaViews).filter((v): v is string => typeof v === 'string' && Boolean(v.trim())),
          ...(p.sourceImages || []).filter(Boolean),
          p.fullBodyUrl,
          p.faceUrl,
        ].filter(Boolean),
      );
      return {
        key: `persona:${p.id}`,
        id: p.id,
        kind: 'persona',
        personaGroup,
        title: p.name,
        description: p.description,
        tags: splitTags(p.tags),
        image: (typeof mainImage === 'string' && mainImage.trim()) || p.sourceImages?.[0] || p.fullBodyUrl || p.avatarUrl,
        audio: '',
        badge: p.fullBodyUrl && p.faceUrl && p.fullBodyUrl !== p.faceUrl ? '全身 + 人脸' : p.hasReferenceImage ? '单图参考' : '文字人物',
        subBadge: PERSONA_GROUP_LABELS[personaGroup],
        personaViewCount: viewUrls.size,
        sourceImages: p.sourceImages,
        dimensions: p.dimensions,
        editable: p.source === 'persona_library',
      };
    }).sort((a, b) => compareSalesAssetNames(a.title, b.title)),
    ...catalog.scenes.map((s): SalesMaterialCard => {
      const sceneSpace = classifySceneSpace(s);
      return {
        key: `scene:${s.id}`,
        id: s.id,
        kind: 'scene',
        sceneSpace,
        title: s.title,
        description: s.description,
        tags: [s.lighting, ...splitTags(s.tags)].filter(Boolean),
        image: s.coverUrl,
        audio: '',
        badge: s.coverUrl ? '实景参考' : '文字场景',
        subBadge: SCENE_SPACE_LABELS[sceneSpace],
        sourceImages: s.sourceImages,
        editable: true,
      };
    }).sort((a, b) => compareSalesAssetNames(a.title, b.title)),
    ...catalog.actions.map((a, index): SalesMaterialCard => {
      const media = actionMedia(a);
      const depthKind: DepthActionKind = media.video ? 'depth-video' : 'depth-image';
      const productCategoryIds = resolveActionCategoryIds(a);
      const categoryId = productCategoryIds[0] || '';
      const rawTitle = (a.title || '').trim();
      const displayTitle = isMachineGeneratedActionTitle(rawTitle) ? String(index + 1) : rawTitle;
      const angleEntries = !media.video
        ? extractActionAngleEntries({
            dimensions: a.dimensions,
            sourceImages: a.sourceImages,
            coverUrl: a.coverUrl,
            mediaUrl: a.mediaUrl,
          })
        : [];
      return {
        key: `action:${a.id}`,
        id: a.id,
        kind: 'action',
        depthKind,
        categoryId,
        productCategoryIds,
        title: displayTitle,
        description: a.action,
        tags: cleanActionTags(a.tags),
        image: media.video ? a.coverUrl : media.url,
        video: media.video ? media.url : '',
        mediaType: media.type,
        sourceUrl: a.sourceUrl,
        sourceImages: a.sourceImages,
        dimensions: a.dimensions,
        angleEntries,
        audio: '',
        badge: ACTION_MEDIA_LABELS[media.type],
        subBadge: angleEntries.length > 1 ? `${angleEntries.length} 视角` : undefined,
        editable: true,
      };
    }).sort((a, b) => compareSalesAssetNames(a.title, b.title)),
    ...catalog.voices.map((v): SalesMaterialCard => {
      const voiceGroup = classifyVoiceGroup(v);
      return {
        key: `voice:${v.id}`,
        id: v.id,
        kind: 'sound',
        soundType: 'voice',
        voiceGroup,
        title: v.name,
        description: v.promptText || '用于真人口播或画外旁白',
        tags: v.tags,
        image: '',
        audio: v.sampleAudioUrl,
        badge: '人声',
        subBadge: PERSONA_GROUP_LABELS[voiceGroup],
        editable: true,
      };
    }).sort((a, b) => compareSalesAssetNames(a.title, b.title)),
    ...catalog.bgms.map((b): SalesMaterialCard => ({
      key: `bgm:${b.id}`,
      id: b.id,
      kind: 'sound',
      soundType: 'bgm',
      title: b.title,
      description: b.description,
      tags: [...b.moodTags, `${b.bpm} BPM`, b.license],
      editableTags: b.moodTags,
      image: '',
      audio: b.audioUrl,
      durationSec: b.durationSec,
      badge: 'BGM',
      subBadge: `${b.bpm} BPM`,
      editable: Boolean(b.editable || b.source === 'custom_bgm' || b.id.startsWith('bgm_custom_')),
    })).sort((a, b) => compareSalesAssetNames(a.title, b.title)),
  ];
}
