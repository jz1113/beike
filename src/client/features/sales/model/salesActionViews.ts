import { appearanceAudience, audienceDimensions, setAudienceDimensions } from '@shared/domain/assets/appearanceAudience';
import type { SalesPersonaCandidate, SalesSceneCandidate } from '@shared/domain/sales';
import { PERSONA_ANGLES, readSalesAssetCreation, type AssetViewSet } from './salesAssetDraft';

export const PERSONA_GENDERS = [{ id: 'female', label: '女' }, { id: 'male', label: '男' }] as const;
export type PersonaGender = typeof PERSONA_GENDERS[number]['id'];
export const PERSONA_AGES = { young: '青年', middle: '中年', senior: '老年', child: '幼年' } as const;
export type PersonaAge = keyof typeof PERSONA_AGES;
export type PersonaCategory = PersonaGender | `${Exclude<PersonaAge, 'young'>}_${PersonaGender}`;

export function personaCategory(gender: PersonaGender, age: PersonaAge): PersonaCategory {
  return age === 'young' ? gender : `${age}_${gender}`;
}
export function personaGender(category: PersonaCategory): PersonaGender {
  return category.endsWith('female') ? 'female' : 'male';
}
export const PERSONA_CATEGORIES = Object.fromEntries(PERSONA_GENDERS.flatMap(({ id, label }) =>
  Object.entries(PERSONA_AGES).map(([age, name]) => [personaCategory(id, age as PersonaAge), name + label])
)) as Record<PersonaCategory, string>;

export function classifyPersonaGroup(persona: Pick<SalesPersonaCandidate, 'name' | 'tags' | 'description' | 'dimensions'>): PersonaCategory {
  const audience = appearanceAudience(persona);
  const text = [persona.tags, persona.name, persona.description].join(' ');
  const gender = audience.endsWith('_male') ? 'male' : audience.endsWith('_female') ? 'female'
    : /男|爷爷|先生|大叔|大爷|小哥|绅士|子轩|博文/.test(text) && !/女/.test(text) ? 'male' : 'female';
  const adultAge = audienceDimensions(persona.dimensions).personaAge;
  const age = audience.startsWith('child_') ? 'child' : audience.startsWith('senior_') ? 'senior'
    : audience === 'unknown' && /幼年|儿童|童|男孩|女孩|宝宝/.test(text) ? 'child'
    : audience === 'unknown' && /老年|老人|爷爷|奶奶|长者|银发|大爷|大妈/.test(text) ? 'senior'
    : adultAge === 'middle' || (adultAge !== 'young' && /中年/.test(text)) ? 'middle' : 'young';
  return personaCategory(gender, age);
}

export function personaGroupToDimensions(existing: string | undefined, category: PersonaCategory): string {
  const gender = personaGender(category);
  const age = category.includes('_') ? category.split('_')[0] : 'young';
  const audienceAge = age === 'senior' || age === 'child' ? age : 'adult';
  return setAudienceDimensions({ ...audienceDimensions(existing), personaAge: age }, `${audienceAge}_${gender}`);
}

export const PERSONA_VIEWS = [
  { id: 'main', label: '主图', hint: '上传人物参考图' },
  ...PERSONA_ANGLES,
] as const;
export const PERSONA_SHEET_VIEWS = [
  PERSONA_VIEWS[0],
  { id: 'sheet', label: '人物三视图', hint: '正面、侧面、背面与脸部特写整图' },
] as const;
export type PersonaView = typeof PERSONA_VIEWS[number]['id'] | 'sheet';
export type PersonaViews = Record<PersonaView, string>;
export type SupplementView = Exclude<PersonaView, 'main'>;

export function readPersonaViews(persona?: SalesPersonaCandidate): { views: PersonaViews; extraImages: string[] } {
  const saved = audienceDimensions(audienceDimensions(persona?.dimensions).personaViews);
  const urls = [...new Set([...Object.values(saved).filter((url): url is string => typeof url === 'string'), ...(persona?.sourceImages || []), persona?.avatarUrl || ''].filter(Boolean))];
  const hasSavedViews = Object.keys(saved).length > 0;
  const views = Object.fromEntries(PERSONA_VIEWS.map(({ id }) => [id, ''])) as PersonaViews;
  views.sheet = typeof saved.sheet === 'string' ? saved.sheet.trim() : '';
  for (const { id } of PERSONA_VIEWS) views[id] = typeof saved[id] === 'string' ? saved[id].trim() : '';
  if (!hasSavedViews) {
    views.main = urls[0] || '';
    // Historical assets have no angle labels. Only a distinct face anchor is known.
    views.face = persona?.faceUrl && persona.faceUrl !== views.main ? persona.faceUrl : '';
  }
  return { views, extraImages: urls.filter((url) => !Object.values(views).includes(url)) };
}

export function personaImageFields(views: PersonaViews, extraImages: string[], dimensions: string | undefined, group: PersonaCategory, voiceId: string) {
  const previous = audienceDimensions(audienceDimensions(dimensions).personaViews);
  const savedViews = previous.main === views.main ? { ...previous, ...views } : views;
  return {
    avatarUrl: readSalesAssetCreation(dimensions)?.imageUrl === views.main ? views.main : views.face || views.main,
    sourceImages: JSON.stringify([...new Set([...PERSONA_VIEWS.map(({ id }) => views[id]), views.sheet, ...extraImages].filter(Boolean))]),
    dimensions: JSON.stringify({
      ...audienceDimensions(personaGroupToDimensions(dimensions, group)),
      personaViews: savedViews,
      defaultVoiceId: voiceId,
    }),
  };
}

export const SCENE_VIEWS = [
  { id: 'main', label: '主图', hint: '上传场景参考图' },
  { id: 'left', label: '左侧视角', hint: '从左侧观察同一场景' },
  { id: 'right', label: '右侧视角', hint: '从右侧观察同一场景' },
  { id: 'reverse', label: '反向视角', hint: '从对面回看同一场景' },
  { id: 'frontWide', label: '正面全景', hint: '正面展示完整空间' },
  { id: 'leftWide', label: '左侧全景', hint: '左侧展示空间全貌' },
  { id: 'rightWide', label: '右侧全景', hint: '右侧展示空间全貌' },
  { id: 'reverseLeft', label: '左后视角', hint: '从对面左侧回看空间' },
  { id: 'reverseRight', label: '右后视角', hint: '从对面右侧回看空间' },
  { id: 'detail', label: '局部细节', hint: '同一场景的材质与陈设细节' },
] as const;
export type SceneSupplementView = Exclude<typeof SCENE_VIEWS[number]['id'], 'main'>;
export type SceneViews = AssetViewSet<SceneSupplementView>['views'] & { sheet?: string };

export function readSceneViews(scene?: SalesSceneCandidate): { views: SceneViews; extraImages: string[] } {
  const saved = audienceDimensions(audienceDimensions(scene?.dimensions).sceneViews);
  const urls = [...new Set([scene?.coverUrl || '', ...(scene?.sourceImages || [])].filter(Boolean))];
  const views = Object.fromEntries(SCENE_VIEWS.map(({ id }) => [id, ''])) as SceneViews;
  for (const { id } of SCENE_VIEWS) views[id] = typeof saved[id] === 'string' ? saved[id].trim() : '';
  if (typeof saved.sheet === 'string' && saved.sheet.trim()) views.sheet = saved.sheet.trim();
  if (!Object.keys(saved).length) views.main = urls[0] || '';
  return { views, extraImages: urls.filter((url) => !Object.values(views).includes(url)) };
}

export function sceneImageFields(views: SceneViews, extraImages: string[], dimensions?: string) {
  const sheet = typeof views.sheet === 'string' ? views.sheet.trim() : '';
  return {
    coverUrl: sheet || views.main,
    sourceImages: JSON.stringify([...new Set([sheet, ...SCENE_VIEWS.map(({ id }) => views[id]), ...extraImages].filter(Boolean))]),
    dimensions: JSON.stringify({ ...audienceDimensions(dimensions), sceneViews: views }),
  };
}

export const POSE_ANGLE_ORDER = ['front', 'diagonal', 'side', 'high', 'low'] as const;

export const POSE_ANGLE_SHORT_LABELS: Record<string, string> = {
  front: '正',
  diagonal: '斜',
  side: '侧',
  high: '俯',
  low: '仰',
};

export const POSE_ANGLE_FULL_LABELS: Record<string, string> = {
  front: '正面平视',
  diagonal: '斜侧 45°',
  side: '侧面 90°',
  high: '俯视机位',
  low: '仰视机位',
};

export interface ActionAngleEntry {
  angle: string;
  shortLabel: string;
  label: string;
  url: string;
  isDefault: boolean;
}

export function extractActionAngleEntries(input: {
  dimensions?: string;
  sourceImages?: readonly string[];
  coverUrl?: string;
  mediaUrl?: string;
}): ActionAngleEntry[] {
  const dims = audienceDimensions(input.dimensions);
  const rawViews = dims.actionViews;
  const primaryUrl = (input.mediaUrl || input.coverUrl || '').trim();
  const explicitDefault = typeof dims.defaultAngle === 'string' ? dims.defaultAngle.trim() : '';

  if (rawViews && typeof rawViews === 'object' && !Array.isArray(rawViews)) {
    const viewMap = rawViews as Record<string, unknown>;
    const entries: ActionAngleEntry[] = [];
    const seenAngles = new Set<string>();

    const appendAngle = (angle: string) => {
      const val = viewMap[angle];
      if (typeof val !== 'string' || !val.trim() || seenAngles.has(angle)) return;
      seenAngles.add(angle);
      const url = val.trim();
      const isDefault = explicitDefault ? angle === explicitDefault : url === primaryUrl;
      entries.push({
        angle,
        shortLabel: POSE_ANGLE_SHORT_LABELS[angle] || angle.slice(0, 2).toUpperCase(),
        label: POSE_ANGLE_FULL_LABELS[angle] || angle,
        url,
        isDefault,
      });
    };

    for (const angle of POSE_ANGLE_ORDER) {
      appendAngle(angle);
    }
    for (const angle of Object.keys(viewMap)) {
      appendAngle(angle);
    }
    if (entries.length > 0 && !entries.some((item) => item.isDefault)) {
      entries[0] = { ...entries[0], isDefault: true };
    }
    if (entries.length > 1) return entries;
  }

  const sources = (input.sourceImages || []).map((item) => item.trim()).filter(Boolean);
  if (sources.length > 1) {
    return sources.map((url, idx) => {
      const fallbackAngle = POSE_ANGLE_ORDER[idx] || `view_${idx + 1}`;
      return {
        angle: fallbackAngle,
        shortLabel: `${idx + 1}`,
        label: `视角 ${idx + 1}`,
        url,
        isDefault: primaryUrl ? url === primaryUrl : idx === 0,
      };
    });
  }
  return [];
}

