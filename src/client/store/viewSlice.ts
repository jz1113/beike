import type { StateCreator } from 'zustand';
import type { AppState, ViewSlice } from '@client/store/types';
import { normalizeWorkshopTab } from './workshopTab';
import { normalizeAppView } from './appView';

export const createViewSlice: StateCreator<AppState, [], [], ViewSlice> = (set, get) => ({
  currentView: typeof window === 'undefined' ? 'home' : normalizeAppView(new URLSearchParams(window.location.search).get('view')) ?? 'home',
  previousView: null,
  activeModuleId: 'workshop',
  activeWorkshopTab: 'studio',
  isWorkshopConfigOpen: false,
  setCurrentView: (currentView) => {
    const prev = get().currentView;
    if (prev === currentView) return;
    set({
      currentView,
      previousView: currentView !== 'settings' && prev !== 'settings' ? prev : get().previousView,
    });
  },
  navigateToSettings: () => {
    const current = get().currentView;
    if (current !== 'settings') {
      set({ previousView: current, currentView: 'settings' });
    }
  },
  backFromSettings: () => {
    const target = get().previousView || 'home';
    set({ currentView: target === 'settings' ? 'home' : target });
  },
  setActiveModuleId: (activeModuleId) => set({ activeModuleId }),
  setActiveWorkshopTab: (activeWorkshopTab) => set({ activeWorkshopTab: normalizeWorkshopTab(activeWorkshopTab) }),
  setIsWorkshopConfigOpen: (isWorkshopConfigOpen) => set({ isWorkshopConfigOpen }),
});
