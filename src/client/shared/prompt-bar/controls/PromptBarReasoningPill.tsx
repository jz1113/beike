import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { useAssistantReasoning } from '@client/shared/hooks/useAssistantReasoning';
import { usePromptBarPopoverLayout } from '../hooks/usePromptBarPopoverLayout';
import { loadPromptPreferences, savePromptPreferences } from '../promptBarPreferencesTypes';
import { normalizeReasoningEffort, REASONING_EFFORT_LABELS, reasoningCapability, type ReasoningEffort } from '@shared/domain/assistant/reasoning';
import './promptBarEffort.css';

interface PromptBarReasoningPillProps {
  assistantModel: string;
  isUp?: boolean;
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
  value?: ReasoningEffort;
  onChange?: (effort: ReasoningEffort) => void;
}

export const PromptBarReasoningPill = function PromptBarReasoningPill({
  assistantModel,
  isUp = true,
  disabled = false,
  onOpenChange,
  value: controlledValue,
  onChange: onControlledChange,
}: PromptBarReasoningPillProps) {
  const [open, setOpen] = useState(false);
  const [storedEffort, setStoredEffort] = useAssistantReasoning(assistantModel);
  const effort = controlledValue ?? storedEffort;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isOpen = open && !disabled;
  const { panelRef, opensUp, panelStyle } = usePromptBarPopoverLayout(isOpen, isUp, buttonRef, 256, 100, false, true, { alignEnd: true, offsetX: 48 });
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

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => { onOpenChange?.(isOpen); return () => onOpenChange?.(false); }, [isOpen, onOpenChange]);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, panelRef]);

  const panel = isOpen ? (
    <div
      ref={panelRef}
      style={panelStyle}
      role="dialog"
      aria-label="思考强度"
      className={`fixed z-[10010] overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 px-3 py-2 text-left shadow-[0_12px_32px_rgba(15,23,42,0.12)] backdrop-blur-xl animate-fade-in dark:border-white/10 dark:bg-[#1c1c1f]/96 dark:text-slate-100 dark:shadow-[0_12px_32px_rgba(0,0,0,0.4)] ${
        opensUp ? 'origin-bottom' : 'origin-top'
      }`}
    >
      <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
        <span>思考强度</span>
        <strong className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</strong>
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
              setStoredEffort(next);
              onControlledChange?.(next);
              persistReasoning({ reasoningEffort: next });
            }}
          />
        </div>
      ) : (
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{capability.description}</p>
      )}
    </div>
  ) : null;

  const dialogHost = buttonRef.current?.closest('dialog[open]');
  const portalTarget = dialogHost || (typeof document !== 'undefined' ? document.body : null);

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={`思考强度：${label}`}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-8 shrink-0 cursor-pointer items-center gap-0.5 rounded-lg px-1 text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          isOpen
            ? 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300'
            : 'text-slate-400 hover:bg-slate-100 hover:text-slate-500 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-300'
        }`}
        title={`当前思考强度：${label}`}
      >
        <span>{label}</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {panel && (portalTarget ? createPortal(panel, portalTarget) : panel)}
    </div>
  );
};
