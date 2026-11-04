import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AlertTriangle, ChevronDown, Settings2, X } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import type { SeedancePrecheckEntry } from '@client/shared/api/generation/seedancePrecheck';
import { SeedanceComplianceBadge } from '@client/shared/ui/SeedanceComplianceBadge';
import type { AssembledSalesPrompt, SalesReferenceSlot } from '@shared/domain/sales';
import { salesFocusClass, salesGhostButtonClass } from './salesChrome';

export function SalesReferenceReview({ assembled, confirmed, disabled, seedanceActive, precheckMap, active,
  onConfirm, onEditMaterials, onEditStoryboard, onEditFaces, facesPending,
}: {
  assembled: AssembledSalesPrompt;
  confirmed: boolean;
  disabled: boolean;
  seedanceActive: boolean;
  precheckMap: ReadonlyMap<string, SeedancePrecheckEntry>;
  active: boolean;
  onConfirm: (confirmed: boolean) => void;
  onEditMaterials: () => void;
  onEditStoryboard: () => void;
  onEditFaces?: () => void;
  facesPending?: boolean;
}) {
  const [preview, setPreview] = useState<SalesReferenceSlot | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (preview && active) dialog.current?.showModal();
    else {
      dialog.current?.querySelector('video')?.pause();
      dialog.current?.close();
    }
  }, [active, preview]);
  const rejected = seedanceActive ? assembled.references.filter((slot) => precheckMap.get(slot.url)?.status === 'rejected') : [];
  const expanded = !confirmed || detailsOpen || rejected.length > 0;
  const warnings = [...new Set([...assembled.warnings, ...rejected.map((slot) => `${slot.label}：${precheckMap.get(slot.url)?.error || '素材校验未通过，请更换'}`)])];
  const audioReferences = assembled.audios || [];
  return <section className="sales-delivery-step sales-reference-review" aria-label="核对引用素材">
    <div className="sales-delivery-step-head">
      <strong>使用素材</strong>
      {confirmed && <button type="button" aria-expanded={expanded} onClick={() => setDetailsOpen((open) => !open)} className={`sales-reference-toggle ${salesFocusClass}`}>{expanded ? '收起素材' : '查看素材'}<ChevronDown size={13} aria-hidden /></button>}
    </div>
    <div hidden={!expanded} className="sales-reference-body">
    <div className="sales-reference-grid" style={{ '--sales-reference-count': Math.max(1, assembled.references.length) } as CSSProperties}>
      {assembled.references.map((slot, index) => (
        <article key={`${slot.mediaType}:${slot.url}`} className="sales-reference-card">
          <button type="button" className={`sales-reference-preview ${salesFocusClass}`} aria-label={`查看素材 ${index + 1}：${slot.label}`} title={slot.label} onClick={() => setPreview(slot)}>
            <em className="sales-reference-slot-tag" aria-hidden>{index + 1}</em>
            {slot.mediaType === 'video'
              ? <video muted playsInline preload="metadata" src={proxyMediaUrl(slot.url, { asVideo: true })} />
              : <img src={proxyMediaUrl(slot.url, { thumb: true, width: 400 })} alt={slot.label} />}
          </button>
          {seedanceActive && precheckMap.get(slot.url)?.status === 'rejected' &&
            <SeedanceComplianceBadge entry={precheckMap.get(slot.url)} mediaType={slot.mediaType || 'image'} compact />}
        </article>
      ))}
    </div>
    {audioReferences.map((url, index) => <div key={url} className="sales-binding-voice-preview">
      <span>{assembled.references.length + index + 1}</span>
      <audio controls preload="metadata" src={proxyMediaUrl(url, { asAudio: true })} aria-label={`音频${index + 1}人声参考试听`} />
    </div>)}
    {assembled.voiceIds?.map((id, index) => <p key={id} className="sales-binding-note">{assembled.references.length + audioReferences.length + index + 1} · {id}</p>)}
    {!assembled.references.length && <p className="sales-card-hint">请先选择商品图，再核对引用素材。</p>}
    <div className="sales-reference-edit-actions">
      {onEditFaces && <button type="button" disabled={disabled} onClick={onEditFaces} className={`sales-link-btn ${salesFocusClass}`}>商品图人脸打码</button>}
      <button type="button" disabled={disabled} onClick={onEditStoryboard} className={`sales-link-btn ${salesFocusClass}`}>调整分镜选图</button>
      <button type="button" disabled={disabled} onClick={onEditMaterials} className={`sales-link-btn ${salesFocusClass}`}><Settings2 size={12} aria-hidden />更换人物 / 场景</button>
    </div>
    {warnings.length > 0 && <details className="sales-reference-warnings">
      <summary className={salesFocusClass}><AlertTriangle size={13} aria-hidden />{rejected.length > 0 ? '素材校验未通过，请检查' : `${warnings.length} 项素材提示，展开查看`}<ChevronDown size={13} aria-hidden /></summary>
      {warnings.map((warning, index) => <p key={index}>{warning}</p>)}
    </details>}
    </div>
    <label className={`sales-reference-confirm ${confirmed ? 'is-confirmed' : ''}`}>
      <input type="checkbox" checked={confirmed} disabled={disabled || facesPending || !assembled.references.length || rejected.length > 0} onChange={(event) => { setDetailsOpen(false); onConfirm(event.target.checked); }} />
      <span>{confirmed ? '素材已确认' : '确认使用素材'}</span>
    </label>
    <dialog ref={dialog} className="sales-reference-dialog" aria-label="引用素材预览" onCancel={() => setPreview(null)} onClose={() => setPreview(null)}>
      <header><strong>{preview?.label}</strong><button type="button" aria-label="关闭素材预览" onClick={() => setPreview(null)} className={salesGhostButtonClass}><X size={18} aria-hidden /></button></header>
      {preview && (preview.mediaType === 'video'
        ? <video controls playsInline preload="metadata" src={proxyMediaUrl(preview.url, { asVideo: true })} />
        : <img src={proxyMediaUrl(preview.url)} alt={preview.label} />)}
    </dialog>
  </section>;
}
