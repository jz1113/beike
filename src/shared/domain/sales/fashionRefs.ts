import type { VideoSalesShot } from './types';

export type FashionBeat = 'unbox' | 'lifestyle' | 'accessory';
export type FashionRefSlot = 'person' | 'face' | 'garment' | 'scene';

export interface FashionRefs {
  personUrl: string;
  faceUrl: string;
  sceneUrl: string;
}

export interface FashionReference {
  slot: FashionRefSlot;
  label: string;
  url: string;
  imageIndex?: number;
}

const SLOT_LABEL: Record<FashionRefSlot, string> = {
  person: '出镜人物',
  face: '人脸特写',
  garment: '服饰单品',
  scene: '场景',
};

export function emptyFashionRefs(): FashionRefs {
  return { personUrl: '', faceUrl: '', sceneUrl: '' };
}

export function readFashionRefs(value: unknown): FashionRefs {
  const raw = value && typeof value === 'object' ? value as Partial<FashionRefs> : {};
  return {
    personUrl: typeof raw.personUrl === 'string' ? raw.personUrl : '',
    faceUrl: typeof raw.faceUrl === 'string' ? raw.faceUrl : '',
    sceneUrl: typeof raw.sceneUrl === 'string' ? raw.sceneUrl : '',
  };
}

export function fashionReferenceOrder(input: {
  personUrl?: string;
  faceUrl?: string;
  garmentUrl?: string;
  garmentIndex?: number;
  sceneUrl?: string;
  reserveScene?: boolean;
}): FashionReference[] {
  const refs: FashionReference[] = [];
  const push = (slot: FashionRefSlot, url?: string, imageIndex?: number) => {
    const trimmed = url?.trim() || '';
    if (!trimmed) return;
    refs.push({ slot, label: SLOT_LABEL[slot], url: trimmed, ...(typeof imageIndex === 'number' ? { imageIndex } : {}) });
  };
  push('person', input.personUrl);
  push('face', input.faceUrl);
  push('garment', input.garmentUrl, input.garmentIndex);
  const scene = input.sceneUrl?.trim() || '';
  if (scene || input.reserveScene) refs.push({ slot: 'scene', label: SLOT_LABEL.scene, url: scene });
  return refs;
}

export function fashionFramesForVideo(refs: FashionReference[], frames: { personFrameUrl?: string; sceneFrameUrl?: string }): FashionReference[] {
  return refs.flatMap((ref) => {
    if (ref.slot === 'person' && frames.personFrameUrl?.trim()) return [{ ...ref, url: frames.personFrameUrl.trim() }];
    if (ref.slot === 'scene') {
      const url = frames.sceneFrameUrl?.trim() || ref.url.trim();
      return url ? [{ ...ref, url }] : [];
    }
    return ref.url.trim() ? [ref] : [];
  });
}

export function fashionReferenceBrief(refs: FashionReference[]): string {
  return refs.map((ref, index) => `图片${index + 1}：${ref.label}`).join('\n');
}

export function fashionReferenceError(refs: FashionReference[]): string | null {
  if (!refs.some((ref) => ref.slot === 'person')) return '请上传出镜人物';
  if (!refs.some((ref) => ref.slot === 'garment')) return '请至少保留一张可用商品图';
  return null;
}

export function fashionGarmentIndex(shots: Array<Pick<VideoSalesShot, 'type' | 'imageIndex'>>): number {
  const rank = (type: VideoSalesShot['type']) => {
    if (type === 'demo') return 0;
    if (type === 'product_reveal') return 1;
    if (type === 'hook') return 2;
    return 3;
  };
  const found = [...shots]
    .filter((shot) => typeof shot.imageIndex === 'number' && shot.imageIndex >= 0)
    .sort((a, b) => rank(a.type) - rank(b.type))[0];
  return found?.imageIndex ?? 0;
}

export function fashionReferencesForShots(input: {
  refs: FashionRefs;
  shots: Array<Pick<VideoSalesShot, 'type' | 'imageIndex'>>;
  catalog: Array<{ index: number; url: string; unavailable?: boolean }>;
  reserveScene?: boolean;
}): FashionReference[] {
  const usable = input.catalog.filter((image) => image.url.trim() && !image.unavailable);
  const preferred = usable.find((image) => image.index === fashionGarmentIndex(input.shots)) || usable[0];
  return fashionReferenceOrder({
    personUrl: input.refs.personUrl,
    faceUrl: input.refs.faceUrl,
    sceneUrl: input.refs.sceneUrl,
    garmentUrl: preferred?.url,
    garmentIndex: preferred?.index,
    reserveScene: input.reserveScene,
  });
}

export function fashionBeatLabel(beat?: string): string {
  if (beat === 'lifestyle') return '生活穿搭';
  if (beat === 'accessory') return '鞋包展示';
  if (beat === 'unbox') return '开箱换装';
  return '';
}

export function isFashionBeat(value: unknown): value is FashionBeat {
  return value === 'unbox' || value === 'lifestyle' || value === 'accessory';
}
