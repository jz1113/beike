import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@/store';
import { isCompletePromptGroup } from '@beike/domain/workshopPipeline';
import { fetchAssetLibraryOptions } from '../model/batchResourceLoader';

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

  const load = useCallback(async (force = false) => {
    const { personas, scenes, outfits, actions, fullPrompts } = await fetchAssetLibraryOptions(force);
    setAvailablePersonas(personas);
    setAvailableScenes(scenes);
    setAvailableOutfits(outfits);
    setAvailableActions(actions);
    setAvailableFullPrompts(fullPrompts.filter(isCompletePromptGroup));
  }, []);

  useEffect(() => { void load(); }, [load]);

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
    useAssetLibrary, setUseAssetLibrary,
    lockedPersonaId, setLockedPersonaId,
    lockedSceneId, setLockedSceneId,
    lockedOutfitId, setLockedOutfitId,
    lockedActionId, setLockedActionId,
    lockedFullPromptId, setLockedFullPromptId,
    availablePersonas, availableScenes, availableOutfits, availableActions, availableFullPrompts,
  };
}
