import type { ShotPrompt, PreviousGroupSignature } from '@beike/domain/vision';
import type { OriginalLookParts } from '@beike/domain/drawing';
import type { ProductImage } from '@/types';
import type { GenerationTask } from '@/types/app-store';
import { sanitizeTaskForStorage } from './generation';

export const STUDIO_DRAFT_KEY = 'workshop_studio_draft';
export const STUDIO_DRAFT_SOCIAL_KEY = 'workshop_social_draft';
export const STUDIO_DRAFT_ORIGINAL_KEY = 'workshop_original_draft';

const LEGACY_STUDIO_DRAFT_KEYS: Record<string, string> = {
  buyer_show_studio_draft: STUDIO_DRAFT_KEY,
  buyer_show_social_draft: STUDIO_DRAFT_SOCIAL_KEY,
  buyer_show_original_draft: STUDIO_DRAFT_ORIGINAL_KEY,
};

export function migrateLegacyWorkshopDraftKeys() {
  if (typeof window === 'undefined') return;
  try {
    for (const [oldKey, newKey] of Object.entries(LEGACY_STUDIO_DRAFT_KEYS)) {
      const val = sessionStorage.getItem(oldKey);
      if (val && !sessionStorage.getItem(newKey)) {
        sessionStorage.setItem(newKey, val);
      }
      sessionStorage.removeItem(oldKey);
    }
  } catch {}
}

let saveStudioDraftTimer: ReturnType<typeof setTimeout> | null = null;

function sanitizeStudioUrl(url?: string) {
  if (!url) return url;
  if (url.startsWith('data:') && url.length > 800) {
    return undefined;
  }
  return url;
}

export function buildSocialPromptSourceKey(
  cloned: { url: string; selected?: boolean }[]
): string {
  return cloned
    .filter((i) => i.selected !== false && i.url)
    .map((i) => i.url.trim())
    .join('|');
}

export function invalidateSocialPromptsIfNeeded(
  state: {
    generatedPrompts: ShotPrompt[];
    socialPromptSourceKey: string;
    clonedSocialImages: { url: string; selected: boolean }[];
  },
  nextCloned: { url: string; selected: boolean }[]
): Partial<{
  generatedPrompts: ShotPrompt[];
  workshopTasks: GenerationTask[];
  socialPromptSourceKey: string;
}> {
  const nextKey = buildSocialPromptSourceKey(nextCloned);
  if (!state.socialPromptSourceKey || state.generatedPrompts.length === 0) {
    return {};
  }
  if (nextKey === state.socialPromptSourceKey) {
    return {};
  }
  return {
    generatedPrompts: [],
    workshopTasks: [],
    socialPromptSourceKey: '',
  };
}

export function persistStudioDraftToStorage(state: {
  currentStep: number;
  product: unknown;
  images: ProductImage[];
  apiUsed: string | null;
  generatedPrompts: ShotPrompt[];
  workshopTasks: GenerationTask[];
  clonedSocialImages: { url: string; selected: boolean }[];
  workshopMode: string;
  shotCount: number;
  selectedAspectId: string;
  selectedQuality: string;
  useReferenceImage: boolean;
  productFingerprint: string;
  productRole?: string | null;
  anchorFaceImageUrl?: string;
  socialPromptSourceKey?: string;
  masterScene?: string;
  lookBible?: string;
  identityBible?: string;
  styleBible?: string;
  lookParts?: OriginalLookParts | null;
  previousMasterScenes?: string[];
  previousGroupSignatures?: PreviousGroupSignature[];
  sceneAnchorEnabled?: boolean;
  socialGalleryTab?: 'social' | 'product';
  modelPersona?: string;
  isBatchGenerating?: boolean;
}) {
  persistWorkshopModeDraftToStorage('storyboard_generate', state);
}

function studioDraftStorageKey(mode: 'storyboard_generate') {
  return STUDIO_DRAFT_ORIGINAL_KEY;
}

export function persistWorkshopModeDraftToStorage(
  mode: 'storyboard_generate',
  state: {
    currentStep: number;
    product: unknown;
    images: ProductImage[];
    apiUsed: string | null;
    generatedPrompts: ShotPrompt[];
    workshopTasks: GenerationTask[];
    clonedSocialImages: { url: string; selected: boolean }[];
    shotCount: number;
    selectedAspectId: string;
    selectedQuality: string;
    useReferenceImage: boolean;
    productFingerprint: string;
    productRole?: string | null;
    socialPromptSourceKey?: string;
    masterScene?: string;
    lookBible?: string;
    identityBible?: string;
    styleBible?: string;
    lookParts?: OriginalLookParts | null;
    previousMasterScenes?: string[];
    previousGroupSignatures?: PreviousGroupSignature[];
    sceneAnchorEnabled?: boolean;
    socialGalleryTab?: 'social' | 'product';
    modelPersona?: string;
    isBatchGenerating?: boolean;
  },
) {
  if (typeof window === 'undefined') return;
  if (saveStudioDraftTimer) clearTimeout(saveStudioDraftTimer);
  saveStudioDraftTimer = setTimeout(() => {
    try {
      const draft = {
        currentStep: state.currentStep,
        product: state.product,
        images: (state.images || []).map((img) => ({ ...img, url: sanitizeStudioUrl(img.url) || '' })).filter((img) => img.url),
        apiUsed: state.apiUsed,
        generatedPrompts: state.generatedPrompts,
        generationTasks: (state.workshopTasks || []).map((t) => ({
          ...sanitizeTaskForStorage(t),
          resultUrl: sanitizeStudioUrl(t.resultUrl),
          referenceImageUrl: sanitizeStudioUrl(t.referenceImageUrl),
        })),
        clonedSocialImages: (state.clonedSocialImages || [])
          .map((i) => ({ ...i, url: sanitizeStudioUrl(i.url) || '' }))
          .filter((i) => i.url),
        shotCount: state.shotCount,
        selectedAspectId: state.selectedAspectId,
        selectedQuality: state.selectedQuality,
        useReferenceImage: state.useReferenceImage,
        productFingerprint: state.productFingerprint,
        productRole: state.productRole || null,
        socialPromptSourceKey: state.socialPromptSourceKey || '',
        masterScene: state.masterScene || '',
        lookBible: state.lookBible || '',
        identityBible: state.identityBible || '',
        styleBible: state.styleBible || '',
        lookParts: state.lookParts || null,
        previousMasterScenes: (state.previousMasterScenes || []).slice(0, 2),
        previousGroupSignatures: (state.previousGroupSignatures || []).slice(0, 3),
        sceneAnchorEnabled: state.sceneAnchorEnabled !== false,
        socialGalleryTab: state.socialGalleryTab || 'social',
        modelPersona: state.modelPersona || '',
        isBatchGenerating: Boolean(state.isBatchGenerating),
        savedAt: Date.now(),
      };
      sessionStorage.setItem(studioDraftStorageKey(mode), JSON.stringify(draft));
    } catch {
      try {
        sessionStorage.removeItem(studioDraftStorageKey(mode));
      } catch {}
    }
  }, 200);
}

export function getStoredWorkshopModeDraft(
  mode: 'storyboard_generate',
) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(studioDraftStorageKey(mode));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getStoredStudioDraft() {
  return getStoredWorkshopModeDraft('storyboard_generate');
}

export function clearWorkshopStudioDraft() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(STUDIO_DRAFT_KEY);
    sessionStorage.removeItem(STUDIO_DRAFT_SOCIAL_KEY);
    sessionStorage.removeItem(STUDIO_DRAFT_ORIGINAL_KEY);
  } catch {}
}
