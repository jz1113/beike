import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSalesStudioAssets, type SalesStudioAssetCatalog } from '../api/salesProduction';
import { listSalesScripts, type StoredSalesScript } from '../api/salesScripts';

/** Refresh library choices after editing assets without interrupting production work. */
export function useSalesProductionCatalog(
  refreshVersion: number,
  taskBusy: boolean,
  onLoaded: (catalog: SalesStudioAssetCatalog) => void,
) {
  const [scripts, setScripts] = useState<StoredSalesScript[]>([]);
  const [catalog, setCatalog] = useState<SalesStudioAssetCatalog>({ personas: [], scenes: [], actions: [], voices: [], bgms: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadTick, setReloadTick] = useState(0);
  const settledRevision = useRef<string | null>(null);
  const reloadAssets = useCallback(() => setReloadTick((version) => version + 1), []);

  useEffect(() => {
    if (taskBusy) { setLoading(false); return; }
    const revision = `${refreshVersion}:${reloadTick}`;
    if (settledRevision.current === revision) return;
    const controller = new AbortController();
    setLoading(true);
    Promise.all([listSalesScripts(controller.signal), fetchSalesStudioAssets(controller.signal)])
      .then(([loadedScripts, loadedCatalog]) => {
        if (controller.signal.aborted) return;
        setScripts(loadedScripts);
        setCatalog(loadedCatalog);
        onLoaded(loadedCatalog);
        setError('');
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '加载脚本与资产库失败');
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        settledRevision.current = revision;
        setLoading(false);
      });
    // A task or a newer refresh cancels only these reads. Unsettled revisions retry when idle.
    return () => controller.abort();
  }, [onLoaded, refreshVersion, reloadTick, taskBusy]);

  return { scripts, catalog, loading, error, reloadAssets, clearError: () => setError('') };
}
