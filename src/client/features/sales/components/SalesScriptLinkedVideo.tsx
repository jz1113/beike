import { useRef, useState } from 'react';
import { Layers, Link2, Loader2, Upload } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import type { SalesActionCandidate } from '@shared/domain/sales';
import { fetchSalesStudioAssets } from '../api/salesProduction';
import { patchSalesScript, uploadScriptVideo, type StoredSalesScript } from '../api/salesScripts';
import type { SalesScriptDraft } from '../hooks/useSalesScripts';
import { compareSalesAssetNames } from '../model/salesAssetNames';
import { salesFocusClass, salesGhostButtonClass } from './salesChrome';

interface Props {
  draft: SalesScriptDraft;
  disabled: boolean;
  onSaved: (item: StoredSalesScript) => void;
  onConvert: (item: StoredSalesScript, file?: File) => void;
}
export function SalesScriptLinkedVideo({ draft, disabled, onSaved, onConvert }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [actions, setActions] = useState<SalesActionCandidate[] | null>(null);
  const [selected, setSelected] = useState('');
  const current: StoredSalesScript = { ...draft, id: draft.id || '', title: draft.script.title,
    videoUrl: draft.videoUrl || '', videoHash: draft.videoHash || '', version: 1, useCount: 0, updatedAt: '' };
  const working = disabled || busy || !draft.id;
  const pendingDepth = Boolean(draft.depthOperationId || draft.depthTaskId);
  const canUploadSource = !draft.depthVideoUrl && !draft.videoUrl && !pendingDepth;
  const loadActions = async () => {
    setBusy(true); setError('');
    try {
      const catalog = await fetchSalesStudioAssets();
      setActions(catalog.actions.filter((item) => item.mediaType === 'depth-video' && item.mediaUrl).sort((a, b) => compareSalesAssetNames(a.title, b.title)));
    } catch (err) { setError(err instanceof Error ? err.message : '读取深度动作失败'); }
    finally { setBusy(false); }
  };
  const bindAction = async () => {
    const action = actions?.find((item) => item.id === selected);
    if (!action || !draft.id) return;
    setBusy(true); setError('');
    try {
      const saved = await patchSalesScript(draft.id, { depthVideoUrl: action.mediaUrl,
        depthTaskId: '', depthOperationId: '' });
      onSaved(saved); setActions(null);
    } catch (err) { setError(err instanceof Error ? err.message : '关联失败'); }
    finally { setBusy(false); }
  };
  const attachSource = async (file: File) => {
    if (!draft.id) return;
    setBusy(true); setError('');
    try {
      const uploaded = await uploadScriptVideo(file);
      const saved = await patchSalesScript(draft.id, { videoUrl: uploaded.videoUrl });
      onSaved(saved);
      if (!saved.depthVideoUrl) onConvert(saved, file);
    } catch (err) { setError(err instanceof Error ? err.message : '上传深度转换素材失败'); }
    finally { setBusy(false); }
  };
  return <section className="sales-prod-card sales-script-linked-video" aria-label="脚本关联视频">
    <div className="sales-script-linked-previews">
      {draft.depthVideoUrl && <figure><figcaption><Layers size={13} aria-hidden />深度动作视频</figcaption><video controls playsInline preload="metadata" aria-label="脚本深度动作视频" src={proxyMediaUrl(draft.depthVideoUrl, { asVideo: true })} /></figure>}
    </div>
    {!draft.depthVideoUrl && <p className="sales-card-hint">{pendingDepth
      ? '已有深度处理任务，可查询处理结果。'
      : draft.videoUrl ? '尚未关联深度动作视频，可使用已保存素材补生成，或关联已有深度动作。'
        : '尚未关联深度动作视频。上传源视频生成深度，或关联已有深度动作。'}</p>}
    <div className="flex flex-wrap gap-2">
      {canUploadSource && <button type="button" disabled={working} onClick={() => fileInput.current?.click()} className={salesGhostButtonClass}><Upload size={13} />上传视频生成深度</button>}
      {!draft.depthVideoUrl && (draft.videoUrl || pendingDepth) && <button type="button" disabled={working} onClick={() => onConvert(current)} className={salesGhostButtonClass}><Layers size={13} />{pendingDepth ? '查询关联深度任务' : '补生成深度视频'}</button>}
      <button type="button" disabled={working} onClick={() => { void loadActions(); }} className={salesGhostButtonClass}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}关联已有深度动作</button>
    </div>
    {canUploadSource && <input ref={fileInput} type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" className="hidden" aria-label="上传用于生成深度动作的源视频" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void attachSource(file); }} />}
    {actions && <div className="flex flex-wrap items-center gap-2">
      {actions.length ? <><select value={selected} onChange={(e) => setSelected(e.target.value)} disabled={working} aria-label="选择关联深度动作" className={salesFocusClass}><option value="">选择与脚本对应的深度动作</option>{actions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><button type="button" disabled={working || !selected} onClick={() => { void bindAction(); }} className={salesGhostButtonClass}>保存关联</button></> : <p className="sales-card-hint">暂无可关联的深度动作视频，可先补生成。</p>}
    </div>}
    {error && <p role="alert" className="sales-material-error">{error}</p>}
  </section>;
}
