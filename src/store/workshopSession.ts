import type { ShotPrompt, PreviousGroupSignature } from '@/lib/vision';
import type { OriginalLookParts, OriginalProductRole } from '@/lib/drawing';
import type { ProductImage } from '@/types';
import type { GenerationTask } from '@/types/app-store';
import type { WorkshopMode, WorkshopModeSession } from './types';

export type { WorkshopMode, WorkshopModeSession };

const DEFAULT_PERSONA = '🌸 亚洲清纯甜美女生 (日常精致微表情、自然裸妆感)';

function readPersonaPref(mode: WorkshopMode): string {
  if (typeof window === 'undefined') return DEFAULT_PERSONA;
  const key = mode === 'social_face_product_swap'
    ? 'drawing_model_persona_social'
    : 'drawing_model_persona_original';
  try {
    return localStorage.getItem(key) || localStorage.getItem('drawing_model_persona') || DEFAULT_PERSONA;
  } catch {
    return DEFAULT_PERSONA;
  }
}

export function createDefaultWorkshopSession(mode: WorkshopMode): WorkshopModeSession {
  return {
    currentStep: 1,
    product: null,
    images: [],
    apiUsed: null,
    clonedSocialImages: [],
    socialGalleryTab: 'social',
    generatedPrompts: [],
    shotCount: 4,
    extraRequirements: '',
    selectedStyleId: 'computer_office_monitor',
    productFingerprint: '',
    productRole: null,
    masterScene: '',
    lookBible: '',
    identityBible: '',
    styleBible: '',
    lookParts: null,
    previousMasterScenes: [],
    previousGroupSignatures: [],
    sceneAnchorEnabled: true,
    socialPromptSourceKey: '',
    modelPersona: readPersonaPref(mode),
    generationTasks: [],
    selectedAspectId: '3:4',
    selectedQuality: 'high',
    useReferenceImage: true,
    isBatchGenerating: false,
  };
}

/** 从 flat workshop state 抽出当前模式的会话快照 */
export function extractWorkshopModeSession(state: {
  currentStep: number;
  product: any | null;
  images: ProductImage[];
  apiUsed: string | null;
  clonedSocialImages: { url: string; selected: boolean }[];
  socialGalleryTab: 'social' | 'product';
  generatedPrompts: ShotPrompt[];
  shotCount: number;
  extraRequirements: string;
  selectedStyleId: string;
  productFingerprint: string;
  productRole: OriginalProductRole | null;
  masterScene: string;
  lookBible: string;
  identityBible: string;
  styleBible: string;
  lookParts: OriginalLookParts | null;
  previousMasterScenes: string[];
  previousGroupSignatures: PreviousGroupSignature[];
  sceneAnchorEnabled: boolean;
  socialPromptSourceKey: string;
  modelPersona: string;
  generationTasks: GenerationTask[];
  selectedAspectId: string;
  selectedQuality: 'high' | 'medium' | 'low';
  useReferenceImage: boolean;
  isBatchGenerating: boolean;
}): WorkshopModeSession {
  return {
    currentStep: state.currentStep,
    product: state.product,
    images: state.images,
    apiUsed: state.apiUsed,
    clonedSocialImages: state.clonedSocialImages,
    socialGalleryTab: state.socialGalleryTab,
    generatedPrompts: state.generatedPrompts,
    shotCount: state.shotCount,
    extraRequirements: state.extraRequirements,
    selectedStyleId: state.selectedStyleId,
    productFingerprint: state.productFingerprint,
    productRole: state.productRole,
    masterScene: state.masterScene,
    lookBible: state.lookBible,
    identityBible: state.identityBible,
    styleBible: state.styleBible,
    lookParts: state.lookParts,
    previousMasterScenes: [...(state.previousMasterScenes || [])],
    previousGroupSignatures: [...(state.previousGroupSignatures || [])],
    sceneAnchorEnabled: state.sceneAnchorEnabled,
    socialPromptSourceKey: state.socialPromptSourceKey,
    modelPersona: state.modelPersona,
    generationTasks: state.generationTasks,
    selectedAspectId: state.selectedAspectId,
    selectedQuality: state.selectedQuality,
    useReferenceImage: state.useReferenceImage,
    isBatchGenerating: state.isBatchGenerating,
  };
}

/** 将会话快照写回 flat workshop state（组件仍读 flat 字段） */
export function applyWorkshopModeSession(
  session: WorkshopModeSession,
): WorkshopModeSession {
  return { ...session };
}

export function workshopModeSessionKey(mode: WorkshopMode): 'socialSessionCache' | 'originalSessionCache' {
  return mode === 'social_face_product_swap' ? 'socialSessionCache' : 'originalSessionCache';
}

export function persistModePersonaPref(mode: WorkshopMode, persona: string) {
  if (typeof window === 'undefined') return;
  const key = mode === 'social_face_product_swap'
    ? 'drawing_model_persona_social'
    : 'drawing_model_persona_original';
  try {
    localStorage.setItem(key, persona);
  } catch {}
}

/** 从 sessionStorage draft 恢复会话（缺失字段回落默认值） */
export function hydrateWorkshopSessionFromDraft(
  mode: WorkshopMode,
  draft: Record<string, unknown> | null | undefined,
): WorkshopModeSession {
  const base = createDefaultWorkshopSession(mode);
  if (!draft) return base;
  return {
    ...base,
    currentStep: typeof draft.currentStep === 'number' ? draft.currentStep : base.currentStep,
    product: draft.product ?? base.product,
    images: Array.isArray(draft.images) ? draft.images as ProductImage[] : base.images,
    apiUsed: typeof draft.apiUsed === 'string' ? draft.apiUsed : base.apiUsed,
    clonedSocialImages: Array.isArray(draft.clonedSocialImages)
      ? draft.clonedSocialImages as WorkshopModeSession['clonedSocialImages']
      : base.clonedSocialImages,
    socialGalleryTab: draft.socialGalleryTab === 'product' ? 'product' : 'social',
    generatedPrompts: Array.isArray(draft.generatedPrompts)
      ? draft.generatedPrompts as ShotPrompt[]
      : base.generatedPrompts,
    shotCount: typeof draft.shotCount === 'number' ? draft.shotCount : base.shotCount,
    extraRequirements: typeof draft.extraRequirements === 'string' ? draft.extraRequirements : base.extraRequirements,
    selectedStyleId: typeof draft.selectedStyleId === 'string' ? draft.selectedStyleId : base.selectedStyleId,
    productFingerprint: typeof draft.productFingerprint === 'string' ? draft.productFingerprint : base.productFingerprint,
    productRole: (draft.productRole as OriginalProductRole | null) ?? base.productRole,
    masterScene: typeof draft.masterScene === 'string' ? draft.masterScene : base.masterScene,
    lookBible: typeof draft.lookBible === 'string' ? draft.lookBible : base.lookBible,
    identityBible: typeof draft.identityBible === 'string' ? draft.identityBible : base.identityBible,
    styleBible: typeof draft.styleBible === 'string' ? draft.styleBible : base.styleBible,
    lookParts: (draft.lookParts as OriginalLookParts | null) ?? base.lookParts,
    previousMasterScenes: Array.isArray(draft.previousMasterScenes)
      ? draft.previousMasterScenes as string[]
      : base.previousMasterScenes,
    previousGroupSignatures: Array.isArray(draft.previousGroupSignatures)
      ? draft.previousGroupSignatures as PreviousGroupSignature[]
      : base.previousGroupSignatures,
    sceneAnchorEnabled: draft.sceneAnchorEnabled !== false,
    socialPromptSourceKey: typeof draft.socialPromptSourceKey === 'string'
      ? draft.socialPromptSourceKey
      : base.socialPromptSourceKey,
    modelPersona: typeof draft.modelPersona === 'string' && draft.modelPersona
      ? draft.modelPersona
      : base.modelPersona,
    generationTasks: Array.isArray(draft.generationTasks)
      ? draft.generationTasks as GenerationTask[]
      : base.generationTasks,
    selectedAspectId: typeof draft.selectedAspectId === 'string' ? draft.selectedAspectId : base.selectedAspectId,
    selectedQuality: draft.selectedQuality === 'medium' || draft.selectedQuality === 'low'
      ? draft.selectedQuality
      : base.selectedQuality,
    useReferenceImage: draft.useReferenceImage !== false,
    isBatchGenerating: Boolean(draft.isBatchGenerating),
  };
}
