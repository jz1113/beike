import type { SalesPersonaCandidate } from '@shared/domain/sales';
import type { SalesProductionPlanState } from './salesProductionDraft';

type PersonaBinding = Pick<SalesProductionPlanState, 'personaId' | 'customPersonaBodyUrl' | 'customPersonaFaceUrl'>;

export function hasCustomSalesPersona(plan: PersonaBinding): boolean {
  return Boolean(plan.customPersonaBodyUrl.trim() || plan.customPersonaFaceUrl.trim());
}

export function salesPersonaBindingKey(plan: PersonaBinding): string {
  return JSON.stringify(hasCustomSalesPersona(plan)
    ? ['custom', plan.customPersonaBodyUrl.trim(), plan.customPersonaFaceUrl.trim()]
    : ['library', plan.personaId]);
}

/** Resolve only the selected identity; a recommendation is never an implicit replacement. */
export function selectedSalesPersona(plan: PersonaBinding, personas: readonly SalesPersonaCandidate[]): SalesPersonaCandidate | null {
  if (hasCustomSalesPersona(plan)) return null;
  return personas.find((persona) => persona.id === plan.personaId) || null;
}

/** Custom anchors form one independent binding, including a single uploaded image. */
export function salesPersonaReferenceUrls(plan: PersonaBinding, persona: SalesPersonaCandidate | null) {
  if (hasCustomSalesPersona(plan)) {
    return { bodyUrl: plan.customPersonaBodyUrl.trim(), faceUrl: plan.customPersonaFaceUrl.trim() };
  }
  return { bodyUrl: persona?.fullBodyUrl || persona?.avatarUrl || '', faceUrl: persona?.faceUrl || persona?.avatarUrl || '' };
}

export function uploadSalesPersonaReference(plan: PersonaBinding, target: 'personaBody' | 'personaFace', url: string): Partial<SalesProductionPlanState> {
  return {
    personaId: '',
    customPersonaBodyUrl: target === 'personaBody' ? url : plan.customPersonaBodyUrl,
    customPersonaFaceUrl: target === 'personaFace' ? url : plan.customPersonaFaceUrl,
    customPrompt: '',
  };
}

export function salesPersonaDescription(plan: PersonaBinding, persona: SalesPersonaCandidate | null): string {
  if (hasCustomSalesPersona(plan)) return '用户上传的自定义出镜人物，身份和外貌以本次上传的人物参考图为准';
  return persona ? [persona.name, persona.description.trim(), persona.tags.trim() ? `人物风格标签：${persona.tags.trim()}` : ''].filter(Boolean).join('；') : '尚未绑定出镜人物参考';
}
