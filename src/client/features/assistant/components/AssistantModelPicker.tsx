import { useAssistantDialog } from './useAssistantDialog';
import { isDeepSeekRoute } from '@shared/domain/models/deepseek';
import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { getModelIcon } from '@client/shared/ui/ModelIcons';
import { groupAssistantModels } from '../model/groupAssistantModels';
import { resolveAssistantModelLabel } from '../model/assistantConstants';
import { normalizeReasoningEffort, reasoningCapability, type ReasoningEffort } from '@shared/domain/assistant/reasoning';

export interface AssistantModelOption { id: string; name?: string; shortName?: string; provider?: string; badge?: string }
export const EFFORT_LABELS: Record<ReasoningEffort, string> = { auto: '默认', low: '低', medium: '中', high: '高', xhigh: '极高' };
const descriptions = { auto: '使用模型默认设置。', low: '更快回应，适合提取、改写与简单问答。', medium: '兼顾响应速度与分析深度。', high: '适合复杂规划、比较和多步分析。', xhigh: '投入更多推理时间，可能增加等待与消耗。' };
interface Props {
  models: AssistantModelOption[]; model: string; current: Omit<AssistantModelOption, 'id'>;
  onModelChange: (id: string) => void; effort: ReasoningEffort; onEffortChange: (value: ReasoningEffort) => void;
  open: boolean; onOpenChange: (open: boolean) => void; menuRef: React.RefObject<HTMLDivElement | null>;
}
/** Manufacturer groups share one keyboard-navigable list without changing model routing. */
export default function AssistantModelPicker({ models, model, current, onModelChange, effort, onEffortChange, open, onOpenChange, menuRef }: Props) {
  const [tab, setTab] = useState<'model' | 'effort'>('model');
  const [active, setActive] = useState(model);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const effortRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const capability = reasoningCapability(model);
  const levels = capability.levels;
  const supported = levels.length > 1;
  const resolved = normalizeReasoningEffort(model, effort);
  const label = resolveAssistantModelLabel({ ...current, id: model }).split(' · ')[0] + (isDeepSeekRoute(model) ? ' · 官方' : '');
  const groups = groupAssistantModels(models);
  const visible = groups.flatMap(group => group.models);
  const activeIndex = visible.findIndex(m => m.id === active);
  const close = () => { onOpenChange(false); (tab === 'model' ? triggerRef : effortRef).current?.focus(); };
  const focusSurface = useAssistantDialog(open, close, { initialFocusSelector: tab === 'model' ? '[role="listbox"]' : 'input' });
  const select = (value: string) => { onModelChange(value); close(); };
  const toggle = (next: 'model' | 'effort') => { setTab(next); onOpenChange(!open || tab !== next); };
  useEffect(() => {
    if (!open) return;
    setActive(model);
    if (tab === 'model') listRef.current?.focus();
    else listRef.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, [open, tab, model]);
  useEffect(() => {
    if (open && tab === 'model') listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, open, tab]);
  return <div className="agent-model-picker" ref={menuRef} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) onOpenChange(false); }} onKeyDown={e => {
    if (e.key === 'Escape' && open) { e.stopPropagation(); close(); }
  }}>
    <div className="agent-model-controls">
      <button ref={triggerRef} type="button" className="agent-model-trigger" aria-label={`选择模型：${label || '未选择'}`} aria-haspopup="listbox" aria-expanded={open && tab === 'model'} aria-controls={`${id}-models`} onClick={() => toggle('model')}>
        {getModelIcon(model, 'w-3.5 h-3.5 shrink-0')}<span className="truncate">{label || '选择模型'}</span><ChevronDown size={12} />
      </button>
      <button ref={effortRef} type="button" className="agent-effort-trigger" aria-label="调整思考强度" aria-haspopup="dialog" aria-expanded={open && tab === 'effort'} onClick={() => toggle('effort')}>
        <span>{supported ? EFFORT_LABELS[resolved] : capability.unavailableLabel}</span><ChevronDown size={11} />
      </button>
    </div>
    {open && tab === 'model' && <section ref={focusSurface} tabIndex={-1} className="agent-popover agent-model-panel" aria-label="模型选择">
      <div ref={listRef} className="agent-model-list" role="listbox" tabIndex={0} id={`${id}-models`} aria-label="按厂商选择模型" aria-activedescendant={activeIndex >= 0 ? `${id}-option-${active}` : undefined} onKeyDown={e => {
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
          e.preventDefault();
          const next = e.key === 'Home' ? 0 : e.key === 'End' ? visible.length - 1 : Math.max(0, Math.min(visible.length - 1, activeIndex + (e.key === 'ArrowDown' ? 1 : -1)));
          setActive(visible[next]?.id || '');
        }
        if ((e.key === 'Enter' || e.key === ' ') && activeIndex >= 0) { e.preventDefault(); select(visible[activeIndex].id); }
      }}>
        {groups.map(group => <div role="group" aria-label={group.label} key={group.vendor}>
          {group.models.map(m => <button type="button" role="option" tabIndex={-1} id={`${id}-option-${m.id}`} key={m.id} className="agent-model-option" title={`${resolveAssistantModelLabel(m)} · ${m.provider || m.badge || m.id}`} aria-selected={m.id === model} data-active={m.id === active} onPointerMove={() => setActive(m.id)} onFocus={() => setActive(m.id)} onClick={() => select(m.id)}>
            {getModelIcon(m.id, 'w-4 h-4 shrink-0')}
            <span className="agent-model-option-label"><strong>{resolveAssistantModelLabel(m).split(' · ')[0]}</strong>{(isDeepSeekRoute(m.id) || models.some(other => other.id !== m.id && resolveAssistantModelLabel(other).split(' · ')[0] === resolveAssistantModelLabel(m).split(' · ')[0])) && <small>{isDeepSeekRoute(m.id) ? ['官方', m.badge].filter(Boolean).join(' · ') : m.provider || m.badge || m.id}</small>}</span>
            {m.id === model && <Check size={15} />}
          </button>)}
        </div>)}
        {!visible.length && <p className="agent-empty-result">暂无已启用的模型，请在设置中添加。</p>}
      </div>
    </section>}
    {open && tab === 'effort' && <section ref={focusSurface} tabIndex={-1} role="dialog" aria-label="思考强度" className="agent-popover agent-effort-panel">
      <div className="agent-effort-heading">
        <div className="agent-effort-summary">
          <span className="agent-effort-caption">思考强度</span>
          <strong key={resolved}>{supported ? EFFORT_LABELS[resolved] : capability.unavailableLabel}</strong>
        </div>
      </div>
      {supported ? <div className="agent-effort-slider" style={{ '--effort-progress': levels.indexOf(resolved) / (levels.length - 1) } as React.CSSProperties}>
        <div className="agent-effort-rail" aria-hidden="true">
          <span className="agent-effort-fill" />
          <div className="agent-effort-ticks">{levels.map((value, index) => <i key={value} data-filled={index <= levels.indexOf(resolved)} />)}</div>
          <span className="agent-effort-thumb" />
        </div>
        <input type="range" className="agent-effort-range" min={0} max={levels.length - 1} step={1} value={levels.indexOf(resolved)} aria-label="思考强度档位" aria-valuetext={EFFORT_LABELS[resolved]} aria-describedby={`${id}-effort-hint`} title={descriptions[resolved]} onChange={e => onEffortChange(levels[Number(e.target.value)])} />
        <span id={`${id}-effort-hint`} className="sr-only">{descriptions[resolved]} 可选档位：{levels.map(level => EFFORT_LABELS[level]).join('、')}。</span>
      </div> : null}
      {!supported && <p className="agent-effort-description">{capability.description}</p>}

    </section>}
  </div>;
}
