import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Clapperboard, Flame, Image, Sparkles } from 'lucide-react';
import type { UsageRange, UsageSummary } from '@client/shared/utils/usageTracker';

const RANGES: { id: UsageRange; label: string }[] = [
  { id: 'today', label: '今天' },
  { id: '30d', label: '最近 30 天' },
  { id: '90d', label: '最近 90 天' },
  { id: '1y', label: '最近一年' },
  { id: 'all', label: '全部时间' },
];

function formatTokens(value: number) {
  return value > 0 ? value.toLocaleString() : '—';
}

export function CreatorMilestones({
  usageRange,
  setUsageRange,
  usageSummary,
}: {
  usageRange: UsageRange;
  setUsageRange: (range: UsageRange) => void;
  usageSummary: UsageSummary;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  const current = RANGES.find(item => item.id === usageRange) ?? RANGES[1];
  const metrics = [
    { icon: Image, label: '生成图片', value: usageSummary.imageCount.toLocaleString(), unit: '张' },
    { icon: Clapperboard, label: '生成视频', value: usageSummary.videoCount.toLocaleString(), unit: '支' },
    { icon: Sparkles, label: '已记录 Token', value: formatTokens(usageSummary.totalTokens), unit: '' },
    { icon: Flame, label: '当前连续创作', value: String(usageSummary.currentStreakDays), unit: '天' },
    { icon: Check, label: '最长连续创作', value: String(usageSummary.longestStreakDays), unit: '天' },
  ];

  return (
    <section className="settings-milestone-wrap" aria-label="我的创作里程">
      <div className="settings-milestone-head">
        <h3>我的创作里程</h3>
        <div className="settings-range" ref={rootRef}>
          <button type="button" aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen(value => !value)}>
            <span>{current.label}</span><ChevronDown className="h-3.5 w-3.5" />
          </button>
          {open && (
            <div role="listbox" aria-label="统计时间范围">
              {RANGES.map(item => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={item.id === usageRange}
                  onClick={() => { setUsageRange(item.id); setOpen(false); }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="settings-milestone">
        <div className="settings-milestone-grid">
          {metrics.map(metric => {
            const Icon = metric.icon;
            return (
              <div key={metric.label}>
                <span><Icon className="h-3.5 w-3.5" />{metric.label}</span>
                <div className="settings-milestone-value">
                  <strong>{metric.value}</strong>
                  {metric.unit && <small>{metric.unit}</small>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
