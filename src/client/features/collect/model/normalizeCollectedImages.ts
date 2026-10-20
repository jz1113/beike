import { normalizeCollectedProductImages, type CollectedImageInput } from '@shared/domain/collection/productImages';

/** Shared complete image mapping for single-product and batch collection. */
export function normalizeCollectedImages(data: CollectedImageInput) {
  return normalizeCollectedProductImages(data);
}
