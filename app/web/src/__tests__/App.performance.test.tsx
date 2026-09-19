import { act, render, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import App from '../App';

const renders = vi.hoisted(() => ({ home: 0, engine: 0 }));
vi.mock('@/features/generate/useGenerationEngine', async () => {
  const { useAppStore } = await import('@/store/useAppStore');
  return { useGenerationEngine: () => { useAppStore(s => s.generationTasks); renders.engine++; } };
});
vi.mock('@/features/home/HomePage', () => ({ default: () => { renders.home++; return <div>Home</div>; } }));
vi.mock('@/features/generate/GenerateWorkspace', () => ({ default: () => null }));
vi.mock('@/features/workshop/WorkshopStudio', () => ({ default: () => null }));
vi.mock('@/features/replicate/ReplicationStudio', () => ({ default: () => null }));
vi.mock('@/features/assets/AssetCenter', () => ({ default: () => null }));
vi.mock('@/shared/ui/AppSidebar', () => ({ default: () => null }));
vi.mock('@/shared/ui/GlobalContextMenu', () => ({ default: () => null }));
vi.mock('@/shared/media/GlobalDynamicBackground', () => ({ default: () => null }));
vi.mock('@/features/assistant/AIAssistantButton', () => ({ default: () => null }));
vi.mock('@/features/assistant/AIAssistantDrawer', () => ({ default: () => null }));
vi.mock('@/shared/modals/ImageLightboxModal', () => ({ default: () => null }));
vi.mock('@/lib/apiClient', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/apiClient')>(), syncAppTokenCookie: () => {},
}));

afterEach(cleanup);
it('progress updates keep the engine live without rerendering the home page', async () => {
  useAppStore.setState({ currentView: 'home', generationTasks: [] });
  await act(async () => { render(<App />); });
  const before = { ...renders };
  for (let index = 0; index < 100; index++) {
    act(() => useAppStore.setState({ generationTasks: [] }));
  }
  expect(renders.engine - before.engine).toBe(100);
  expect(renders.home - before.home).toBe(0);
});
