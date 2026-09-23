import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@/store';
import { fetchAssetLibraryOptions } from '../model/batchResourceLoader';

export function useWorkshopAssetLocks() {
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

  const load = useCallback(async () => {
    const { personas, scenes, outfits, actions, fullPrompts } = await fetchAssetLibraryOptions();
    setAvailablePersonas(personas);
    setAvailableScenes(scenes);
    setAvailableOutfits(outfits);
    setAvailableActions(actions);
    setAvailableFullPrompts(fullPrompts.filter((group: any) => {
      try { return JSON.parse(String(group.sourceImageIndices || '[]')).length === 4
        && JSON.parse(String(group.shotPromptsJson || '[]')).length === 4; }
      catch { return false; }
    }));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const pending = useAppStore((state) => state.pendingBatchLockedAssets);
  const setPending = useAppStore((state) => state.setPendingBatchLockedAssets);
  useEffect(() => {
    if (!pending) return;
    setUseAssetLibrary(true);
    if (pending.sceneId) setLockedSceneId(pending.sceneId);
    if (pending.outfitId) setLockedOutfitId(pending.outfitId);
    if (pending.personaId) setLockedPersonaId(pending.personaId);
    if (pending.actionId) setLockedActionId(pending.actionId);
    if (pending.fullPromptId) setLockedFullPromptId(pending.fullPromptId);
    setPending(null);
  }, [pending, setPending]);

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
