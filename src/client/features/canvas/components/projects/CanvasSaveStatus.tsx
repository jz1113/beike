import { useEffect, useRef, useState } from 'react';
import { hasCanvasSaveFailure, hasCanvasReadFailure } from '../../store/canvasPersistence';
import { saveCanvasProjects } from '../../store/useCanvasStore';

export function CanvasSaveStatus({ failuresOnly = false }: { failuresOnly?: boolean } = {}) {
  const [failed, setFailed] = useState(hasCanvasSaveFailure);
  const [saving, setSaving] = useState(false);
  const retryLock = useRef(false);
  useEffect(() => {
    const start = () => setSaving(true);
    const success = () => { setSaving(false); setFailed(false); };
    const failure = () => { setSaving(false); setFailed(true); };
    window.addEventListener('canvas-save-start', start);
    window.addEventListener('canvas-save-complete', success);
    window.addEventListener('canvas-save-error', failure);
    return () => {
      window.removeEventListener('canvas-save-start', start);
      window.removeEventListener('canvas-save-complete', success);
      window.removeEventListener('canvas-save-error', failure);
    };
  }, []);
  if (!failed) return failuresOnly ? null : <span role="status" className="text-xs text-stone-500">{saving ? '正在保存项目…' : '项目已保存到本机'}</span>;
  return <div role="alert" className="flex max-w-full flex-wrap items-center gap-2 rounded-lg bg-red-950 px-3 py-2 text-xs text-white">
    <span>{hasCanvasReadFailure() ? '无法读取本机项目，请重试读取。' : '项目尚未保存，请勿刷新或关闭页面。'}</span>
    <button type="button" disabled={saving} className="rounded border border-white/40 px-2 py-1"
      onClick={()=>{
        if(retryLock.current)return;retryLock.current=true;setSaving(true);
        void saveCanvasProjects().catch(()=>{}).finally(()=>{retryLock.current=false;setSaving(false);});
      }}>{saving ? '正在重试…' : hasCanvasReadFailure() ? '重试读取项目' : '重试保存'}</button>
  </div>;
}
