import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Sparkles, X } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import type { AtlasFaceItem, AtlasPoseItem } from '@shared/contracts/salesAtlas';
import { POSE_ANGLE_FULL_LABELS, POSE_ANGLE_ORDER, POSE_ANGLE_SHORT_LABELS } from '../../model/salesActionViews';
import { salesFocusClass, salesPrimaryButtonClass } from '../salesChrome';

export type AtlasLightboxTarget =
  | { kind: 'face'; items: readonly AtlasFaceItem[]; index: number }
  | { kind: 'pose'; items: readonly AtlasPoseItem[]; index: number; initialAngle: string };

const HAIR_LABELS: Record<string, string> = {
  short: '短发',
  medium: '中发',
  semilong: '中长发',
  long: '长发',
};

const SERIES_LABELS: Record<string, string> = {
  full_std: '标准全身',
  upper: '上半身',
  full_sexy: '时尚全身',
  duo: '双人互动',
};

export function AtlasLightboxDialog({
  target,
  pickerMode = 'import',
  importing,
  onNavigate,
  onImportCurrent,
  onClose,
}: {
  target: AtlasLightboxTarget;
  pickerMode?: 'import' | 'pick-persona-main';
  importing: boolean;
  onNavigate: (nextIndex: number) => void;
  onImportCurrent: (id: string, angle?: string) => void;
  onClose: () => void;
}) {
  const [angle, setAngle] = useState(target.kind === 'pose' ? target.initialAngle : 'front');

  useEffect(() => {
    if (target.kind === 'pose') {
      const item = target.items[target.index];
      const hasCurrent = item?.variants.some((v) => v.angle === angle);
      if (!hasCurrent) {
        setAngle(target.initialAngle || item?.variants[0]?.angle || 'front');
      }
    }
  }, [angle, target]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'ArrowLeft' && target.index > 0) {
        event.preventDefault();
        onNavigate(target.index - 1);
      } else if (event.key === 'ArrowRight' && target.index < target.items.length - 1) {
        event.preventDefault();
        onNavigate(target.index + 1);
      } else if (target.kind === 'pose' && /^[1-5]$/.test(event.key)) {
        const keyAngle = POSE_ANGLE_ORDER[Number(event.key) - 1];
        const current = target.items[target.index];
        if (keyAngle && current?.variants.some((v) => v.angle === keyAngle)) {
          event.preventDefault();
          setAngle(keyAngle);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, onNavigate, target]);

  if (target.kind === 'face') {
    const item = target.items[target.index];
    if (!item) return null;
    const sectionName = item.section === 'styling' ? '造型人像' : '纯底正脸';
    const hairName = HAIR_LABELS[item.hair] || '标准发型';
    const imageSrc = proxyMediaUrl(item.fullUrl || item.thumbUrl);
    return (
      <div className="sales-atlas-lightbox" role="dialog" aria-modal="true" aria-label="人像大图预览" onClick={onClose}>
        <header
          className="flex items-center justify-between gap-4 border-b border-white/10 px-6 py-3.5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="min-w-0">
            <h4 className="truncate text-sm font-semibold text-white">
              {hairName} · {sectionName} #{item.id.slice(0, 6)}
            </h4>
            <p className="truncate text-xs text-slate-400">
              {item.style || '正脸平视锚点参考，可直接生成 1+9 全身多视角九宫格'} · {target.index + 1} / {target.items.length}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={importing}
              onClick={() => onImportCurrent(item.id)}
              className={`${salesPrimaryButtonClass} h-9 px-3.5 text-xs ${salesFocusClass}`}
            >
              {pickerMode === 'pick-persona-main' ? <Sparkles className="size-3.5" /> : <Download className="size-3.5" />}
              {pickerMode === 'pick-persona-main' ? '设为主图并继续生成九宫格' : '迁入人物资产库'}
            </button>
            <button
              type="button"
              aria-label="关闭大图预览"
              onClick={onClose}
              className={`inline-flex size-9 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white hover:bg-white/20 ${salesFocusClass}`}
            >
              <X className="size-4" />
            </button>
          </div>
        </header>
        <div className="sales-atlas-lightbox-stage" onClick={(e) => e.stopPropagation()}>
          {target.index > 0 ? (
            <button
              type="button"
              aria-label="上一张人像"
              onClick={() => onNavigate(target.index - 1)}
              className={`absolute left-4 inline-flex size-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white hover:bg-white/20 ${salesFocusClass}`}
            >
              <ChevronLeft className="size-5" />
            </button>
          ) : null}
          <img src={imageSrc} alt={`${hairName}${sectionName}`} />
          {target.index < target.items.length - 1 ? (
            <button
              type="button"
              aria-label="下一张人像"
              onClick={() => onNavigate(target.index + 1)}
              className={`absolute right-4 inline-flex size-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white hover:bg-white/20 ${salesFocusClass}`}
            >
              <ChevronRight className="size-5" />
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  const pose = target.items[target.index];
  if (!pose) return null;
  const activeVariant = pose.variants.find((v) => v.angle === angle) || pose.variants[0];
  const poseSrc = activeVariant ? proxyMediaUrl(activeVariant.fullUrl || activeVariant.thumbUrl) : '';

  return (
    <div className="sales-atlas-lightbox" role="dialog" aria-modal="true" aria-label="多视角姿态大图预览" onClick={onClose}>
      <header
        className="flex items-center justify-between gap-4 border-b border-white/10 px-6 py-3.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold text-white">
            {SERIES_LABELS[pose.series] || pose.series} · {pose.names.zh || pose.names.en} ({pose.no})
          </h4>
          <p className="truncate text-xs text-slate-400">
            {pose.category} · 当前机位：{POSE_ANGLE_FULL_LABELS[activeVariant?.angle || 'front'] || activeVariant?.angle}（快捷键 1–5 切机位，←/→ 切动作）
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            disabled={importing}
            onClick={() => onImportCurrent(pose.id, activeVariant?.angle)}
            className={`${salesPrimaryButtonClass} h-9 px-3.5 text-xs ${salesFocusClass}`}
          >
            <Download className="size-3.5" />
            以当前机位为主封面迁入动作库（含 {pose.variants.length} 视角）
          </button>
          <button
            type="button"
            aria-label="关闭大图预览"
            onClick={onClose}
            className={`inline-flex size-9 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white hover:bg-white/20 ${salesFocusClass}`}
          >
            <X className="size-4" />
          </button>
        </div>
      </header>
      <div className="sales-atlas-lightbox-stage" onClick={(e) => e.stopPropagation()}>
        {target.index > 0 ? (
          <button
            type="button"
            aria-label="上一组姿态"
            onClick={() => onNavigate(target.index - 1)}
            className={`absolute left-4 inline-flex size-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white hover:bg-white/20 ${salesFocusClass}`}
          >
            <ChevronLeft className="size-5" />
          </button>
        ) : null}
        {poseSrc ? <img src={poseSrc} alt={pose.names.zh || pose.id} /> : null}
        {target.index < target.items.length - 1 ? (
          <button
            type="button"
            aria-label="下一组姿态"
            onClick={() => onNavigate(target.index + 1)}
            className={`absolute right-4 inline-flex size-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white hover:bg-white/20 ${salesFocusClass}`}
          >
            <ChevronRight className="size-5" />
          </button>
        ) : null}
      </div>
      <footer className="sales-atlas-lightbox-strip" onClick={(e) => e.stopPropagation()}>
        {pose.variants.map((variant, idx) => {
          const isCurrent = variant.angle === activeVariant?.angle;
          return (
            <button
              key={variant.angle}
              type="button"
              onClick={() => setAngle(variant.angle)}
              className={`sales-atlas-lightbox-thumb ${isCurrent ? 'is-active' : ''} ${salesFocusClass}`}
            >
              <img src={proxyMediaUrl(variant.thumbUrl || variant.fullUrl)} alt={variant.angle} />
              <span className="text-[11px] font-medium text-slate-200">
                {idx + 1}. {POSE_ANGLE_SHORT_LABELS[variant.angle] || variant.angle}
              </span>
            </button>
          );
        })}
      </footer>
    </div>
  );
}

