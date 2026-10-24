import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import { useAssistantReasoning } from '@client/shared/hooks/useAssistantReasoning';
import { usePromptBarPopoverLayout } from '../hooks/usePromptBarPopoverLayout';
import { loadPromptPreferences, savePromptPreferences } from '../promptBarPreferencesTypes';
import { normalizeReasoningEffort, REASONING_EFFORT_LABELS, reasoningCapability, type ReasoningEffort } from '@shared/domain/assistant/reasoning';
import './promptBarEffort.css';

interface PromptBarReasoningPillProps {
  assistantModel: string;
  isUp?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const PromptBarReasoningPill = function PromptBarReasoningPill({
  assistantModel,
  isUp = true,
  onOpenChange,
}: PromptBarReasoningPillProps) {
  const [open, setOpen] = useState(false);
  const [effort, setEffort] = useAssistantReasoning(assistantModel);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { panelRef, opensUp, panelStyle } = usePromptBarPopoverLayout(open, isUp, buttonRef, 300, 132);
  const capability = reasoningCapability(assistantModel);
  const levels = capability.levels;
  const supported = levels.length > 1;
  const resolved = normalizeReasoningEffort(assistantModel, effort);
  const label = supported ? REASONING_EFFORT_LABELS[resolved] : capability.unavailableLabel || '默认';
  const index = Math.max(0, levels.indexOf(resolved));

  const persistReasoning = (patch: { reasoningEffort?: ReasoningEffort }) => {
    const prefs = loadPromptPreferences();
    savePromptPreferences({
      ...prefs,
      reasoning: {
        ...prefs.reasoning,
        ...patch,
        modelId: assistantModel || prefs.reasoning.modelId,
      },
    });
  };

  useEffect(() => {
    const prefs = loadPromptPreferences();
    savePromptPreferences({
      ...prefs,
      reasoning: {
        ...prefs.reasoning,
        reasoningEffort: effort,
        modelId: assistantModel || prefs.reasoning.modelId,
      },
    });
  }, [assistantModel, effort]);

  useEffect(() => { onOpenChange?.(open); return () => onOpenChange?.(false); }, [open, onOpenChange]);

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

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex h-8 shrink-0 cursor-pointer items-center gap-0.5 rounded-lg px-1 text-[13px] transition-colors ${
          open
            ? 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300'
            : 'text-slate-400 hover:bg-slate-100 hover:text-slate-500 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-300'
        }`}
        title={`当前思考强度：${label}`}
      >
        <span>{label}</span>
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div
          ref={panelRef}
          style={panelStyle}
          className={`absolute z-50 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 px-3.5 py-2.5 text-left shadow-[0_12px_32px_rgba(15,23,42,0.12)] backdrop-blur-xl animate-fade-in dark:border-white/10 dark:bg-[#1c1c1f]/96 dark:text-slate-100 dark:shadow-[0_12px_32px_rgba(0,0,0,0.4)] ${
            opensUp ? 'bottom-full mb-2 origin-bottom' : 'top-full mt-2 origin-top'
          }`}
        >
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
            <span>思考强度</span>
            <strong className="text-sm font-semibold text-purple-600 dark:text-[#d8b4fe]">{label}</strong>
          </div>
          {supported ? (
            <div
              className="prompt-effort-slider"
              style={{
                '--effort-progress': levels.length > 1 ? index / (levels.length - 1) : 0,
              } as CSSProperties}
            >
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
                onChange={(event) => {
                  const next = levels[Number(event.target.value)];
                  setEffort(next);
                  persistReasoning({ reasoningEffort: next });
                }}
              />
            </div>
          ) : (
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{capability.description}</p>
          )}
        </div>
      )}
    </div>
  );
};
