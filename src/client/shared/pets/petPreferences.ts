import { useSyncExternalStore } from 'react';
import type { PetPose } from '@shared/domain/pets/atlas';
import type { BeikePetPhase } from './beikeMotion';

export type PetSizeName = 'sm' | 'md' | 'lg';

export interface PetPreferences {
  petId: string;
  visible: boolean;
  size: PetSizeName;
}

export const PET_SIZES: Record<PetSizeName, number> = { sm: 72, md: 96, lg: 128 };
const PREFERENCE_KEY = 'beike.pet.preferences.v1';
const fallback: PetPreferences = { petId: 'beike', visible: true, size: 'md' };

function read(storage: Pick<Storage, 'getItem'>): PetPreferences {
  try {
    const value: unknown = JSON.parse(storage.getItem(PREFERENCE_KEY) || 'null');
    if (!value || typeof value !== 'object') return fallback;
    const record = value as Partial<PetPreferences>;
    return {
      petId: typeof record.petId === 'string' && record.petId ? record.petId : fallback.petId,
      visible: record.visible !== false,
      size: record.size === 'sm' || record.size === 'lg' ? record.size : 'md',
    };
  } catch {
    return fallback;
  }
}

let preferences = typeof window === 'undefined' ? fallback : read(window.localStorage);
const listeners = new Set<() => void>();

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
