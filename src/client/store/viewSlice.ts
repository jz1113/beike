import type { StateCreator } from 'zustand';
import type { AppState, ViewSlice } from '@client/store/types';
import { requestEcommerceCanvas } from '@client/shared/navigation/commerceCanvas';
import { normalizeWorkshopTab } from './workshopTab';
import { normalizeAppView, isAppView } from './appView';

export const createViewSlice: StateCreator<AppState, [], [], ViewSlice> = (set, get) => ({
  currentView: typeof window === 'undefined' ? 'home' : normalizeAppView(new URLSearchParams(window.location.search).get('view')) ?? 'home',
  previousView: null,
  activeWorkshopTab: 'studio',
  isWorkshopConfigOpen: false,
  setIsWorkshopConfigOpen: (isWorkshopConfigOpen) => set({ isWorkshopConfigOpen }),
  setCurrentView: (currentView) => {
    if (currentView === 'workshop') {
      requestEcommerceCanvas();
      return;
    }
    if (!isAppView(currentView)) currentView = 'home';
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
  setActiveWorkshopTab: (activeWorkshopTab) => set({ activeWorkshopTab: normalizeWorkshopTab(activeWorkshopTab) }),
});
