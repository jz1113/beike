import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import type { SeedancePrecheckEntry } from '../api/generation/seedancePrecheck';

interface Props {
  entry?: SeedancePrecheckEntry;
  mediaType?: 'image' | 'video' | 'depth-image' | 'depth-video';
  width?: number;
  height?: number;
  durationSec?: number;
  compact?: boolean;
  showResolution?: boolean;
}

export function SeedanceComplianceBadge({ entry, mediaType, width, height, durationSec, compact, showResolution = true }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tooltipId = useId();
  const show = () => { clearTimeout(closeTimer.current); setOpen(true); };
  const close = () => { clearTimeout(closeTimer.current); pinned.current = false; setOpen(false); };
  const leave = () => {
    if (!pinned.current && !triggerRef.current?.matches(':focus-visible')) closeTimer.current = setTimeout(() => setOpen(false), 180);
  };

  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useEffect(() => {
    if (!open) return;
    const dismiss = () => { clearTimeout(closeTimer.current); pinned.current = false; setOpen(false); };
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !tooltipRef.current?.contains(target)) dismiss();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open]);
  useLayoutEffect(() => {
    const tooltip = tooltipRef.current;
    const trigger = triggerRef.current;
    if (!tooltip || !trigger) return;
    if (!open) { tooltip.hidePopover(); return; }
    // The top layer escapes clipped cards and transformed canvas ancestors.
    tooltip.showPopover();
    const position = () => {
      const anchor = trigger.getBoundingClientRect();
      const viewport = window.visualViewport;
      const leftEdge = (viewport?.offsetLeft ?? 0) + 12;
      const topEdge = (viewport?.offsetTop ?? 0) + 12;
      const rightEdge = leftEdge + (viewport?.width ?? window.innerWidth) - 24;
      const bottomEdge = topEdge + (viewport?.height ?? window.innerHeight) - 24;
      if (anchor.bottom < topEdge || anchor.top > bottomEdge || anchor.right < leftEdge || anchor.left > rightEdge) {
        clearTimeout(closeTimer.current);
        pinned.current = false;
        setOpen(false);
        return;
      }
      tooltip.style.width = `${Math.max(1, Math.min(340, rightEdge - leftEdge))}px`;
      tooltip.style.maxHeight = `${Math.max(1, bottomEdge - topEdge)}px`;
      const above = Math.max(0, anchor.top - topEdge - 8);
      const below = Math.max(0, bottomEdge - anchor.bottom - 8);
      const useAbove = above >= tooltip.offsetHeight || above > below;
      tooltip.style.maxHeight = `${Math.max(1, useAbove ? above : below)}px`;
      tooltip.style.left = `${Math.max(leftEdge, Math.min(anchor.left, rightEdge - tooltip.offsetWidth))}px`;
      tooltip.style.top = `${Math.max(topEdge, useAbove ? anchor.top - tooltip.offsetHeight - 8 : anchor.bottom + 8)}px`;
    };
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && tooltip.contains(event.target)) return;
      position();
    };
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', onScroll, true);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', onScroll, true);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
    };
  }, [open, entry?.error, entry?.durationSec, mediaType, width, height, durationSec]);

  const isVideo = mediaType === 'video' || mediaType === 'depth-video' || entry?.mediaType === 'video';
  const status = entry?.status || 'verifying';
  const resolvedW = width || entry?.width || 0;
  const resolvedH = height || entry?.height || 0;
  const resolvedDur = durationSec || entry?.durationSec || 0;
  const resolutionText = resolvedW > 0 && resolvedH > 0 ? `${resolvedW} × ${resolvedH}` : '';

  const dotColor =
    status === 'verifying'
      ? 'bg-sky-400 animate-pulse'
      : status === 'passed'
        ? 'bg-emerald-400'
        : status === 'rejected'
          ? 'bg-rose-500'
          : 'bg-amber-400';

  const statusText =
    status === 'verifying'
      ? '校验中'
      : status === 'passed'
        ? '合规已就绪'
        : status === 'rejected'
          ? '校验未通过'
          : '待生成时校验';

  const textColor =
    status === 'verifying'
      ? 'text-sky-400'
      : status === 'passed'
        ? 'text-emerald-400'
        : status === 'rejected'
          ? 'text-rose-400'
          : 'bg-transparent text-amber-300';

  return (
    <div className="inline-flex flex-wrap items-center gap-1.5">
      <button ref={triggerRef} type="button" aria-label={`Seedance 合规校验：${statusText}`}
        aria-describedby={tooltipId} aria-expanded={open} aria-controls={tooltipId}
        className="inline-flex cursor-help items-center gap-1.5 rounded text-left select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        onPointerEnter={(event) => { if (event.pointerType !== 'touch') show(); }} onPointerLeave={leave}
        onFocus={show} onBlur={() => { if (!pinned.current) close(); }}
        onClick={() => { if (pinned.current) close(); else { pinned.current = true; show(); } }}>
      <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${textColor}`}>
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
        <span>{statusText}</span>
      </span>
      {!compact && showResolution && resolutionText && (
        <span className="text-[11px] font-mono text-slate-400 dark:text-slate-400">{resolutionText}</span>
      )}
      {!compact && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/10 dark:bg-white/10 text-[11px] text-slate-300 border border-white/10">
          <span>Seedance合规校验</span>
          <HelpCircle className="w-3 h-3 opacity-75" />
        </span>
      )}
      </button>
      <div
        ref={tooltipRef} id={tooltipId} popover="manual"
        role="tooltip"
        onPointerEnter={show} onPointerLeave={leave}
        onToggle={(event) => { if (event.newState === 'closed') close(); }}
        className="fixed inset-auto m-0 box-border overflow-y-auto overscroll-contain rounded-lg border border-white/15 bg-[#1F2024] p-3 font-sans text-left text-[13px] leading-relaxed whitespace-normal text-white shadow-xl select-text [overflow-wrap:anywhere]"
      >
        <div className="mb-1 text-[13px] font-semibold text-white">
          {isVideo ? '待校验视频要求' : '待校验图片要求'}
        </div>
        {isVideo ? (
          <div className="text-slate-200">
            时长：2 ~ 30 秒{resolvedDur > 0 ? `（当前 ${resolvedDur.toFixed(1)} 秒）` : ''}
          </div>
        ) : (
          <div className="text-slate-200">支持合规清晰的人物、场景或商品参考图</div>
        )}
        {entry?.error && (
          <div className="mt-2 whitespace-pre-wrap text-rose-200">{entry.error}</div>
        )}
        <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-xs text-slate-200">
          <span>Seedance合规校验</span>
        </div>
      </div>
    </div>
  );
}
