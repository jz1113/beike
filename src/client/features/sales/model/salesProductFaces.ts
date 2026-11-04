import type { SalesReferenceSlot } from '@shared/domain/sales';

export interface FaceRegion { x: number; y: number; width: number; height: number }
export interface ProductFaceEdit { url: string; regions: FaceRegion[] }
export type ProductFaceEdits = Record<string, ProductFaceEdit>;

export function isProductFaceSource(slot: SalesReferenceSlot) {
  const roles = [slot.kind, ...(slot.roles || [])];
  return slot.mediaType !== 'video' && roles.includes('product') && !roles.some((role) => role.startsWith('persona_'));
}

export function productFaceReferences(slots: readonly SalesReferenceSlot[], edits: ProductFaceEdits) {
  return slots.map((slot) => isProductFaceSource(slot) && Object.hasOwn(edits, slot.url) && edits[slot.url].url !== slot.url
    ? { ...slot, url: edits[slot.url].url } : slot);
}

function validRegion(value: unknown): value is FaceRegion {
  if (!value || typeof value !== 'object') return false;
  const { x, y, width, height } = value as FaceRegion;
  return [x, y, width, height].every(Number.isFinite) && x >= 0 && y >= 0 && width > 0 && height > 0
    && x + width <= 1.000001 && y + height <= 1.000001;
}

export function parseProductFaceEdits(raw: unknown): ProductFaceEdits {
  if (!raw || typeof raw !== 'object') return {};
  return Object.fromEntries(Object.entries(raw).filter(([source, edit]) =>
    source && edit && typeof edit.url === 'string' && edit.url && Array.isArray(edit.regions) && edit.regions.every(validRegion)
    && (edit.regions.length ? edit.url !== source : edit.url === source)));
}
