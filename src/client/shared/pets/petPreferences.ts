import { useSyncExternalStore } from 'react';
import type { PetPose } from '@shared/domain/pets/atlas';

export type BeikePetPhase = 'idle' | 'ready' | 'dragging' | 'uploading' | 'analyzing' | 'success' | 'partial' | 'error';

type MotionTrack = {
  x?: number | number[];
  y?: number | number[];
  rotate?: number | number[];
  scaleX?: number | number[];
  scaleY?: number | number[];
  transition: { duration: number; repeat: number; ease: 'easeInOut'; times?: number[] };
};

function track(values: Omit<MotionTrack, 'transition'>, duration: number, repeat = Infinity): MotionTrack {
  return { ...values, transition: { duration, repeat, ease: 'easeInOut' } };
}

const resting = () => track({ x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1 }, 0, 0);

export function beikePetMotion(phase: BeikePetPhase, reduced = false) {
  const eating = phase === 'dragging' || phase === 'uploading';
  const thinking = phase === 'analyzing';
  const failed = phase === 'partial' || phase === 'error';
  const expression = {
    badge: phase === 'success' ? '饱啦' : phase === 'partial' ? '待核对' : phase === 'error' ? '重试' : eating ? '吃图中' : thinking ? '思考中' : '待机',
    eyeHeight: thinking ? 4 : failed ? 5 : 7,
    pupilY: thinking ? 60 : 62,
    mouthOpen: eating,
    mouth: eating ? 'M53 76 C53 73 67 73 67 76 C68 88 52 88 53 76Z'
      : failed ? 'M54 80 Q60 75 66 80' : 'M53 77 Q56 81 60 78 Q64 81 67 77',
  };
  if (reduced) return {
    ...expression, body: resting(), ears: resting(), eyes: resting(), gaze: resting(), mouthMotion: resting(), feedback: resting(),
  };

  const body = eating
    ? track({ y: [0, -3, 0], scaleX: [1, 1.05, 1], scaleY: [1, 0.94, 1] }, phase === 'uploading' ? 0.65 : 1)
    : thinking
      ? track({ y: [0, -2, 0], rotate: [-4, 4, -4], scaleY: [1, 1.025, 1] }, 2.4)
      : track({ y: [0, -5, 0], scaleX: [1, 1.025, 1], scaleY: [1, 1.045, 1] }, 3);
  const feedback = phase === 'success'
    ? track({ y: [0, -13, 0, -7, 0], rotate: [0, -7, 5, -3, 0] }, 1.1, 0)
    : failed ? track({ x: [0, -4, 4, -2, 0], rotate: [0, -5, 5, -3, 0] }, 0.65, 0) : resting();

  return {
    ...expression, body, feedback,
    ears: track({ rotate: [0, eating ? 18 : 9, 0] }, eating ? 0.65 : 3),
    eyes: { ...track({ scaleY: [1, 1, 0.08, 1, 1] }, 3.6), transition: { duration: 3.6, repeat: Infinity, ease: 'easeInOut' as const, times: [0, 0.8, 0.84, 0.88, 1] } },
    gaze: thinking ? track({ x: [-1.5, 1.5, -1.5], y: -1 }, 2.4) : resting(),
    mouthMotion: eating ? track({ scaleY: [1, 0.45, 1], scaleX: [1, 1.08, 1] }, phase === 'uploading' ? 0.45 : 0.8) : resting(),
  };
}

export type PetSizeName = 'sm' | 'md' | 'lg';

export type CanvasPetLink = 'all' | 'generation' | 'off';

export interface PetPreferences {
  canvasVisible: boolean;
  canvasLink: CanvasPetLink;
  petId: string;
  visible: boolean;
  size: PetSizeName;
}

export const PET_SIZES: Record<PetSizeName, number> = { sm: 72, md: 96, lg: 128 };
const PREFERENCE_KEY = 'beike.pet.preferences.v1';
const fallback: PetPreferences = { petId: 'beike', visible: false, size: 'md', canvasVisible: true, canvasLink: 'all' };

function read(storage: Pick<Storage, 'getItem'>): PetPreferences {
  try {
    const value: unknown = JSON.parse(storage.getItem(PREFERENCE_KEY) || 'null');
    if (!value || typeof value !== 'object') return fallback;
    const record = value as Partial<PetPreferences>;
    const removedPet = record.petId === 'the-real-tronald-dump';
    return {
      petId: !removedPet && typeof record.petId === 'string' && record.petId ? record.petId : fallback.petId,
      visible: !removedPet && record.visible === true,
      canvasVisible: record.canvasVisible !== false,
      canvasLink: record.canvasLink === 'generation' || record.canvasLink === 'off' ? record.canvasLink : 'all',
      size: record.size === 'sm' || record.size === 'lg' ? record.size : 'md',
    };
  } catch {
    return fallback;
  }
}

let preferences = typeof window === 'undefined' ? fallback : read(window.localStorage);
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key !== PREFERENCE_KEY && event.key !== null) return;
  preferences = read(window.localStorage);
  listeners.forEach(listener => listener());
});

export function getPetPreferences() {
  return preferences;
}

export function subscribePetPreferences(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updatePetPreferences(patch: Partial<PetPreferences>) {
  preferences = { ...preferences, ...patch };
  try { window.localStorage.setItem(PREFERENCE_KEY, JSON.stringify(preferences)); } catch { /* Private browsing may block storage. */ }
  listeners.forEach((listener) => listener());
}

export function usePetPreferences() {
  return useSyncExternalStore(subscribePetPreferences, getPetPreferences, () => fallback);
}

export function beikePhaseFor(pose: PetPose, feedPhase?: string | null): BeikePetPhase {
  if (feedPhase === 'dragging' || feedPhase === 'uploading' || feedPhase === 'analyzing' || feedPhase === 'ready' || feedPhase === 'success' || feedPhase === 'partial' || feedPhase === 'error') {
    return feedPhase;
  }
  if (pose === 'working') return 'analyzing';
  if (pose === 'success') return 'success';
  if (pose === 'failed') return 'error';
  return 'idle';
}
