import type { ShotPrompt, PreviousGroupSignature } from '@beike/domain/vision';
import type { OriginalLookParts, OriginalProductRole } from '@beike/domain/drawing';
import type { ProductImage, ProductData, ProductWidgetData } from '@/types';
import type { GenerationTask } from '@/store/appStoreTypes';
import type { WorkshopMode, WorkshopModeSession } from '@/store/types';

export type { WorkshopMode, WorkshopModeSession };

const DEFAULT_PERSONA = '🌸 亚洲清纯甜美女生 (日常精致微表情、自然裸妆感)';

function readPersonaPref(_mode: WorkshopMode): string {
  void _mode;
  if (typeof window === 'undefined') return DEFAULT_PERSONA;
  const key = 'drawing_model_persona_original';
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
    workshopTasks: [],
    selectedAspectId: '3:4',
    selectedQuality: 'high',
    useReferenceImage: true,
    isBatchGenerating: false,
    copywritingTitle: '',
    copywritingContent: '',
    copywritingFull: '',
  };
}

/** 从 flat workshop state 抽出当前模式的会话快照 */
export function extractWorkshopModeSession(state: WorkshopModeSession): WorkshopModeSession {
  return {
    currentStep: state.currentStep,
    product: state.product,
    images: state.images,
    apiUsed: state.apiUsed,
    clonedSocialImages: state.clonedSocialImages,
    socialGalleryTab: state.socialGalleryTab,
    generatedPrompts: state.generatedPrompts,
    shotCount: state.shotCount,
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
    workshopTasks: state.workshopTasks,
    selectedAspectId: state.selectedAspectId,
    selectedQuality: state.selectedQuality,
    useReferenceImage: state.useReferenceImage,
    isBatchGenerating: state.isBatchGenerating,
    copywritingTitle: state.copywritingTitle || '',
    copywritingContent: state.copywritingContent || '',
    copywritingFull: state.copywritingFull || '',
  };
}

/** 高性能浅层 + 引用比对，避免在高频 state 变更时对大对象全量 JSON.stringify */
export function areWorkshopSessionsEqual(
  a: WorkshopModeSession,
  b: WorkshopModeSession,
): boolean {
  if (a === b) return true;
  if (
    a.currentStep !== b.currentStep ||
    a.apiUsed !== b.apiUsed ||
    a.socialGalleryTab !== b.socialGalleryTab ||
    a.shotCount !== b.shotCount ||
    a.productFingerprint !== b.productFingerprint ||
    a.productRole !== b.productRole ||
    a.masterScene !== b.masterScene ||
    a.lookBible !== b.lookBible ||
    a.identityBible !== b.identityBible ||
    a.styleBible !== b.styleBible ||
    a.sceneAnchorEnabled !== b.sceneAnchorEnabled ||
    a.socialPromptSourceKey !== b.socialPromptSourceKey ||
    a.modelPersona !== b.modelPersona ||
    a.selectedAspectId !== b.selectedAspectId ||
    a.selectedQuality !== b.selectedQuality ||
    a.useReferenceImage !== b.useReferenceImage ||
    a.isBatchGenerating !== b.isBatchGenerating
  ) {
    return false;
  }

  if (a.product !== b.product && JSON.stringify(a.product) !== JSON.stringify(b.product)) return false;
  if (a.images !== b.images && JSON.stringify(a.images) !== JSON.stringify(b.images)) return false;
  if (a.clonedSocialImages !== b.clonedSocialImages && JSON.stringify(a.clonedSocialImages) !== JSON.stringify(b.clonedSocialImages)) return false;
  if (a.generatedPrompts !== b.generatedPrompts && JSON.stringify(a.generatedPrompts) !== JSON.stringify(b.generatedPrompts)) return false;
  if (a.lookParts !== b.lookParts && JSON.stringify(a.lookParts) !== JSON.stringify(b.lookParts)) return false;
  if (a.workshopTasks !== b.workshopTasks) {
    const at = a.workshopTasks;
    const bt = b.workshopTasks;
    if (at.length !== bt.length) return false;
    for (let i = 0; i < at.length; i += 1) {
      if (at[i] === bt[i]) continue;
      if (at[i].id !== bt[i].id || at[i].status !== bt[i].status || at[i].resultUrl !== bt[i].resultUrl) {
        return false;
      }
    }
  }
  if (a.previousMasterScenes !== b.previousMasterScenes && JSON.stringify(a.previousMasterScenes) !== JSON.stringify(b.previousMasterScenes)) return false;
  if (a.previousGroupSignatures !== b.previousGroupSignatures && JSON.stringify(a.previousGroupSignatures) !== JSON.stringify(b.previousGroupSignatures)) return false;

  return true;
}

/** 将会话快照写回 flat workshop state（组件仍读 flat 字段） */
export function applyWorkshopModeSession(
  session: WorkshopModeSession,
): WorkshopModeSession {
  return { ...session };
}

export function workshopModeSessionKey(_mode: WorkshopMode): 'socialSessionCache' | 'originalSessionCache' {
  void _mode;
  return 'originalSessionCache';
}

export function persistModePersonaPref(_mode: WorkshopMode, persona: string) {
  void _mode;
  if (typeof window === 'undefined') return;
  const key = 'drawing_model_persona_original';
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
    product: (draft.product as ProductWidgetData | ProductData | null) ?? base.product,
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
    workshopTasks: Array.isArray(draft.workshopTasks)
      ? draft.workshopTasks as GenerationTask[]
      : Array.isArray(draft.generationTasks)
        ? draft.generationTasks as GenerationTask[]
        : base.workshopTasks,
    selectedAspectId: typeof draft.selectedAspectId === 'string' ? draft.selectedAspectId : base.selectedAspectId,
    selectedQuality: draft.selectedQuality === 'medium' || draft.selectedQuality === 'low'
      ? draft.selectedQuality
      : base.selectedQuality,
    useReferenceImage: draft.useReferenceImage !== false,
    isBatchGenerating: Boolean(draft.isBatchGenerating),
    copywritingTitle: typeof draft.copywritingTitle === 'string' ? draft.copywritingTitle : base.copywritingTitle,
    copywritingContent: typeof draft.copywritingContent === 'string' ? draft.copywritingContent : base.copywritingContent,
    copywritingFull: typeof draft.copywritingFull === 'string' ? draft.copywritingFull : base.copywritingFull,
  };
}
