import { useEffect, useRef, useState } from 'react';
import { Link2, X } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { patchSalesScript, type StoredSalesScript } from '../api/salesScripts';
import type { SalesMaterialCard } from '../model/salesMaterialCatalog';
import { salesFocusClass, salesGhostButtonClass, salesInputClass } from './salesChrome';

export function SalesActionLinkDialog({ action, scripts, onSaved, onClose }: {
  action: SalesMaterialCard; scripts: readonly StoredSalesScript[]; onSaved: (script: StoredSalesScript) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const saving = useRef(false);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  const chosen = scripts.find((item) => item.id === selected);
  const save = async () => {
    if (!chosen || !action.video || saving.current) return;
    saving.current = true; setBusy(true); setError('');
    try {
      const saved = await patchSalesScript(chosen.id, { depthVideoUrl: action.video, depthTaskId: '', depthOperationId: '' });
      onSaved(saved); onClose();
    } catch (err) { setError(err instanceof Error ? err.message : '关联失败，请重试'); }
    finally { saving.current = false; setBusy(false); }
  };
  return <dialog ref={dialog} className="sales-material-dialog" aria-label="将深度视频关联到脚本"
    onCancel={(event) => { event.preventDefault(); if (!saving.current) onClose(); }}>
    <div className="sales-prod-card-head"><h2>关联脚本</h2><button type="button" disabled={busy} onClick={onClose} aria-label="关闭关联窗口" className={salesFocusClass}><X size={18} /></button></div>
    <p className="sales-card-hint">为「{action.title}」选择对应脚本，关联后合并为一张素材卡片，无需再次分析或转换。</p>
    <video controls playsInline preload="metadata" src={proxyMediaUrl(action.video || '', { asVideo: true })} className="sales-result-video" />
    <label>对应脚本<select value={selected} onChange={(event) => setSelected(event.target.value)} disabled={busy} className={salesInputClass}>
      <option value="">请选择对应脚本</option>{scripts.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.script.durationSec}s{item.depthVideoUrl ? '（已有深度视频）' : ''}</option>)}
    </select></label>
    {!scripts.length && <p className="sales-card-hint">暂无脚本，请先导入参考视频。</p>}
    {chosen?.depthVideoUrl && chosen.depthVideoUrl !== action.video && <p className="sales-asset-hint is-warn">确认后将替换该脚本当前关联的深度视频。</p>}
    {error && <p role="alert" className="sales-material-error">{error}</p>}
    <div className="sales-material-dialog-actions"><button type="button" disabled={busy} onClick={onClose} className={salesGhostButtonClass}>取消</button>
      <button type="button" disabled={busy || !chosen || !action.video} onClick={() => { void save(); }} className={`sales-collect-primary ${salesFocusClass}`}><Link2 size={14} />{busy ? '正在关联…' : '确认关联'}</button></div>
  </dialog>;
}
