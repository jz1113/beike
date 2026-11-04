import { type PersonaCategory, personaGroupToDimensions } from './salesPersonaClassification';
import { audienceDimensions } from '@shared/domain/assets/appearanceAudience';
import type { SalesPersonaCandidate } from '@shared/domain/sales';
import { readSalesAssetCreation } from './salesAssetCreation';
import { PERSONA_ANGLES } from './salesAssetViews';

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

