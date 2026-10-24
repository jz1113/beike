import { fetchMediaBlob } from '@client/shared/media/downloadMedia';
import { deleteDerived, getDerived, putDerived } from '@client/shared/media/idbMediaCache';
import { loadPosterBatchHistory, persistPosterBatchRecord, removePosterBatchRecord } from '../model/posterBatchHistory';
import type { PosterBatchRecord, PosterBatchSnapshotItem } from '../model/posterBatchHistory';
import { normalizeConcurrency, makeId } from '../model/posterTypes';
import type { PosterItem } from '../model/posterTypes';
import type { PosterState } from './usePosterState';

export function createPosterHistory(context: Pick<PosterState,
    'activeBatchIdRef' | 'activeBatchCreatedAtRef' | 'activeBatchRevisionRef'
    | 'persistedMediaKeysRef' | 'recoveredResultUrlsRef' | 'mediaWritesRef' | 'workspaceScopeRef'
    | 'setNoticeIfAlive' | 'ownedGenerationLocksRef' | 'itemsRef' | 'currentSettings'
    | 'metadataBarrierRef' | 'aliveRef' | 'setHistoryBatches' | 'runningRef' | 'restoringRef'
    | 'exportingRef' | 'importingRef' | 'ensureWorkspaceReady' | 'setIsRestoring' | 'setItemsIfAlive'
    | 'setPreviewState' | 'setImageModel' | 'setTitleModel'
    | 'setTitleHandling' | 'setImageQuality' | 'setConcurrency'
    | 'setMemorySampleId' | 'abortRef' | 'abortAllItems'
  >) {
  const {
    activeBatchIdRef, activeBatchCreatedAtRef, activeBatchRevisionRef, persistedMediaKeysRef,
    recoveredResultUrlsRef, mediaWritesRef, workspaceScopeRef, setNoticeIfAlive,
    ownedGenerationLocksRef, itemsRef, currentSettings, metadataBarrierRef, aliveRef,
    setHistoryBatches, runningRef, restoringRef, exportingRef, importingRef,
    ensureWorkspaceReady, setIsRestoring, setItemsIfAlive, setPreviewState, setImageModel,
    setTitleModel, setTitleHandling, setImageQuality,
    setConcurrency, setMemorySampleId, abortRef,
    abortAllItems,
  } = context;
  const ensureActiveBatch = () => {
    if (activeBatchIdRef.current) return activeBatchIdRef.current;
    activeBatchIdRef.current = `poster_batch_${makeId()}`;
    activeBatchCreatedAtRef.current = Date.now();
    activeBatchRevisionRef.current = null;
    persistedMediaKeysRef.current.clear();
    return activeBatchIdRef.current;
  };

  const releaseRecoveredResultUrls = () => {
    for (const url of recoveredResultUrlsRef.current) URL.revokeObjectURL(url);
    recoveredResultUrlsRef.current = [];
  };

  const removeResultCaches = async (keys: string[]) => {
    await Promise.all(keys.map(async (key) => {
      await mediaWritesRef.current.get(key);
      await deleteDerived(key).catch(() => undefined);
      persistedMediaKeysRef.current.delete(key);
    }));
  };

  const activeBatchIsCurrent = () => {
    const batchId = activeBatchIdRef.current;
    const scope = workspaceScopeRef.current;
    if (!batchId || !scope) return false;
    const latest = loadPosterBatchHistory(scope).find((record) => record.id === batchId);
    const revision = latest ? latest.revision || String(latest.updatedAt) : null;
    if (revision === activeBatchRevisionRef.current) return true;
    setNoticeIfAlive('此批次已在另一个页面更新或删除，已停止提交和覆盖；请刷新页面并重新打开历史批次。');
    return false;
  };

  const withHistoryWriteLock = <T,>(scope: string, operation: () => T): Promise<T> => globalThis.navigator?.locks
    ? navigator.locks.request(`headline-poster-history:${scope}`, operation)
    : Promise.resolve(operation());

  const withOwnedBatchLock = async <T,>(batchId: string, operation: () => Promise<T>, unavailable: () => T): Promise<T> => {
    if (!globalThis.navigator?.locks) return operation();
    return navigator.locks.request(`headline-poster:${workspaceScopeRef.current}:${batchId}`, { ifAvailable: true }, async (lock) => {
      if (!lock) return unavailable();
      ownedGenerationLocksRef.current.add(batchId);
      try { return await operation(); } finally { ownedGenerationLocksRef.current.delete(batchId); }
    });
  };

  const persistActiveBatch = async (targetItems = itemsRef.current) => {
    const batchId = activeBatchIdRef.current;
    if (!batchId || targetItems.length === 0) return true;
    const scope = workspaceScopeRef.current;
    if (!scope) return false;
    if (!activeBatchIsCurrent()) return false;
    const mediaWrites: Promise<boolean>[] = [];
    const snapshotItems: PosterBatchSnapshotItem[] = targetItems.map((item) => {
      const { resultUrl, ...rest } = item;
      const resultCacheKey = resultUrl ? item.persistedResultKey || `headline_poster_result:${batchId}:${item.id}` : undefined;
      if (resultUrl && (resultUrl.startsWith('data:') || resultUrl.startsWith('blob:')) && resultCacheKey && !persistedMediaKeysRef.current.has(resultCacheKey)) {
        let write = mediaWritesRef.current.get(resultCacheKey);
        if (!write) {
          write = fetchMediaBlob(resultUrl)
          .then((blob) => putDerived(resultCacheKey, blob, blob.type || 'image/jpeg'))
          .then(async () => {
            if (!await getDerived(resultCacheKey)) throw new Error('成品缓存不可用');
            persistedMediaKeysRef.current.add(resultCacheKey);
            return true;
          })
          .catch(() => {
            setNoticeIfAlive('成品已生成，但本地缓存未保存成功；请及时下载成品。');
            // A durable original scene can rebuild the JPEG. Legacy results
            // without such a source must remain visible until saved.
            return Boolean(item.generatedSceneUrl || item.imageTaskId);
          })
          .finally(() => { mediaWritesRef.current.delete(resultCacheKey); });
          mediaWritesRef.current.set(resultCacheKey, write);
        }
        mediaWrites.push(write);
      }
      return {
        ...rest,
        resultUrl: resultUrl && !resultUrl.startsWith('data:') && !resultUrl.startsWith('blob:') ? resultUrl : undefined,
        resultCacheKey,
      };
    });
    const record: PosterBatchRecord = {
      id: batchId,
      createdAt: activeBatchCreatedAtRef.current || Date.now(),
      updatedAt: Date.now(),
      revision: makeId(),
      settings: currentSettings(),
      items: snapshotItems,
    };
    const saveMetadata = () => withHistoryWriteLock(scope, () => {
        if (activeBatchIdRef.current !== batchId || !activeBatchIsCurrent()) return undefined;
        const result = persistPosterBatchRecord(record, scope);
        if (result.saved) {
          const stored = result.records.find((entry) => entry.id === batchId);
          activeBatchRevisionRef.current = stored ? stored.revision || String(stored.updatedAt) : null;
        }
        return result;
      });
    const metadataSave = (ownedGenerationLocksRef.current.has(batchId) ? saveMetadata() : withOwnedBatchLock(batchId, saveMetadata, () => {
      setNoticeIfAlive('另一个页面正在处理此批次，已保留原任务记录；请等待结束后再操作。');
      return undefined;
    })).catch(() => {
      setNoticeIfAlive('无法取得历史存储锁，已停止保存和提交；请刷新页面重试。');
      return undefined;
    });
    metadataBarrierRef.current = metadataSave;
    const persisted = await metadataSave;
    if (!persisted) { await Promise.all(mediaWrites); return false; }
    if (aliveRef.current) setHistoryBatches(persisted.records);
    if (!persisted.saved) setNoticeIfAlive('浏览器未能保存当前批次；请释放本地存储空间并下载已有成品。');
    const mediaSaved = await Promise.all(mediaWrites);
    if (persisted.saved) await removeResultCaches(persisted.removedResultCacheKeys);
    return persisted.saved && mediaSaved.every(Boolean);
  };

  const restoreHistoryBatchInternal = async (record: PosterBatchRecord): Promise<boolean> => {
    if (runningRef.current || restoringRef.current || exportingRef.current || importingRef.current || !ensureWorkspaceReady()) return false;
    restoringRef.current = true;
    setIsRestoring(true);
    const restoredUrls: string[] = [];
    try {
      if (!await persistActiveBatch()) throw new Error('当前批次未保存成功，暂不能切换历史批次。');
      const latestRecord = loadPosterBatchHistory(workspaceScopeRef.current!).find((entry) => entry.id === record.id);
      if (!latestRecord) throw new Error('历史批次已更新或删除，请刷新历史列表后重试。');
      const restored = await Promise.all(latestRecord.items.map(async (snapshot) => {
        const { resultCacheKey, resultUrl: savedResultUrl, ...item } = snapshot;
        let resultUrl = savedResultUrl;
        if (resultCacheKey) {
          const blob = await getDerived(resultCacheKey);
          if (blob) {
            resultUrl = URL.createObjectURL(blob);
            restoredUrls.push(resultUrl);
          }
        }
        const wasInterrupted = ['rewriting', 'prompting', 'rendering', 'interrupted'].includes(item.status);
        const missingResult = item.status === 'complete' && !resultUrl;
        const requiresRecovery = item.generationRecoveryRequired || item.status === 'rendering' || missingResult;
        return {
          ...item, resultUrl, persistedResultKey: resultCacheKey,
          generationRecoveryRequired: requiresRecovery,
          status: missingResult ? 'failed' : wasInterrupted ? 'interrupted' : item.status,
          error: missingResult ? '历史成品缓存不可用，继续时会优先恢复原生图结果。'
            : requiresRecovery ? '继续时会核对原生图任务，不会重复提交。'
              : wasInterrupted ? undefined : item.error,
        } satisfies PosterItem;
      }));
      if (!aliveRef.current || !ensureWorkspaceReady()) return false;
      releaseRecoveredResultUrls();
      recoveredResultUrlsRef.current = restoredUrls;
      activeBatchIdRef.current = latestRecord.id;
      activeBatchCreatedAtRef.current = latestRecord.createdAt;
      activeBatchRevisionRef.current = latestRecord.revision || String(latestRecord.updatedAt);
      persistedMediaKeysRef.current = new Set(restored.flatMap((item) => item.resultUrl && item.persistedResultKey ? [item.persistedResultKey] : []));
      itemsRef.current = restored;
      setItemsIfAlive(restored);
      setPreviewState(null);
      const settings = latestRecord.settings;
      setImageModel(settings.imageModel);
      setTitleModel(settings.titleModel);
      setTitleHandling(settings.titleHandling);
      setImageQuality(settings.imageQuality);
      setConcurrency(normalizeConcurrency(settings.concurrency));
      setMemorySampleId(settings.memorySampleId || '');
      setNoticeIfAlive(`已恢复历史批次及生产设置，共 ${restored.length} 条；中断生图会先核对原任务。`);
      return true;
    } finally {
      if (!aliveRef.current || recoveredResultUrlsRef.current !== restoredUrls) {
        for (const url of restoredUrls) URL.revokeObjectURL(url);
      }
      restoringRef.current = false;
      if (aliveRef.current) setIsRestoring(false);
    }
  };

  const restoreHistoryBatch = async (record: PosterBatchRecord): Promise<boolean> => {
    if (runningRef.current || restoringRef.current || exportingRef.current || importingRef.current || !ensureWorkspaceReady()) return false;
    return withOwnedBatchLock(record.id, () => restoreHistoryBatchInternal(record), () => {
      setNoticeIfAlive('另一个页面正在处理此历史批次，请等待结束后再恢复。');
      return false;
    });
  };

  const deleteHistoryBatch = async (id: string) => {
    if (id === activeBatchIdRef.current || runningRef.current || restoringRef.current || exportingRef.current || importingRef.current || !ensureWorkspaceReady()) return;
    const scope = workspaceScopeRef.current!;
    const next = await withOwnedBatchLock(id, () => withHistoryWriteLock(scope, () => removePosterBatchRecord(id, scope)), () => {
      throw new Error('另一个页面正在处理此历史批次，请等待结束后再删除。');
    });
    if (!next.saved) throw new Error('历史批次删除未保存，成品缓存已保留；请检查浏览器存储后重试。');
    if (aliveRef.current) setHistoryBatches(next.records);
    await removeResultCaches(next.removedResultCacheKeys);
  };

  const clearItems = async (): Promise<boolean> => {
    if (runningRef.current || restoringRef.current || exportingRef.current || importingRef.current || !ensureWorkspaceReady()) return false;
    if (activeBatchIdRef.current && !activeBatchIsCurrent()) return false;
    restoringRef.current = true;
    setIsRestoring(true);
    try {
      if (!await persistActiveBatch(itemsRef.current)) {
        setNoticeIfAlive('当前批次未保存成功，已保留所有记录；请先下载成品或释放浏览器存储。');
        return false;
      }
      if (!aliveRef.current || !ensureWorkspaceReady()) return false;
      abortRef.current.aborted = true;
      abortAllItems();
      releaseRecoveredResultUrls();
      itemsRef.current = [];
      activeBatchIdRef.current = null;
      activeBatchCreatedAtRef.current = null;
      activeBatchRevisionRef.current = null;
      persistedMediaKeysRef.current.clear();
      setItemsIfAlive([]);
      setPreviewState(null);
      setNoticeIfAlive('已创建新批次，可以导入新的图片链接和标题。生产设置已保留。');
      return true;
    } finally {
      restoringRef.current = false;
      if (aliveRef.current) setIsRestoring(false);
    }
  };


  return { ensureActiveBatch, releaseRecoveredResultUrls, removeResultCaches, activeBatchIsCurrent, withHistoryWriteLock, withOwnedBatchLock, persistActiveBatch, restoreHistoryBatch, deleteHistoryBatch, clearItems };
}
