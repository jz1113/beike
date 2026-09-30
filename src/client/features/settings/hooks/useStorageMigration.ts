import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@client/shared/api/apiClient';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { storageConfigError, type StorageDraft } from '../model/storageValidation';
import { migrateStoragePages, type MigrationProgress } from '../model/storageMigration';

interface Props {
  config: StorageDraft;
  enabled: boolean;
  setIsMigratingStorage: (value: boolean) => void;
  showToast: (message: string) => void;
}

export function useStorageMigration({ config, enabled, setIsMigratingStorage, showToast }: Props) {
  const operation = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const stopRequested = useRef(false);
  const [progress, setProgress] = useState<MigrationProgress | null>(null);
  const [status, setStatus] = useState('');
  const configSignature = JSON.stringify(config);
  useEffect(() => { setStatus(''); setProgress(null); }, [configSignature]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operation.current?.abort();
      setIsMigratingStorage(false);
    };
  }, [setIsMigratingStorage]);

  const start = (requirePublicDomain = true) => {
    if (operation.current) return null;
    const error = storageConfigError(config, { requirePublicDomain });
    if (error) { setStatus(error); showToast(error); return null; }
    const controller = new AbortController();
    operation.current = controller;
    stopRequested.current = false;
    setStatus('');
    return controller;
  };

  const post = async (path: string, controller: AbortController, cursor?: string) => {
    const response = await apiFetch(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ config: { ...config, enabled: true, persistResults: true }, limit: 100, cursor }),
    });
    const data = await response.json();
    if (!response.ok || data.success !== true) throw new Error(data.message || data.error || `请求失败 (${response.status})`);
    if (controller.signal.aborted) throw new DOMException('操作已取消', 'AbortError');
    return data;
  };

  const migrate = async () => {
    if (!enabled) { showToast('请先开启成品上传'); return; }
    if (operation.current) return;
    const error = storageConfigError(config);
    if (error) { setStatus(error); showToast(error); return; }
    if (!window.confirm('会把历史临时链接重新上传到对象存储，并产生流量费用。确定继续？')) return;
    const controller = start();
    if (!controller) return;
    setIsMigratingStorage(true);
    setProgress({ total: 0, migrated: 0, failed: 0 });
    let completed: MigrationProgress = { total: 0, migrated: 0, failed: 0 };
    try {
      const result = await migrateStoragePages(
        (cursor) => post('/api/assets/storage/migrate', controller, cursor),
        (value) => { completed = value; if (mounted.current) setProgress(value); },
        () => stopRequested.current || controller.signal.aborted,
      );
      if (mounted.current) {
        const message = `${result.stopped ? '已停止后续批次' : '历史链接扫描完成'}：扫描 ${result.total} 条，转存 ${result.migrated} 条，失败 ${result.failed} 条${result.failed ? '；失败任务保留原链接，可重试' : ''}`;
        setStatus(message); showToast(message);
      }
    } catch (error) {
      if (mounted.current) { const message = `迁移中断：已扫描 ${completed.total} 条，转存 ${completed.migrated} 条，失败 ${completed.failed} 条。${formatUserError(error)}`; setStatus(message); showToast(message); }
    } finally {
      operation.current = null;
      if (mounted.current) setIsMigratingStorage(false);
    }
  };

  return { migrate, progress, status, stop: () => { stopRequested.current = true; setStatus('正在完成当前批次，随后停止'); } };
}
