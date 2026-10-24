import type { CSSProperties } from 'react';
import { normalizeReasoningEffort, REASONING_EFFORT_LABELS, reasoningCapability, type ReasoningEffort } from '@shared/domain/assistant/reasoning';
import type { TextProtocol } from '@shared/domain/models/textProtocol';
import '@client/shared/prompt-bar/controls/promptBarEffort.css';

const descriptions: Record<ReasoningEffort, string> = {
  auto: '使用模型默认设置。',
  low: '更快回应，适合提取、改写与简单问答。',
  medium: '兼顾响应速度与分析深度。',
  high: '适合复杂规划、比较和多步分析。',
  xhigh: '投入更多推理时间，可能增加等待与消耗。',
  max: '使用模型最高推理深度，适合复杂难题。',
};

interface Props {
  modelId: string;
  protocol?: TextProtocol;
  effort: ReasoningEffort;
  disabled: boolean;
  onChange: (value: ReasoningEffort) => void;
}

export function CoverFeedEffort({ modelId, protocol, effort, disabled, onChange }: Props) {
  const capability = reasoningCapability(modelId, protocol);
  const levels = capability.levels;
  const supported = levels.length > 1;
  const resolved = normalizeReasoningEffort(modelId, effort, protocol);
  const label = supported ? REASONING_EFFORT_LABELS[resolved] : capability.unavailableLabel || '默认';
  const index = Math.max(0, levels.indexOf(resolved));

  return (
    <div className={`mb-3 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-slate-500">思考强度</span>
        <span className="text-[11px] font-semibold text-violet-700 dark:text-violet-200">{label}</span>
      </div>
      <div className="mt-1 rounded-xl border border-slate-200 bg-white px-4 dark:border-white/10 dark:bg-black/30">
        {supported ? (
          <div
            className="prompt-effort-slider"
            style={{ '--effort-progress': levels.length > 1 ? index / (levels.length - 1) : 0 } as CSSProperties}
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
              disabled={disabled}
              aria-label="思考强度档位"
              aria-valuetext={REASONING_EFFORT_LABELS[resolved]}
              title={descriptions[resolved]}
              onChange={(event) => {
                const next = levels[Number(event.target.value)];
                if (next) onChange(next);
              }}
            />
          </div>
        ) : (
          <p className="px-1 py-2 text-[11px] leading-5 text-slate-500">{capability.description}</p>
        )}
      </div>
    </div>
  );
}
