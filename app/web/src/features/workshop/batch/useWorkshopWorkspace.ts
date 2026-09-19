import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { workshopSnapshotSchema, type WorkshopSnapshot } from '@beike/contracts/workshopWorkspace';
import { apiFetch } from '@/lib/apiClient';
import { recoverWorkspace } from './workspaceRecovery';

export function useWorkshopWorkspace(snapshot: WorkshopSnapshot, restore: (snapshot: WorkshopSnapshot) => void) {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('正在恢复工作区…');
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const revision = useRef(0);
  const saved = useRef('');
  const savedSnapshot = useRef<WorkshopSnapshot | null>(null);
  const latest = useRef(snapshot);
  latest.current = snapshot;
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  const serialized = useMemo(() => JSON.stringify(snapshot), [snapshot]);
  const mode = snapshot.mode;
  const busy = useRef(false);
  const blocked = useRef(false);
  const readyRef = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useEffect(() => {
    let cancelled = false;
    readyRef.current = false; setReady(false); blocked.current = false; setError('');
    setStatus('正在恢复工作区…');
    void (async () => {
      try {
        const response = await apiFetch(`/api/catalog/workshop-workspace?mode=${mode}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '工作区读取失败');
        if (!Number.isInteger(data.revision) || data.revision < 0) throw new Error('工作区版本无效');
        const value = data.snapshot === null ? null : recoverWorkspace(workshopSnapshotSchema.parse(data.snapshot));
        if (value && value.mode !== mode) throw new Error('工作区模式不一致');
        if (cancelled) return;
        revision.current = data.revision;
        if (value) { restoreRef.current(value); latest.current = value; saved.current = JSON.stringify(value); }
        else saved.current = JSON.stringify(latest.current);
        readyRef.current = true; setReady(true); setStatus(value ? '已恢复工作区' : '工作区已就绪');
      } catch (e) { if (!cancelled) { setError(e instanceof Error ? e.message : '工作区读取失败'); setStatus('恢复失败，未覆盖原记录'); } }
    })();
    return () => { cancelled = true; readyRef.current = false; };
  }, [mode, reload]);

  const flush = useCallback(async () => {
    if (!readyRef.current || busy.current || blocked.current) return;
    const captured = latest.current;
    if (captured === savedSnapshot.current) return;
    const json = JSON.stringify(captured);
    if (json === saved.current) { savedSnapshot.current = captured; return; }
    busy.current = true; setStatus('正在保存工作区…');
    try {
      const response = await apiFetch(`/api/catalog/workshop-workspace?mode=${latest.current.mode}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: revision.current, snapshot: JSON.parse(json) }),
      });
      const data = await response.json();
      if (!response.ok) { if (response.status === 409) blocked.current = true; throw new Error(data.error || '工作区保存失败'); }
      if (!Number.isInteger(data.revision) || data.revision !== revision.current + 1) {
        blocked.current = true; throw new Error('保存版本不明确，请重新加载核实');
      }
      revision.current = data.revision; saved.current = json; savedSnapshot.current = captured;
      if (alive.current) { setError(''); setStatus('工作区已保存'); }
    } catch (e) {
      // A lost acknowledgement may have committed. Do not guess the revision or overwrite another writer.
      blocked.current = true;
      if (alive.current) { setError(e instanceof Error ? e.message : '工作区保存失败'); setStatus('工作区尚未确认保存'); }
    } finally { busy.current = false; }
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setInterval(() => { void flush(); }, 1000);
    const onVisibility = () => { if (document.visibilityState === 'hidden') void flush(); };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (busy.current || JSON.stringify(latest.current) !== saved.current) { event.preventDefault(); event.returnValue = ''; }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', beforeUnload);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('beforeunload', beforeUnload); };
  }, [ready, flush]);
  return { ready, status: ready && !error && status === '工作区已保存' && serialized !== saved.current ? '等待保存工作区…' : status, error, reload: () => { if (!busy.current) { savedSnapshot.current = null; setReload(n => n + 1); } } };
}
