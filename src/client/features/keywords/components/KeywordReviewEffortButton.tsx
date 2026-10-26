import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import { usePromptBarPopoverLayout } from '@client/shared/prompt-bar/hooks/usePromptBarPopoverLayout';
import { normalizeReasoningEffort, REASONING_EFFORT_LABELS, reasoningCapability, type ReasoningEffort } from '@shared/domain/assistant/reasoning';
import '@client/shared/prompt-bar/controls/promptBarEffort.css';
import { readStoredKeywordReviewReasoning, saveKeywordReviewReasoning } from '../model/keywordReviewReasoning';

interface Props {
  model: string;
  disabled: boolean;
}

export function KeywordReviewEffortButton({ model, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [stored, setStored] = useState<ReasoningEffort>(readStoredKeywordReviewReasoning);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { panelRef, opensUp, panelStyle } = usePromptBarPopoverLayout(open, false, buttonRef, 300, 132);
  const capability = reasoningCapability(model);
  const levels = capability.levels;
  const supported = levels.length > 1;
  const resolved = normalizeReasoningEffort(model, stored);
  const label = supported ? REASONING_EFFORT_LABELS[resolved] : capability.unavailableLabel || '默认';
  const index = Math.max(0, levels.indexOf(resolved));

  useEffect(() => {
    setStored(readStoredKeywordReviewReasoning());
  }, [model]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open, panelRef]);

  const choose = (value: ReasoningEffort) => {
    const next = normalizeReasoningEffort(model, value);
    setStored(next);
    saveKeywordReviewReasoning(next);
  };

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`思考强度：${label}`}
        title={`当前思考强度：${label}`}
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex h-10 items-center gap-1 rounded-xl border bg-white/90 px-3 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#1B1B1E]/90 ${
          open
            ? 'border-white/[0.12] text-slate-800 dark:border-white/[0.12] dark:text-slate-100'
            : 'border-white/[0.07] text-slate-600 hover:border-white/[0.12] dark:text-slate-300 dark:hover:border-white/[0.12]'
        }`}
      >
        <span>{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && !disabled && (
        <div
          ref={panelRef}
          style={panelStyle}
          role="dialog"
          aria-label="思考强度"
          className={`absolute z-50 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/95 px-3.5 py-2.5 text-left shadow-[0_12px_32px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:bg-[#1c1c1f]/96 dark:text-slate-100 dark:shadow-[0_12px_32px_rgba(0,0,0,0.4)] ${
            opensUp ? 'bottom-full mb-2 origin-bottom' : 'top-full mt-2 origin-top'
          }`}
        >
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
            <span>思考强度</span>
            <strong className="text-sm font-semibold text-purple-600 dark:text-[#d8b4fe]">{label}</strong>
          </div>
          {supported ? (
            <div className="prompt-effort-slider" style={{ '--effort-progress': levels.length > 1 ? index / (levels.length - 1) : 0 } as CSSProperties}>
              <div className="prompt-effort-rail" aria-hidden="true">
                <span className="prompt-effort-fill" />
                <div className="prompt-effort-ticks">{levels.map((value, tick) => <i key={value} data-filled={tick <= index} />)}</div>
                <span className="prompt-effort-thumb" />
              </div>
              <input
                type="range"
                className="prompt-effort-range"
                min={0}
                max={levels.length - 1}
                step={1}
                value={index}
                aria-label="思考强度档位"
                aria-valuetext={REASONING_EFFORT_LABELS[resolved]}
                onChange={(event) => choose(levels[Number(event.target.value)])}
              />
            </div>
          ) : (
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{capability.description}</p>
          )}
        </div>
      )}
    </div>
  );
}
