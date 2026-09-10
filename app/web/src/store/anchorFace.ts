export const SOCIAL_ANCHOR_FACE_LS_KEY = 'anchor_face_image_url';
export const ORIGINAL_ANCHOR_FACE_LS_KEY = 'original_anchor_face_image_url';

export function isOriginalWorkshopMode(mode: string | undefined) {
  return mode === 'storyboard_generate';
}

export function pickEffectiveAnchorFaceImageUrl(state: {
  workshopMode: string;
  anchorFaceImageUrl?: string;
  originalAnchorFaceImageUrl?: string;
}) {
  return isOriginalWorkshopMode(state.workshopMode)
    ? state.originalAnchorFaceImageUrl
    : state.anchorFaceImageUrl;
}

export function pickEffectiveIsAnchorFaceConfirmed(state: {
  workshopMode: string;
  isAnchorFaceConfirmed: boolean;
  originalIsAnchorFaceConfirmed: boolean;
}) {
  return isOriginalWorkshopMode(state.workshopMode)
    ? state.originalIsAnchorFaceConfirmed
    : state.isAnchorFaceConfirmed;
}

export function persistAnchorFaceToStorage(isOriginal: boolean, url?: string) {
  if (typeof window === 'undefined') return;
  const key = isOriginal ? ORIGINAL_ANCHOR_FACE_LS_KEY : SOCIAL_ANCHOR_FACE_LS_KEY;
  try {
    if (url) localStorage.setItem(key, url);
    else localStorage.removeItem(key);
  } catch {}
}
