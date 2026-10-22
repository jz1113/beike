export interface PetPoint { x: number; y: number }
export interface PetSize { width: number; height: number }
export interface PetBounds extends PetSize { top: number; right: number; bottom: number; left: number }
export const PET_POSITION_KEY = 'beike.pet.position.v1';
export const LEGACY_PET_POSITION_KEY = 'beike.headline-poster.pet-position.v1';
export const PET_DRAG_THRESHOLD = 5;

export function clampPetPosition(point: PetPoint, size: PetSize, bounds: PetBounds): PetPoint {
  const maxX = Math.max(bounds.left, bounds.width - bounds.right - size.width);
  const maxY = Math.max(bounds.top, bounds.height - bounds.bottom - size.height);
  return {
    x: Math.min(maxX, Math.max(bounds.left, Number.isFinite(point.x) ? point.x : maxX)),
    y: Math.min(maxY, Math.max(bounds.top, Number.isFinite(point.y) ? point.y : maxY)),
  };
}

function readStoredPoint(storage: Pick<Storage, 'getItem'>, key: string): PetPoint | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(key) || 'null');
    if (!value || typeof value !== 'object' || !('x' in value) || !('y' in value)) return null;
    return typeof value.x === 'number' && typeof value.y === 'number' && Number.isFinite(value.x) && Number.isFinite(value.y)
      ? { x: value.x, y: value.y } : null;
  } catch { return null; }
}

export function readPetPosition(storage: Pick<Storage, 'getItem'>): PetPoint | null {
  return readStoredPoint(storage, PET_POSITION_KEY) ?? readStoredPoint(storage, LEGACY_PET_POSITION_KEY);
}

export function writePetPosition(storage: Pick<Storage, 'setItem'>, point: PetPoint) {
  try { storage.setItem(PET_POSITION_KEY, JSON.stringify(point)); } catch { /* Private browsing may block storage. */ }
}

export interface PetFloatBox { width: number; height: number }
export interface PetFloatPlacement { left: number; top: number; width: number; side: 'above' | 'below' }

/** Place floating chrome beside the pet. The pet point is not part of the result. */
export function petStackLayout(point: PetPoint, size: PetSize, bounds: PetBounds, boxes: readonly PetFloatBox[], gap = 8): PetFloatPlacement[] {
  if (boxes.length === 0) return [];
  const stackHeight = boxes.reduce((sum, box) => sum + box.height, 0) + gap * (boxes.length - 1);
  const above = Math.max(0, point.y - bounds.top - gap);
  const below = Math.max(0, bounds.height - bounds.bottom - point.y - size.height - gap);
  const up = above >= stackHeight || above >= below;
  const room = Math.max(0, bounds.width - bounds.left - bounds.right);
  let cursor = up ? point.y - gap : point.y + size.height + gap;
  return boxes.map((box) => {
    const width = Math.min(Math.max(0, box.width), room);
    const left = Math.max(bounds.left, Math.min(point.x + size.width - width, bounds.width - bounds.right - width));
    const top = up ? cursor - box.height : cursor;
    cursor = up ? top - gap : top + box.height + gap;
    return { left, top, width, side: up ? 'above' as const : 'below' as const };
  });
}

export function petPanelLayout(point: PetPoint, size: PetSize, bounds: PetBounds, contentHeight: number) {
  const gap = 12;
  const width = Math.max(0, Math.min(380, bounds.width - bounds.left - bounds.right));
  const above = Math.max(0, point.y - bounds.top - gap);
  const below = Math.max(0, bounds.height - bounds.bottom - point.y - size.height - gap);
  const up = above >= contentHeight || above >= below;
  const maxHeight = up ? above : below;
  return {
    left: Math.max(bounds.left, Math.min(point.x + size.width - width, bounds.width - bounds.right - width)),
    top: up ? point.y - gap - Math.min(contentHeight, maxHeight) : point.y + size.height + gap,
    width, maxHeight, side: up ? 'above' as const : 'below' as const,
  };
}
