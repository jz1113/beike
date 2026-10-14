import { useMemo, useState } from 'react';
import type { UsageSummary } from '@client/shared/utils/usageTracker';
import { buildUsageHeatmap, type UsageHeatmapCell } from '../model/usageHeatmap';

type FootprintMetric = 'all' | 'image' | 'video' | 'token';

const METRICS: { id: FootprintMetric; label: string }[] = [
  { id: 'all', label: '创作' },
  { id: 'image', label: '图片' },
  { id: 'video', label: '视频' },
  { id: 'token', label: 'Token' },
];

const LEVELS = ['is-0', 'is-1', 'is-2', 'is-3', 'is-4'];

function metricValue(day: UsageHeatmapCell, metric: FootprintMetric) {
  if (metric === 'image') return day.imageCount;
  if (metric === 'video') return day.videoCount;
  if (metric === 'token') return day.tokens;
  return day.count;
}

function heatLevel(value: number, max: number) {
  if (value <= 0 || max <= 0) return 0;
  const ratio = value / max;
  if (ratio > 0.75) return 4;
  if (ratio > 0.4) return 3;
  if (ratio > 0.15) return 2;
  return 1;
}

function tokenText(value: number) {
  return value > 0 ? value.toLocaleString() : '—';
}

export function UsageHeatmapPanel({ usageSummary }: { usageSummary: UsageSummary }) {
  const [metric, setMetric] = useState<FootprintMetric>('all');
  const [hoveredDay, setHoveredDay] = useState<UsageHeatmapCell | null>(null);
  const [pinnedDay, setPinnedDay] = useState<UsageHeatmapCell | null>(null);
  const weeks = useMemo(
    () => buildUsageHeatmap(usageSummary, 'rolling', new Date().getFullYear()),
    [usageSummary],
  );
  const days = weeks.flatMap(week => week.days).filter(day => !day.isFuture);
  const max = Math.max(0, ...days.map(day => metricValue(day, metric)));
  const activeDays = days.filter(day => metricValue(day, metric) > 0).length;
  const shown = hoveredDay ?? pinnedDay ?? days.find(day => day.isToday) ?? null;

  return (
    <section className="settings-footprint" aria-label="灵感足迹">
      <header>
        <div>
          <h3>灵感足迹 <span>{activeDays} 天留下了灵感</span></h3>
          <p>每一格，都是灵感留下的回声。</p>
        </div>
        <div role="group" aria-label="足迹维度">
          {METRICS.map(item => (
            <button key={item.id} type="button" aria-pressed={metric === item.id} onClick={() => setMetric(item.id)}>{item.label}</button>
          ))}
        </div>
      </header>
      <div className="settings-footprint-scroll">
        <div className="settings-footprint-grid">
          {weeks.map(week => (
            <div key={week.weekIdx}>
              {week.days.map(day => (
                <button
                  key={day.dateKey}
                  type="button"
                  disabled={day.isFuture}
                  aria-label={`${day.dateKey} ${day.dayName}`}
                  className={`${LEVELS[heatLevel(metricValue(day, metric), max)]} ${day.isToday ? 'is-today' : ''} ${shown?.dateKey === day.dateKey ? 'is-selected' : ''}`}
                  onMouseEnter={() => { if (!day.isFuture) setHoveredDay(day); }}
                  onMouseLeave={() => setHoveredDay(null)}
                  onFocus={() => { if (!day.isFuture) setHoveredDay(day); }}
                  onBlur={() => setHoveredDay(null)}
                  onClick={() => setPinnedDay(day)}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="settings-footprint-months">
          {weeks.map(week => <span key={week.weekIdx}>{week.monthLabel || ''}</span>)}
        </div>
      </div>
      <footer>
        <span>{activeDays === 0 ? '第一束灵感，等你点亮' : `累计活跃 ${activeDays} 天`}</span>
        <div className="settings-footprint-scale"><span>少</span>{LEVELS.map(level => <i key={level} className={level} />)}<span>多</span></div>
      </footer>
      <div className="settings-footprint-detail">
        <strong>{shown?.dateKey || '—'}</strong>
        <div>
          <span><b className="is-image" />图片 <em>{shown?.imageCount || 0}</em></span>
          <span><b className="is-video" />视频 <em>{shown?.videoCount || 0}</em></span>
          <span>输入 <em>{tokenText(shown?.promptTokens || 0)}</em></span>
          <span>输出 <em>{tokenText(shown?.completionTokens || 0)}</em> Token</span>
        </div>
      </div>
    </section>
  );
}
