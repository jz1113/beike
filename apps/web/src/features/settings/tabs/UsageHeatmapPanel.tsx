import { useState } from 'react';
import type { UsageSummary } from '@/lib/usageTracker';
import { buildUsageHeatmap } from '../usageHeatmap';

type HeatmapRange = 'year' | 'half_year' | 'quarter';

export function UsageHeatmapPanel({ usageSummary }: { usageSummary: UsageSummary }) {
  const [heatmapRange, setHeatmapRange] = useState<HeatmapRange>('year');
  const [hoveredDay, setHoveredDay] = useState<{
    dateKey: string;
    dayName: string;
    count: number;
    tokens: number;
    costUsd: number;
    costRmb: number;
    isToday: boolean;
    isFuture: boolean;
  } | null>(null);
  const currentYear = new Date().getFullYear();
  const heatmapData = buildUsageHeatmap(
    { heatmapActiveMap: usageSummary.heatmapActiveMap, heatmapDetailsMap: usageSummary.heatmapDetailsMap },
    heatmapRange,
    currentYear,
  );

  return (
    <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-900 text-sm">每日活动热力图</span>
          <div className="flex items-center p-0.5 rounded-lg bg-slate-100 border border-slate-200/70 text-[10.5px]">
            <button type="button" onClick={() => setHeatmapRange('year')} className={`px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer ${heatmapRange === 'year' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'}`}>
              {currentYear} 年度
            </button>
            <button type="button" onClick={() => setHeatmapRange('half_year')} className={`px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer ${heatmapRange === 'half_year' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'}`}>
              近半年
            </button>
            <button type="button" onClick={() => setHeatmapRange('quarter')} className={`px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer ${heatmapRange === 'quarter' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'}`}>
              近 3 个月
            </button>
          </div>
        </div>
        <div className="text-xs text-slate-500 font-mono flex items-center gap-3">
          <span>累计 <strong className="text-slate-900">{usageSummary.activeDays}</strong> 个活跃日</span>
          <span>总调用 <strong className="text-slate-900">{usageSummary.totalRequests}</strong> 次</span>
        </div>
      </div>
      <div className="w-full overflow-x-auto pb-1 no-scrollbar select-none">
        <div className="min-w-[700px] flex gap-2">
          <div className="flex flex-col justify-between pt-5 pb-0.5 text-[9px] font-mono text-slate-400 w-6 shrink-0 text-right pr-1 select-none">
            <span className="h-3 leading-3">周一</span>
            <span className="h-3 leading-3 opacity-0">二</span>
            <span className="h-3 leading-3">周三</span>
            <span className="h-3 leading-3 opacity-0">四</span>
            <span className="h-3 leading-3">周五</span>
            <span className="h-3 leading-3 opacity-0">六</span>
            <span className="h-3 leading-3 opacity-0">日</span>
          </div>
          <div className="flex-1 flex flex-col space-y-1">
            <div className="flex gap-[3px] text-[10px] text-slate-400 font-mono h-4 items-center">
              {heatmapData.map((week, wIdx) => (
                <div key={wIdx} className="flex-1 min-w-[9px] relative h-4">
                  {week.monthLabel ? (
                    <span className="absolute left-0 top-0 whitespace-nowrap font-bold text-slate-500 text-[10px] leading-4 pointer-events-none">{week.monthLabel}</span>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="flex gap-[3px] w-full">
              {heatmapData.map((week, colIdx) => (
                <div key={colIdx} className="flex-1 flex flex-col gap-[3px] min-w-[9px]">
                  {week.days.map((day, rowIdx) => {
                    let bg = 'bg-[#EBEDF0]';
                    if (day.isFuture) bg = 'bg-slate-50/40 border border-dashed border-slate-200/60 opacity-30';
                    else if (day.count > 15) bg = 'bg-[#216E39]';
                    else if (day.count > 5) bg = 'bg-[#30A14E]';
                    else if (day.count > 2) bg = 'bg-[#40C463]';
                    else if (day.count > 0) bg = 'bg-[#9BE9A8]';
                    const isHovered = hoveredDay?.dateKey === day.dateKey;
                    return (
                      <div
                        key={rowIdx}
                        onMouseEnter={() => { if (!day.isFuture) setHoveredDay(day); }}
                        onMouseLeave={() => setHoveredDay(null)}
                        className={`aspect-square w-full rounded-[2.5px] ${bg} ${day.isToday ? 'ring-1.5 ring-indigo-600/90 ring-offset-1' : ''} ${
                          day.isFuture ? 'cursor-not-allowed' : 'cursor-pointer hover:ring-2 hover:ring-slate-900/60 transition-all duration-75 hover:scale-125 hover:z-20'
                        } ${isHovered ? 'ring-2 ring-slate-900 shadow-xs scale-125 z-20' : ''}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between pt-3 mt-1 border-t border-slate-100 text-[11px] text-slate-500 font-mono flex-wrap gap-2">
          <div className="flex items-center gap-2 min-h-[22px]">
            {hoveredDay ? (
              <div className="flex items-center gap-2 text-slate-900 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200/80 animate-fade-in">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-bold">{hoveredDay.dateKey} ({hoveredDay.dayName}{hoveredDay.isToday ? ' · 今天' : ''})</span>
                <span className="text-slate-400">·</span>
                <span className="font-semibold text-emerald-700">{hoveredDay.count} 次真实调用</span>
                {hoveredDay.tokens > 0 && (
                  <>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-700">{hoveredDay.tokens > 10000 ? `${(hoveredDay.tokens / 10000).toFixed(1)}万` : hoveredDay.tokens.toLocaleString()} Token</span>
                  </>
                )}
                {hoveredDay.costUsd > 0 && (
                  <>
                    <span className="text-slate-400">·</span>
                    <span className="font-bold text-indigo-700">{hoveredDay.costUsd.toFixed(2)} 算力 (¥{hoveredDay.costRmb.toFixed(2)})</span>
                  </>
                )}
              </div>
            ) : (
              <span className="text-slate-400 text-[10.5px]">💡 提示：鼠标移入方格可即时透视指定日期的真实模型调用与算力消耗</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0 ml-auto text-[10.5px] text-slate-400">
            <span>少</span>
            <div className="w-2.5 h-2.5 rounded-[2px] bg-[#EBEDF0]" title="0 次调用" />
            <div className="w-2.5 h-2.5 rounded-[2px] bg-[#9BE9A8]" title="1 - 2 次调用" />
            <div className="w-2.5 h-2.5 rounded-[2px] bg-[#40C463]" title="3 - 5 次调用" />
            <div className="w-2.5 h-2.5 rounded-[2px] bg-[#30A14E]" title="6 - 15 次调用" />
            <div className="w-2.5 h-2.5 rounded-[2px] bg-[#216E39]" title=">15 次调用" />
            <span>多</span>
          </div>
        </div>
      </div>
    </div>
  );
}
