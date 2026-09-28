import { useCallback, useEffect, useState, useRef } from 'react';
import { useAppStore } from '@client/store';
import { subscribeAssetInvalidation } from '@client/shared/api/assetLibraryCache';
import { fetchAssetLibraryOptions } from '../api/workshopResources';

export function useWorkshopAssetLocks(workspaceReady: boolean, onBindingApplied?: () => void) {
  const [useAssetLibrary, setUseAssetLibrary] = useState(true);
  const [lockedPersonaId, setLockedPersonaId] = useState('auto');
  const [lockedSceneId, setLockedSceneId] = useState('auto');
  const [lockedOutfitId, setLockedOutfitId] = useState('auto');
  const [lockedActionId, setLockedActionId] = useState('auto');
  const [lockedFullPromptId, setLockedFullPromptId] = useState('auto');
  const [availablePersonas, setAvailablePersonas] = useState<any[]>([]);
  const [availableScenes, setAvailableScenes] = useState<any[]>([]);
  const [availableOutfits, setAvailableOutfits] = useState<any[]>([]);
  const [availableActions, setAvailableActions] = useState<any[]>([]);
  const [availableFullPrompts, setAvailableFullPrompts] = useState<any[]>([]);

  const [assetLoadState, setAssetLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [assetLoadError, setAssetLoadError] = useState('');
  const requestId = useRef(0);
  const load = useCallback(async (force = false) => {
    const id = ++requestId.current;
    setAssetLoadState('loading');
    setAssetLoadError('');
    try {
      const { personas, scenes, outfits, actions, fullPrompts } = await fetchAssetLibraryOptions(force);
      if (id !== requestId.current) return;
      setAvailablePersonas(personas); setAvailableScenes(scenes); setAvailableOutfits(outfits);
      setAvailableActions(actions); setAvailableFullPrompts(fullPrompts);
      setAssetLoadState('ready');
    } catch (error) {
      if (id !== requestId.current) return;
      setAssetLoadState('error');
      setAssetLoadError(error instanceof Error ? error.message : '资产加载失败');
    }
  }, []);

  useEffect(() => {
    void load();
    const unsubscribe = subscribeAssetInvalidation(() => { void load(true); });
    const refresh = () => { void load(); };
    window.addEventListener('focus', refresh);
    const invalidatePendingRequests = () => { ++requestId.current; };
    return () => { invalidatePendingRequests(); unsubscribe(); window.removeEventListener('focus', refresh); };
  }, [load]);

  const pending = useAppStore((state) => state.pendingBatchLockedAssets);
  const setPending = useAppStore((state) => state.setPendingBatchLockedAssets);
  useEffect(() => {
    if (!workspaceReady || !pending) return;
    setUseAssetLibrary(true);
    if (pending.sceneId) setLockedSceneId(pending.sceneId);
    if (pending.outfitId) setLockedOutfitId(pending.outfitId);
    if (pending.personaId) setLockedPersonaId(pending.personaId);
    if (pending.actionId) setLockedActionId(pending.actionId);
    if (pending.fullPromptId) setLockedFullPromptId(pending.fullPromptId);
    onBindingApplied?.();
    setPending(null);
    void load(true);
  }, [workspaceReady, pending, setPending, load, onBindingApplied]);

  return {
    assetLoadState, assetLoadError, reloadAssets: () => load(true),
    useAssetLibrary, setUseAssetLibrary,
    lockedPersonaId, setLockedPersonaId,
    lockedSceneId, setLockedSceneId,
    lockedOutfitId, setLockedOutfitId,
    lockedActionId, setLockedActionId,
    lockedFullPromptId, setLockedFullPromptId,
    availablePersonas, availableScenes, availableOutfits, availableActions, availableFullPrompts,
  };
}
