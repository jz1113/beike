import { audienceDimensions } from '@shared/domain/assets/appearanceAudience';
import type { SalesPersonaCandidate } from '@shared/domain/sales';
import { personaGroupToDimensions, type SalesPersonaGroup } from './salesMaterialCatalog';

export const PERSONA_VIEWS = [
  { id: 'main', label: '主图', hint: '上传人物参考图' },
  { id: 'face', label: '脸部', hint: '清晰的面部近景' },
  { id: 'front', label: '正身', hint: '正面完整身形' },
  { id: 'side', label: '左侧身', hint: '人物左侧完整身形' },
  { id: 'threeQuarterLeft', label: '左前侧', hint: '左前方四十五度全身' },
  { id: 'threeQuarterRight', label: '右前侧', hint: '右前方四十五度全身' },
  { id: 'back', label: '背身', hint: '背面完整身形' },
  { id: 'sideRight', label: '右侧身', hint: '人物右侧完整身形' },
  { id: 'upperBody', label: '半身', hint: '正面头部到腰部' },
  { id: 'backThreeQuarter', label: '后侧身', hint: '后方四十五度全身' },
] as const;
export type PersonaView = typeof PERSONA_VIEWS[number]['id'];
export type PersonaViews = Record<PersonaView, string>;
export type SupplementView = Exclude<PersonaView, 'main'>;

export function readPersonaViews(persona?: SalesPersonaCandidate): { views: PersonaViews; extraImages: string[] } {
  const saved = audienceDimensions(audienceDimensions(persona?.dimensions).personaViews);
  const urls = [...new Set([...(persona?.sourceImages || []), persona?.avatarUrl || ''].filter(Boolean))];
  const hasSavedViews = Object.keys(saved).length > 0;
  const views = Object.fromEntries(PERSONA_VIEWS.map(({ id }) => [id, ''])) as PersonaViews;
  for (const { id } of PERSONA_VIEWS) views[id] = typeof saved[id] === 'string' ? saved[id].trim() : '';
  if (!hasSavedViews) {
    views.main = urls[0] || '';
    // Historical assets have no angle labels. Only a distinct face anchor is known.
    views.face = persona?.faceUrl && persona.faceUrl !== views.main ? persona.faceUrl : '';
  }
  return { views, extraImages: urls.filter((url) => !Object.values(views).includes(url)) };
}

export function personaImageFields(views: PersonaViews, extraImages: string[], dimensions: string | undefined, group: SalesPersonaGroup, voiceId: string) {
  return {
    avatarUrl: views.face || views.main,
    sourceImages: JSON.stringify([...new Set([...PERSONA_VIEWS.map(({ id }) => views[id]), ...extraImages].filter(Boolean))]),
    dimensions: JSON.stringify({
      ...audienceDimensions(personaGroupToDimensions(dimensions, group)),
      personaViews: views,
      defaultVoiceId: voiceId,
    }),
  };
}

