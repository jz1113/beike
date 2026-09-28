import { StateCreator } from 'zustand';
import type { AppState, BrandKitSlice } from '@client/store/types';
import {
  BrandKitProfile,
  DEFAULT_BRAND_KITS
} from '@shared/domain/products/brandKitModels';

const BRAND_KITS_STORAGE_KEY = 'azhuo_brand_kits_vault';
const ACTIVE_BRAND_KIT_STORAGE_KEY = 'azhuo_active_brand_kit_id';

function loadStoredBrandKits(): BrandKitProfile[] {
  if (typeof window === 'undefined') return DEFAULT_BRAND_KITS;
  try {
    const raw = localStorage.getItem(BRAND_KITS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}
  return DEFAULT_BRAND_KITS;
}

function loadStoredActiveBrandKitId(): string | null {
  if (typeof window === 'undefined') return DEFAULT_BRAND_KITS[0]?.id || null;
  try {
    const saved = localStorage.getItem(ACTIVE_BRAND_KIT_STORAGE_KEY);
    if (saved) return saved;
  } catch {}
  return DEFAULT_BRAND_KITS[0]?.id || null;
}

function persistBrandKits(kits: BrandKitProfile[], activeId: string | null) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(BRAND_KITS_STORAGE_KEY, JSON.stringify(kits));
    if (activeId) {
      localStorage.setItem(ACTIVE_BRAND_KIT_STORAGE_KEY, activeId);
    } else {
      localStorage.removeItem(ACTIVE_BRAND_KIT_STORAGE_KEY);
    }
  } catch {}
}

export type { BrandKitSlice } from '@client/store/types';


export const createBrandKitSlice: StateCreator<AppState, [], [], BrandKitSlice> = (set, get) => {
  const initialKits = loadStoredBrandKits();
  const initialActiveId = loadStoredActiveBrandKitId();

  return {
    brandKits: initialKits,
    activeBrandKitId: initialActiveId,

    setActiveBrandKitId: (id) => {
      set({ activeBrandKitId: id });
      persistBrandKits(get().brandKits, id);
    },

    addBrandKit: (kit) => {
      const updated = [kit, ...get().brandKits.filter(k => k.id !== kit.id)];
      set({ brandKits: updated, activeBrandKitId: kit.id });
      persistBrandKits(updated, kit.id);
    },

    updateBrandKit: (id, updates) => {
      const updated = get().brandKits.map(k => k.id === id ? { ...k, ...updates } : k);
      set({ brandKits: updated });
      persistBrandKits(updated, get().activeBrandKitId);
    },

    deleteBrandKit: (id) => {
      const updated = get().brandKits.filter(k => k.id !== id);
      let nextActiveId = get().activeBrandKitId;
      if (nextActiveId === id) {
        nextActiveId = updated[0]?.id || null;
      }
      set({ brandKits: updated, activeBrandKitId: nextActiveId });
      persistBrandKits(updated, nextActiveId);
    },

    getActiveBrandKit: () => {
      const state = get();
      if (!state.activeBrandKitId) return null;
      return state.brandKits.find(k => k.id === state.activeBrandKitId) || null;
    }
  };
};
