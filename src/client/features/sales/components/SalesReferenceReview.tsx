import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Expand, Settings2, X } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import type { SeedancePrecheckEntry } from '@client/shared/api/generation/seedancePrecheck';
import { SeedanceComplianceBadge } from '@client/shared/ui/SeedanceComplianceBadge';
import type { AssembledSalesPrompt, BeatProductImageBinding, SalesReferenceSlot } from '@shared/domain/sales';
import { salesFocusClass, salesGhostButtonClass } from './salesChrome';

const roleLabels: Record<SalesReferenceSlot['kind'], string> = {
  product: '商品参考', persona_identity: '人物原图', persona_body: '人物形象', persona_face: '人物面部', scene: '拍摄场景', action: '动作参考',
};

export function SalesReferenceReview({ assembled, beatBindings, confirmed, disabled, seedanceActive, precheckMap, active,
  onConfirm, onEditMaterials, onEditStoryboard,
}: {
  assembled: AssembledSalesPrompt;
  beatBindings: readonly BeatProductImageBinding[];
  confirmed: boolean;
  disabled: boolean;
  seedanceActive: boolean;
  precheckMap: ReadonlyMap<string, SeedancePrecheckEntry>;
  active: boolean;
  onConfirm: (confirmed: boolean) => void;
  onEditMaterials: () => void;
  onEditStoryboard: () => void;
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
  return <section className="sales-delivery-step sales-reference-review" aria-label="核对引用素材">
    <div className="sales-delivery-step-head">
      <strong><span className="sales-step-number">{confirmed ? <Check size={12} aria-hidden /> : '1'}</span>确认素材 <span className="sales-card-hint">{assembled.references.length} 份引用</span></strong>
      {confirmed && <button type="button" aria-expanded={expanded} onClick={() => setDetailsOpen((open) => !open)} className={`sales-reference-toggle ${salesFocusClass}`}>{expanded ? '收起素材' : '查看素材'}<ChevronDown size={13} aria-hidden /></button>}
    </div>
    <div hidden={!expanded} className="sales-reference-body">
    <p className="sales-card-hint">点击图片查看大图，核对本次视频使用的商品、人物与场景。</p>
    <div className="sales-reference-grid">
      {assembled.references.map((slot, index) => {
        const beats = beatBindings.filter((binding) => binding.image?.url === slot.url).map((binding) => binding.beatIndex + 1);
        const refTag = `#${String(index + 1).padStart(2, '0')} · ${slot.mediaType === 'video' ? '视频' : '图'}`;
        return <article key={`${slot.mediaType}:${slot.url}`} className="sales-reference-card">
          <button type="button" className={`sales-reference-preview ${salesFocusClass}`} aria-label={`查看${slot.label}`} onClick={() => setPreview(slot)}>
            <em className="sales-reference-slot-tag" aria-hidden>{refTag}</em>
            {slot.mediaType === 'video'
              ? <video muted playsInline preload="metadata" src={proxyMediaUrl(slot.url, { asVideo: true })} />
              : <img src={proxyMediaUrl(slot.url, { thumb: true, width: 400 })} alt={slot.label} />}
            <span><Expand size={12} aria-hidden />查看{slot.mediaType === 'video' ? '视频' : '大图'}</span>
          </button>
          <div className="sales-reference-caption">
            <strong>{roleLabels[slot.kind]}</strong><span title={slot.label}>{slot.label}</span>
            {beats.length > 0 && <small title={`用于第 ${beats.join('、')} 段`}>用于第 {beats.join('、')} 段</small>}
            {slot.kind === 'product' && beats.length === 0 && <small>全片商品补充参考</small>}
            {seedanceActive && <SeedanceComplianceBadge entry={precheckMap.get(slot.url)} mediaType={slot.mediaType || 'image'} compact />}
          </div>
        </article>;
      })}
    </div>
    {!assembled.references.length && <p className="sales-card-hint">请先选择商品图，再核对引用素材。</p>}
    <div className="sales-reference-edit-actions">
      <button type="button" disabled={disabled} onClick={onEditStoryboard} className={`sales-link-btn ${salesFocusClass}`}>调整分镜选图</button>
      <button type="button" disabled={disabled} onClick={onEditMaterials} className={`sales-link-btn ${salesFocusClass}`}><Settings2 size={12} aria-hidden />更换人物 / 场景</button>
    </div>
    {warnings.length > 0 && <details className="sales-reference-warnings" open={rejected.length > 0}>
      <summary className={salesFocusClass}><AlertTriangle size={13} aria-hidden />{rejected.length > 0 ? '素材校验未通过，请检查' : `${warnings.length} 项素材提示，展开查看`}<ChevronDown size={13} aria-hidden /></summary>
      {warnings.map((warning, index) => <p key={index}>{warning}</p>)}
    </details>}
    </div>
    <label className={`sales-reference-confirm ${confirmed ? 'is-confirmed' : ''}`}>
      <input type="checkbox" checked={confirmed} disabled={disabled || !assembled.references.length || rejected.length > 0} onChange={(event) => { setDetailsOpen(false); onConfirm(event.target.checked); }} />
      <span>{confirmed ? '素材已确认' : '我已核对以上素材，确认使用'}</span>
    </label>
    <dialog ref={dialog} className="sales-reference-dialog" aria-label="引用素材预览" onCancel={() => setPreview(null)} onClose={() => setPreview(null)}>
      <header><strong>{preview?.label}</strong><button type="button" aria-label="关闭素材预览" onClick={() => setPreview(null)} className={salesGhostButtonClass}><X size={18} aria-hidden /></button></header>
      {preview && (preview.mediaType === 'video'
        ? <video controls playsInline preload="metadata" src={proxyMediaUrl(preview.url, { asVideo: true })} />
        : <img src={proxyMediaUrl(preview.url)} alt={preview.label} />)}
    </dialog>
  </section>;
}
