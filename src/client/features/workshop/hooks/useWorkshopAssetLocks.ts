import { useEffect, useState } from 'react';
import { useAppStore } from '@client/store';

export function useWorkshopAssetLocks(workspaceReady: boolean) {
  const [useAssetLibrary, setUseAssetLibrary] = useState(false);
  const [lockedPersonaId, setLockedPersonaId] = useState('auto');
  const [lockedSceneId, setLockedSceneId] = useState('auto');
  const [lockedOutfitId, setLockedOutfitId] = useState('auto');
  const [lockedActionId, setLockedActionId] = useState('auto');
  const [lockedFullPromptId, setLockedFullPromptId] = useState('auto');
  const [promptGroupFolderId, setPromptGroupFolderId] = useState('auto');
  // Historical snapshot metadata only. New production never loads or applies assets.
  const pending = useAppStore((state) => state.pendingBatchLockedAssets);
  const setPending = useAppStore((state) => state.setPendingBatchLockedAssets);
  useEffect(() => {
    if (!workspaceReady || !pending) return;
    setPending(null);
  }, [workspaceReady, pending, setPending]);

  return {
    useAssetLibrary, setUseAssetLibrary,
    lockedPersonaId, setLockedPersonaId,
    lockedSceneId, setLockedSceneId,
    lockedOutfitId, setLockedOutfitId,
    lockedActionId, setLockedActionId,
    lockedFullPromptId, setLockedFullPromptId,
    promptGroupFolderId, setPromptGroupFolderId,
  };
}
