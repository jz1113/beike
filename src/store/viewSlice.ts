import type { StateCreator } from 'zustand';
import type { AppState, ViewSlice } from './types';

export const createViewSlice: StateCreator<AppState, [], [], ViewSlice> = (set) => ({
  currentView: 'hub',
  activeModuleId: 'buyer_show',
  setCurrentView: (currentView) => set({ currentView }),
  setActiveModuleId: (activeModuleId) => set({ activeModuleId }),
});
