import { eligibleSalesImages } from '@shared/domain/sales';
import type { SalesCollectionState } from './salesCollectionDraft';

export interface SalesOCRProgress {
  current: number;
  total: number;
  imageUrl: string;
  completed: number;
  succeeded: number;
  failed: number;
}
export interface SalesOCRReport {
  status: 'completed' | 'stopped';
  succeeded: number;
  failed: number;
  remaining: number;
  message?: string;
}

export function salesWorkflow(state: SalesCollectionState) {
  const references = eligibleSalesImages(state.imageCatalog, state.colorSelection, state.variantMetadata);
  const selected = new Set(state.ocrImageUrls);
  const entries = new Map(state.ocrImages.map((entry) => [entry.imageUrl, entry]));
  const images = state.imageCatalog.filter((image) => selected.has(image.url));
  const failed = images.filter((image) => entries.get(image.url)?.error);
  const completed = images.filter((image) => !image.unavailable && entries.get(image.url)?.result && !entries.get(image.url)?.error);
  const pending = images.filter((image) => !image.unavailable && (!entries.get(image.url)?.result || entries.get(image.url)?.error));
  const blocked = images.filter((image) => image.unavailable);
  const withText = completed.filter((image) => entries.get(image.url)!.editedText.trim());
  const confirmed = withText.filter((image) => entries.get(image.url)!.confirmedText === entries.get(image.url)!.editedText.trim());
  const review = withText.filter((image) => !confirmed.includes(image));
  const ready = references.length > 0 && withText.length > 0 && !pending.length && !failed.length && !blocked.length;
  return { references, images, failed, completed, pending, blocked, withText, confirmed, review, ready };
}
